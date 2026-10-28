import { beforeEach, describe, expect, it } from 'vitest'
import type { Attempt, Change, Txn } from '@/api/schema'
import { deriveAuditEvents } from './audit'
import { mockDb } from './db'

const rec = (id: number) => mockDb.requests.find((r) => r.id === id)!
const forRequest = (id: number) => deriveAuditEvents('admin').filter((e) => e.request?.id === id)

/** Appends a version to request `id`; `edit` mutates the cloned rows so the payload matches `changes`. */
function addVersion(id: number, changes: Change[], edit: (rows: Txn[]) => void = () => {}) {
  const r = rec(id)
  const last = r.versions[r.versions.length - 1]
  const payload = structuredClone(last.payload)
  edit(payload.transactions as Txn[])
  const number = last.number + 1
  r.versions.push({
    number,
    created: { utc: '2026-10-28T09:00:00Z', by: { id: 'u-editor', name: 'Eli Editor' } },
    note: null,
    changeCount: changes.length,
    payload,
    changes,
  })
  return number
}

beforeEach(() => mockDb.reset())

describe('deriveAuditEvents', () => {
  it('expands a replace on a row field into one row-edited event with field, old, new, row.externalId', () => {
    const v = addVersion(1, [{ op: 'replace', path: '$.transactions[2].payee', old: 'A', new: 'B' }])
    const e = forRequest(1).find((x) => x.id === `v1.${v}-0`)!
    expect(e).toMatchObject({
      action: 'row-edited',
      field: 'payee',
      old: 'A',
      new: 'B',
      versionNumber: v,
      row: { externalId: 'row-3', index: 2 },
      actor: { id: 'u-editor', kind: 'user' },
      request: { id: 1, publicRef: 'SR-000001', reference: 'chase-4521-2026-08' },
    })
  })

  it('maps $.transactions[i].post false to row-post-off, true to row-post-on', () => {
    const v = addVersion(1, [
      { op: 'replace', path: '$.transactions[0].post', old: undefined, new: false },
      { op: 'replace', path: '$.transactions[1].post', old: false, new: true },
    ])
    const byId = new Map(forRequest(1).map((e) => [e.id, e]))
    expect(byId.get(`v1.${v}-0`)).toMatchObject({ action: 'row-post-off', field: 'post', new: false })
    expect(byId.get(`v1.${v}-1`)).toMatchObject({ action: 'row-post-on', field: 'post', old: false, new: true })
  })

  it('maps add/remove on $.transactions[i] to row-added / row-deleted with the whole row as new / old', () => {
    const rows = rec(1).versions[rec(1).versions.length - 1].payload.transactions as Txn[]
    const gone = rows[11]
    const added: Txn = { externalId: 'dash-1', kind: 'Deposit', amount: 5 }
    const v = addVersion(
      1,
      [
        { op: 'remove', path: '$.transactions[11]', old: gone },
        { op: 'add', path: '$.transactions[11]', new: added },
      ],
      (r) => r.splice(11, 1, added),
    )
    const byId = new Map(forRequest(1).map((e) => [e.id, e]))
    expect(byId.get(`v1.${v}-0`)).toMatchObject({ action: 'row-deleted', old: gone, new: null, row: { externalId: gone.externalId, index: 11 } })
    expect(byId.get(`v1.${v}-1`)).toMatchObject({ action: 'row-added', new: added, old: null, row: { externalId: 'dash-1', index: 11 } })
  })

  it('maps $.controlTotal replace to control-total-changed', () => {
    const e = forRequest(1).find((x) => x.action === 'control-total-changed')!
    expect(e).toMatchObject({ field: 'controlTotal', versionNumber: 3, row: null })
    expect(typeof e.old).toBe('number')
    expect(typeof e.new).toBe('number')
  })

  it('created event becomes received, with actor.kind api-client for n8n', () => {
    const e = forRequest(1).find((x) => x.action === 'received')!
    expect(e.actor).toEqual({ id: 'api-client:n8n-mailbox', name: 'n8n-mailbox', kind: 'api-client' })
    expect(e.request).toMatchObject({ pushId: '7f3a9c1e-5b2d-4e6a-9d10-3c8b1a2e4f01', emailSubject: 'Chase statement – Aug 2026' })
  })

  it('posted attempt becomes posted; held/refused/failed/unknown attempts become post-failed with detail.outcome', () => {
    const att = (id: number, outcome: Attempt['outcome']): Attempt => ({
      id,
      versionNumber: 3,
      outcome,
      httpStatus: null,
      postId: null,
      counts: null,
      error: null,
      startedUtc: '2026-10-28T10:00:00Z',
      finishedUtc: '2026-10-28T10:00:05Z',
      startedBy: { id: 'u-admin', name: 'Asha K' },
    })
    rec(1).attempts = [att(1, 'posted'), att(2, 'held'), att(3, 'refused'), att(4, 'failed'), att(5, 'unknown'), att(6, 'in-progress')]
    const events = forRequest(1).filter((e) => e.id.startsWith('p1-'))
    expect(events.map((e) => [e.action, e.detail?.outcome]).sort()).toEqual([
      ['post-failed', 'failed'],
      ['post-failed', 'held'],
      ['post-failed', 'refused'],
      ['post-failed', 'unknown'],
      ['posted', 'posted'],
    ])
  })

  it('user audit rows appear only for admin viewers', () => {
    mockDb.userAudit['u-editor'] = [
      { id: 7, kind: 'role-changed', actor: { id: 'u-admin', name: 'Asha K' }, detail: { from: 'viewer', to: 'editor' }, atUtc: '2026-10-28T11:00:00Z' },
    ]
    const admin = deriveAuditEvents('admin').find((e) => e.id === 'u7')!
    expect(admin).toMatchObject({ action: 'user-role-changed', request: null, row: null, detail: { from: 'viewer', to: 'editor', userId: 'u-editor' } })
    for (const role of ['editor', 'viewer'] as const) {
      expect(deriveAuditEvents(role).some((e) => e.action.startsWith('user-'))).toBe(false)
    }
  })

  it('ids are stable across two calls and sorted atUtc desc, id desc', () => {
    const a = deriveAuditEvents('admin')
    const b = deriveAuditEvents('admin')
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id))
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length)
    for (let i = 1; i < a.length; i++) {
      const [p, c] = [a[i - 1], a[i]]
      expect(p.atUtc > c.atUtc || (p.atUtc === c.atUtc && p.id > c.id)).toBe(true)
    }
  })
})
