import { beforeEach, describe, expect, it } from 'vitest'
import type { AuditEvent, Page } from '@/api/schema'
import { mockControl, mockDb } from '@/mocks/db'
import { csvCell } from './audit'

const API = '/api/v1'
let token = ''
const get = (path: string, as = token) => fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${as}` } })
const feed = async (qs = '') => (await (await get(`/audit-events?${qs}`)).json()) as Page<AuditEvent>

beforeEach(() => {
  mockDb.reset()
  token = mockControl.signInAs('u-admin')
})

describe('GET /audit-events', () => {
  it('filters by actor, action (repeatable), requestId, reference, pushId, from/to, q over old/new/field', async () => {
    expect((await feed('pageSize=200')).total).toBeGreaterThan(10)

    const n8n = await feed('actor=api-client:n8n-mailbox&pageSize=200')
    expect(n8n.items.length).toBeGreaterThan(0)
    expect(n8n.items.every((e) => e.actor.id === 'api-client:n8n-mailbox')).toBe(true)

    const two = await feed('action=received&action=control-total-changed&pageSize=200')
    expect(new Set(two.items.map((e) => e.action))).toEqual(new Set(['received', 'control-total-changed']))

    const one = await feed('requestId=1&pageSize=200')
    expect(one.total).toBe(4)
    expect(one.items.every((e) => e.request?.id === 1)).toBe(true)

    const byRef = await feed('reference=chase-4521-2026-08&pageSize=200')
    expect(byRef.items.every((e) => e.request?.reference === 'chase-4521-2026-08')).toBe(true)
    expect(byRef.items.filter((e) => e.request?.id === 1)).toHaveLength(4)
    expect((await feed('pushId=7f3a9c1e-5b2d-4e6a-9d10-3c8b1a2e4f01')).total).toBe(4)

    const range = await feed('from=2026-10-27T08:00:00Z&to=2026-10-27T08:00:00Z&requestId=1')
    expect(range.items.map((e) => e.id)).toEqual(['v1.2-0'])

    expect((await feed('q=abc plumbing&requestId=1')).items.map((e) => e.id)).toEqual(['v1.2-0'])
    expect((await feed('q=PAYEE&requestId=1')).items.map((e) => e.field)).toEqual(['payee'])
  })

  it('pushId matches a prefix, with or without dashes', async () => {
    expect((await feed('pushId=7f3a9c1e-5b2d')).total).toBe(4)
    expect((await feed('pushId=7F3A9C1E5B')).total).toBe(4)
    expect((await feed('pushId=ffff')).total).toBe(0)
  })

  it('posted events carry postedCount and postId; user events carry email, displayName and role', async () => {
    const posted = (await feed('action=posted&pageSize=200')).items
    expect(posted.length).toBeGreaterThan(0)
    expect(posted.every((e) => typeof e.detail?.postedCount === 'number' && e.detail?.postId)).toBe(true)
    mockDb.userAudit['u-editor'] = [{ id: 1, kind: 'created', actor: { id: 'u-admin', name: 'Asha K' }, detail: null, atUtc: '2026-10-28T11:00:00Z' }]
    const ev = (await feed('action=user-created')).items[0]
    expect(ev.detail).toMatchObject({ userId: 'u-editor', email: 'eli@example.com', displayName: 'Eli Editor', role: 'editor' })
  })

  it('pages 50 by default, rejects pageSize > 200 with 400', async () => {
    const page = await feed()
    expect(page.pageSize).toBe(50)
    expect(page.items.length).toBe(Math.min(50, page.total))
    expect((await get('/audit-events?pageSize=201')).status).toBe(400)
    expect((await get('/audit-events?action=nope')).status).toBe(400)
  })

  it('shows user events to admins only, while every role with requests:read can read the feed', async () => {
    mockDb.userAudit['u-editor'] = [{ id: 1, kind: 'unlocked', actor: { id: 'u-admin', name: 'Asha K' }, detail: null, atUtc: '2026-10-28T11:00:00Z' }]
    expect((await feed('action=user-unlocked')).total).toBe(1)
    const viewer = mockControl.signInAs('u-viewer')
    const res = await get('/audit-events?action=user-unlocked', viewer)
    expect(res.status).toBe(200)
    expect(((await res.json()) as Page<AuditEvent>).total).toBe(0)
    expect((await get('/audit-events', 'bad')).status).toBe(401)
  })
})

describe('GET /audit-events.csv', () => {
  it('has a header row and applies the filters', async () => {
    const res = await get('/audit-events.csv?requestId=1&action=received')
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const lines = (await res.text()).trim().split('\r\n')
    expect(lines[0]).toBe('time (UTC),actor,action,reference,push id,SR ref,row,field,old,new')
    expect(lines).toEqual([
      lines[0],
      '2026-10-27T07:12:50Z,n8n-mailbox,received,chase-4521-2026-08,7f3a9c1e-5b2d-4e6a-9d10-3c8b1a2e4f01,SR-000001,,,,',
    ])
  })

  it("prefixes a value starting with = + - @ with '", async () => {
    for (const v of ['=cmd|x', '+1', '-1', '@SUM(A1)']) expect(csvCell(v)).toBe(`'${v}`)
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')

    mockDb.requests[0].versions[1].changes[0] = { op: 'replace', path: '$.transactions[4].memo', old: 'x', new: '=HYPERLINK("http://e")' }
    const body = await (await get('/audit-events.csv?requestId=1&action=row-edited')).text()
    expect(body).toContain(`"'=HYPERLINK(""http://e"")"`)
  })

  it('rejects bad filters with 400', async () => {
    expect((await get('/audit-events.csv?from=yesterday')).status).toBe(400)
  })
})
