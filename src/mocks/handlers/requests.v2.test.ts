import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import type { Page, RequestDetail, RequestSummary, Stats, Txn } from '@/api/schema'

const API = '/api/v2'
let token = ''

const call = (path: string, init: RequestInit = {}) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
const list = async (qs = '') => ((await (await call(`/saved-requests?pageSize=100&${qs}`)).json()) as Page<RequestSummary>).items
const detail = async (id: number) => {
  const res = await call(`/saved-requests/${id}`)
  return { body: (await res.json()) as RequestDetail, etag: res.headers.get('ETag')! }
}
const put = (id: number, etag: string, payload: unknown) =>
  call(`/saved-requests/${id}`, { method: 'PUT', headers: { 'If-Match': etag }, body: JSON.stringify({ payload }) })
const UUID = /^[0-9a-f-]{36}$/
const NEW_UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

beforeEach(() => {
  token = mockControl.signInAs('u-admin')
})
afterEach(() => {
  vi.useRealTimers()
})

describe('list summaries (R-5, R-8)', () => {
  it('list rows carry pushId, historyCount, validationSummary, postSummary, skipCount', async () => {
    const rows = await list()
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const r of rows) {
      if (r.id === 12) expect(r.pushId).toBeNull()
      else expect(r.pushId).toMatch(UUID)
    }
    expect(new Set(rows.map((r) => r.pushId).filter(Boolean)).size).toBe(rows.length - 1)

    // posted: postSummary matches the attempt; pending: null
    expect(byId.get(7)!.postSummary).toMatchObject({ postId: 'api-savings-1177-2026-07', postedCount: 8, postedBy: { id: 'u-admin' } })
    expect(byId.get(7)!.postSummary!.postedUtc).toBe('2026-10-20T09:00:41Z')
    expect(byId.get(9)!.postSummary).toMatchObject({ postedCount: 4 })
    expect(byId.get(1)!.postSummary).toBeNull()

    // problemCount = findings + errors of the snapshot
    expect(byId.get(2)!.validationSummary).toMatchObject({ state: 'refused', problemCount: 3 + 1 })
    expect(byId.get(1)!.validationSummary).toMatchObject({ state: 'ok', problemCount: 0, versionNumber: 3 })
    expect(byId.get(3)!.validationSummary.problemCount).toBeGreaterThan(0)

    // history = audit events of request 1, counted by hand from the fixture:
    // received (1) + version 2 payee fix (1) + version 3 amount on row 5 and control total (2)
    expect(byId.get(1)!.historyCount).toBe(4)

    expect(byId.get(1)!.skipCount).toBe(0)
    expect(byId.get(12)!.skipCount).toBe(1)
  })

  it('a request that was never validated has state none and 0 problems', async () => {
    const rec = mockDb.requests.find((r) => r.id === 1)!
    delete rec.validation.validatedUtc
    delete rec.validation.versionNumber
    const row = (await list()).find((r) => r.id === 1)!
    expect(row.validationSummary).toEqual({ state: 'none', problemCount: 0, validatedUtc: null, versionNumber: null })
  })

  it('q matches the push id by prefix, with or without dashes, case-insensitively', async () => {
    const pushId = (await list()).find((r) => r.id === 1)!.pushId!
    for (const q of [pushId.slice(0, 8), pushId.slice(0, 8).toUpperCase(), pushId.replace(/-/g, '').slice(0, 13)]) {
      expect((await list(`q=${q}`)).map((r) => r.id)).toEqual([1])
    }
  })
})

describe('list filters (R-8)', () => {
  it('filters: emailFrom, reference, minTotal/maxTotal inclusive, hasErrors, sort=-total', async () => {
    expect((await list('emailFrom=ZEMENBANK')).map((r) => r.id)).toEqual([2])

    const refs = await list('reference=savings-1177-2026-08')
    expect(refs.map((r) => r.id).sort((a, b) => a - b)).toEqual([11, 13])
    expect(await list('reference=savings-1177')).toEqual([])

    const all = await list()
    const total = all.find((r) => r.id === 7)!.controlTotal!
    const inclusive = await list(`minTotal=${total}&maxTotal=${total}`)
    expect(inclusive.map((r) => r.id)).toContain(7)
    expect(inclusive.every((r) => r.controlTotal === total)).toBe(true)
    const above = await list(`minTotal=${total}`)
    expect(above.length).toBe(all.filter((r) => r.controlTotal !== null && r.controlTotal >= total).length)

    const errs = await list('hasErrors=true')
    const bad = all.filter((r) => r.validationSummary.problemCount > 0 || r.needsAttention)
    expect(errs.map((r) => r.id).sort()).toEqual(bad.map((r) => r.id).sort())
    expect(errs.map((r) => r.id)).toContain(2)
    expect(errs.map((r) => r.id)).not.toContain(1)

    const desc = (await list('sort=-total')).map((r) => r.controlTotal ?? 0)
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
    const rowsAsc = (await list('sort=rows')).map((r) => r.transactionCount)
    expect(rowsAsc).toEqual([...rowsAsc].sort((a, b) => a - b))
    expect((await list('sort=-rows')).map((r) => r.transactionCount)).toEqual([...rowsAsc].reverse())
  })

  it('rejects non-numeric totals and flags with 400', async () => {
    expect((await call('/saved-requests?minTotal=abc')).status).toBe(400)
    expect((await call('/saved-requests?hasErrors=maybe')).status).toBe(400)
  })

  it('stats.hasErrors counts pending and all with problemCount > 0 or needsAttention', async () => {
    const bad = (await list()).filter((r) => r.validationSummary.problemCount > 0 || r.needsAttention)
    const stats = (await (await call('/saved-requests/stats')).json()) as Stats
    expect(stats.hasErrors.all).toBe(bad.length)
    expect(stats.hasErrors.pending).toBe(bad.filter((r) => r.status === 'pending').length)
    expect(stats.hasErrors.pending).toBeGreaterThan(0)
  })
})

describe('otherUnpostedPushes (R-8.5)', () => {
  it('lists the other pending push with the same reference, not itself, not posted/discarded ones', async () => {
    const eleven = (await detail(11)).body
    expect(eleven.otherUnpostedPushes).toEqual([expect.objectContaining({ id: 13, publicRef: 'SR-000013', status: 'pending' })])
    expect(eleven.otherUnpostedPushes[0].pushId).toMatch(UUID)
    expect(eleven.otherUnpostedPushes[0].receivedUtc).toBeTruthy()
    expect((await detail(13)).body.otherUnpostedPushes.map((p) => p.id)).toEqual([11])

    const other = mockDb.requests.find((r) => r.id === 13)!
    other.status = 'discarded'
    expect((await detail(11)).body.otherUnpostedPushes).toEqual([])
    other.status = 'posted'
    expect((await detail(11)).body.otherUnpostedPushes).toEqual([])
    other.status = 'partial'
    expect((await detail(11)).body.otherUnpostedPushes.map((p) => p.id)).toEqual([13])

    expect((await detail(2)).body.otherUnpostedPushes).toEqual([])
    expect((await list())[0]).not.toHaveProperty('otherUnpostedPushes')
  })
})

describe('POST /saved-requests (R-5, R-6)', () => {
  const save = (body: unknown) => call('/saved-requests', { method: 'POST', body: JSON.stringify(body) })
  const rows = (): Txn[] => [
    { kind: 'Check', date: '2026-08-03', amount: 10, account: 'Chase Checking 4521', payee: 'ABC Plumbing', lineAccount: 'Utilities' },
    { externalId: 'kept', kind: 'Check', date: '2026-08-04', amount: 5.5, account: 'Chase Checking 4521', payee: 'ABC Plumbing', lineAccount: 'Utilities' },
    { kind: 'Check', date: '2026-08-05', amount: 1, account: 'Chase Checking 4521', payee: 'ABC Plumbing', lineAccount: 'Utilities' },
  ]

  it('save with an existing pushId returns the existing request with 200', async () => {
    const existing = (await list()).find((r) => r.id === 1)!
    const res = await save({ pushId: existing.pushId, reference: 'something-else', controlTotal: 1, transactions: [] })
    expect(res.status).toBe(200)
    expect(((await res.json()) as RequestDetail).id).toBe(1)
    expect(mockDb.requests).toHaveLength(13)

    const created = await save({ pushId: NEW_UUID, reference: 'fresh', controlTotal: 16.5, transactions: rows() })
    expect(created.status).toBe(201)
    const body = (await created.json()) as RequestDetail
    expect(body.pushId).toBe(NEW_UUID)
    const again = await save({ pushId: NEW_UUID.toUpperCase(), reference: 'fresh', controlTotal: 16.5, transactions: rows() })
    expect(again.status).toBe(200)
    expect(((await again.json()) as RequestDetail).id).toBe(body.id)
    expect(mockDb.requests).toHaveLength(14)
  })

  it('save assigns row-<n> externalIds to rows without one, in version 1', async () => {
    const res = await save({ pushId: NEW_UUID, reference: 'fresh', controlTotal: 16.5, transactions: rows() })
    const body = (await res.json()) as RequestDetail
    expect((body.payload.transactions as Txn[]).map((r) => r.externalId)).toEqual(['row-1', 'kept', 'row-3'])
    const v1 = (await (await call(`/saved-requests/${body.id}/versions/1`)).json()) as { payload: { transactions: Txn[] } }
    expect(v1.payload.transactions.map((r) => r.externalId)).toEqual(['row-1', 'kept', 'row-3'])
    // the bytes received stay untouched
    const original = JSON.parse(await (await call(`/saved-requests/${body.id}/original`)).text()) as { transactions: Txn[] }
    expect(original.transactions[0]).not.toHaveProperty('externalId')

    // adding a row later is one `add`, not a change on every later row
    const payload = structuredClone(body.payload) as { transactions: Txn[] }
    payload.transactions.splice(1, 0, { externalId: 'dash-1', kind: 'Check', date: '2026-08-06', amount: 2, account: 'Chase Checking 4521' })
    expect((await put(body.id, res.headers.get('ETag')!, payload)).status).toBe(200)
    const v2 = (await (await call(`/saved-requests/${body.id}/versions/2`)).json()) as { changes: { op: string }[] }
    expect(v2.changes.map((c) => c.op)).toEqual(['add'])
  })

  it('a malformed pushId still saves, leaves the column null and flags needsAttention', async () => {
    const res = await save({ pushId: 'not-a-guid', reference: 'fresh', controlTotal: 16.5, transactions: rows() })
    expect(res.status).toBe(201)
    const body = (await res.json()) as RequestDetail
    expect(body.pushId).toBeNull()
    expect(body.needsAttention).toBe(true)
    expect(body.readErrors).toContain('$.pushId: not a UUID')
  })

  it('edits never change the push id and it is not in the change list', async () => {
    const created = await save({ pushId: NEW_UUID, reference: 'fresh', controlTotal: 16.5, transactions: rows() })
    const body = (await created.json()) as RequestDetail
    const payload = { ...structuredClone(body.payload), pushId: '11111111-1111-4111-8111-111111111111' }
    const next = (await (await put(body.id, created.headers.get('ETag')!, payload)).json()) as RequestDetail
    expect(next.pushId).toBe(NEW_UUID)
    expect(next.currentVersion).toBe(1)
  })
})

describe("don't post rows (R-6)", () => {
  const post = (id: number) => call(`/saved-requests/${id}/post`, { method: 'POST', body: '{}' })

  it('post sends post:false rows as Skip: they count toward controlTotal and come back under counts.skipped', async () => {
    const before = (await detail(12)).body
    const sum = (before.payload.transactions as Txn[]).reduce((s, r) => s + Math.round(r.amount! * 100), 0)
    expect(Math.round(before.controlTotal! * 100)).toBe(sum) // the skipped row is part of the control total
    expect(before.skipCount).toBe(1)
    expect(before.validationSummary.state).toBe('ok')

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const pending = post(12)
    await vi.waitFor(() => expect(mockDb.requests.find((r) => r.id === 12)!.status).toBe('posting'))
    await vi.advanceTimersByTimeAsync(1500)
    const res = await pending
    expect(res.status).toBe(200)
    const body = (await res.json()) as { counts: Record<string, number>; posted: { externalId: string }[] }
    expect(body.counts).toMatchObject({ submitted: 4, posted: 3, skipped: 1, held: 0 })
    expect(body.posted).toHaveLength(3)
    const skippedId = (before.payload.transactions as Txn[]).find((r) => r.post === false)!.externalId
    expect(body.posted.map((p) => p.externalId)).not.toContain(skippedId)
    vi.useRealTimers()

    const after = (await detail(12)).body
    expect(after.status).toBe('posted')
    // the stored payload keeps the real kind
    expect((after.payload.transactions as Txn[]).find((r) => r.post === false)!.kind).not.toBe('Skip')
    expect(after.postSummary).toMatchObject({ postedCount: 3 })
  })

  it('post with every row post:false -> 400 nothing-to-post', async () => {
    const { body, etag } = await detail(1)
    const payload = structuredClone(body.payload) as { transactions: Txn[] }
    payload.transactions.forEach((r) => (r.post = false))
    expect((await put(1, etag, payload)).status).toBe(200)
    const res = await post(1)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('nothing-to-post')
    const after = (await detail(1)).body
    expect(after.status).toBe('pending')
    expect(after.lastAttempt).toBeNull()
  })

  it('a version whose only change is post:true -> missing is not a change', async () => {
    const { body, etag } = await detail(1)
    const withTrue = structuredClone(body.payload) as { transactions: Txn[] }
    withTrue.transactions[0].post = true
    const next = (await (await put(1, etag, withTrue)).json()) as RequestDetail
    expect(next.currentVersion).toBe(body.currentVersion)
    expect(next.rowVersion).toBe(body.rowVersion)

    // true -> false is a change, reported as old true / new false
    const off = structuredClone(body.payload) as { transactions: Txn[] }
    off.transactions[0].post = false
    const v = (await (await put(1, etag, off)).json()) as RequestDetail
    expect(v.currentVersion).toBe(body.currentVersion + 1)
    const version = (await (await call(`/saved-requests/1/versions/${v.currentVersion}`)).json()) as { changes: unknown[] }
    expect(version.changes).toEqual([{ op: 'replace', path: '$.transactions[0].post', old: true, new: false }])
    expect(v.skipCount).toBe(1)
    expect(v.validationSummary.state).toBe('ok')
  })
})
