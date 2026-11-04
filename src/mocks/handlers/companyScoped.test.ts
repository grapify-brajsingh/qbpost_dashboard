import { beforeEach, describe, expect, it } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import type {
  AuditEvent,
  DashboardSummary,
  Extraction,
  Page,
  QbListSyncRun,
  QbListsResponse,
  RequestDetail,
  RequestSummary,
  Stats,
} from '@/api/schema'

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
const record = (id: number) => mockDb.requests.find((r) => r.id === id)!
const setCompany = (id: number, etag: string | null, companyId: unknown) =>
  call(`/saved-requests/${id}/company`, {
    method: 'POST',
    headers: etag === null ? {} : { 'If-Match': etag },
    body: JSON.stringify({ companyId }),
  })
const audit = async (qs = '') => ((await (await call(`/audit-events?pageSize=200${qs}`)).json()) as Page<AuditEvent>).items

async function extract(name = 'chase-sep-2026.pdf'): Promise<Extraction> {
  const form = new FormData()
  form.append('file', new File(['%PDF-1.4\n% mock\n'], name, { type: 'application/pdf' }), name)
  const res = await fetch(`${API}/statement-extractions`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  return (await res.json()) as Extraction
}
const saveUpload = (x: Extraction, upload: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  call('/saved-requests', {
    method: 'POST',
    body: JSON.stringify({
      upload: { extractionId: x.extractionId, ...upload },
      reference: 'chase-sep-2026',
      controlTotal: 6249.02,
      transactions: x.payload.transactions,
      ...extra,
    }),
  })

beforeEach(() => {
  token = mockControl.signInAs('u-admin')
})

describe('company on statements (R-19)', () => {
  it('rows carry company and companySource; 14 has none and offers set-company without validate or post', async () => {
    const rows = await list()
    expect(rows.find((r) => r.id === 1)).toMatchObject({
      company: { id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' },
      companySource: 'migrated',
    })
    const { body } = await detail(14)
    expect(body.company).toBeNull()
    expect(body.companyMatch).toMatchObject({ match: 'none', printedName: 'SA CONVENIENCE MARKET' })
    expect(body.allowedActions).toEqual(['edit', 'discard', 'set-company'])
  })

  it('stats and the list refuse a company that is neither an id nor none (400)', async () => {
    expect((await call('/saved-requests/stats?company=abc')).status).toBe(400)
    expect((await call('/saved-requests?company=0')).status).toBe(400)
    expect((await call('/saved-requests/stats?company=99')).status).toBe(200)
  })

  it('filters by company=2 and company=none; stats count needsCompany', async () => {
    expect((await list('company=2')).map((r) => r.id)).toEqual([7])
    expect((await list('company=none')).map((r) => r.id)).toEqual([14])
    const stats = (await (await call('/saved-requests/stats?company=none')).json()) as Stats
    expect(stats.needsCompany).toBe(1)
    expect((await call('/saved-requests?company=abc')).status).toBe(400)
  })

  it('validate and post answer 409 company-required without a company', async () => {
    for (const path of ['/saved-requests/14/validate', '/saved-requests/14/post']) {
      const res = await call(path, { method: 'POST', body: '{}' })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ status: 409, code: 'company-required' })
    }
  })

  it('a statement of a company that is not approved gets 409 company-not-ready with state and access', async () => {
    record(2).companyId = 2
    const res = await call('/saved-requests/2/validate', { method: 'POST' })
    expect(await res.json()).toMatchObject({ status: 409, code: 'company-not-ready', state: 'active', access: 'needs-approval' })
    const post = await call('/saved-requests/2/post', { method: 'POST', body: '{}' })
    expect(await post.json()).toMatchObject({ code: 'company-not-ready' })
  })

  it('POST /company assigns, clears validation, records company-assigned, and then validate is allowed', async () => {
    const { etag } = await detail(14)
    const res = await setCompany(14, etag, 1)
    const body = (await res.json()) as RequestDetail
    expect(body).toMatchObject({ company: { id: 1 }, companySource: 'chosen', validationSummary: { state: 'none' } })
    // As the live API (R-19.4, found in the 2026-11-04 integration run): the cleared validation is null, on the list too.
    expect(body.validation).toBeNull()
    const list = (await (await call('/saved-requests?company=1&pageSize=100')).json()) as { items: { id: number; validation: unknown }[] }
    expect(list.items.find((i) => i.id === 14)?.validation).toBeNull()
    expect(body.allowedActions).toContain('validate')
    expect(record(14).events[record(14).events.length - 1]).toMatchObject({ kind: 'company-assigned', detail: { companyId: 1, from: null, to: { id: 1 }, source: 'chosen' } })
    expect(res.headers.get('ETag')).toBe(`"${record(14).rowVersion}"`)
    expect(record(14).rowVersion).toBe(Number(etag.replace(/"/g, '')) + 1)
  })

  it('POST /company: 428 without If-Match, 412 stale, 400 for a missing company (id 4), 409 when not pending', async () => {
    const { etag } = await detail(14)
    expect((await setCompany(14, null, 1)).status).toBe(428)
    expect((await setCompany(14, '"99"', 1)).status).toBe(412)
    const missing = await setCompany(14, etag, 4)
    expect(missing.status).toBe(400)
    expect(await missing.json()).toMatchObject({ code: 'invalid-request' })
    expect((await setCompany(14, etag, 99)).status).toBe(400)
    expect((await setCompany(14, etag, 0)).status).toBe(400)
    expect((await setCompany(7, '"3"', 1)).status).toBe(409)
    expect(record(14).companyId).toBeNull()
    // an ambiguous company (no file chosen yet) can be given to a statement, as on the API (M17 4.6)
    expect((await setCompany(14, etag, 3)).status).toBe(200)
  })

  it('a post while another company file is open is refused with both files and an unavailable attempt, never retried', async () => {
    mockControl.companyOpenElsewhere = 'S & A Convenience Market LLC.qbw'
    const { etag } = await detail(1)
    const before = record(1).attempts.length
    const res = await call('/saved-requests/1/post', { method: 'POST', headers: { 'If-Match': etag }, body: '{}' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      code: 'company-file-open-elsewhere',
      openFile: 'S & A Convenience Market LLC.qbw',
      neededFile: 'Takoma Park Grocery Store Inc.qbw',
    })
    expect(record(1).attempts).toHaveLength(before + 1)
    expect(record(1).attempts[record(1).attempts.length - 1].outcome).toBe('unavailable')
    expect(record(1).status).toBe('pending')
  })
})

describe('upload and extraction (R-19.5, R-20.1)', () => {
  it('the extraction carries company from nextMatch once, then none', async () => {
    mockControl.nextMatch = { match: 'matched', printedName: 'S & A CONVENIENCE', dbaName: null, companyId: 2, candidates: [] }
    expect((await extract()).company).toMatchObject({ match: 'matched', companyId: 2 })
    expect((await extract()).company).toEqual({ match: 'none', printedName: null, dbaName: null, companyId: null, candidates: [] })
  })

  it('a saved upload takes the sent companyId as chosen and keeps it out of the payload', async () => {
    mockControl.nextMatch = { match: 'matched', printedName: 'TAKOMA', dbaName: null, companyId: 1, candidates: [] }
    const x = await extract()
    const res = await saveUpload(x, { companyId: 2 }, { companyId: 3 })
    expect(res.status).toBe(201)
    const body = (await res.json()) as RequestDetail
    expect(body.company?.id).toBe(2)
    expect(body.companySource).toBe('chosen')
    expect(body.companyMatch).toMatchObject({ match: 'matched', printedName: 'TAKOMA' })
    expect(body.companyMatch).not.toHaveProperty('companyId')
    for (const v of record(body.id).versions) expect(JSON.stringify(v.payload)).not.toContain('companyId')
    expect(JSON.stringify(body.payload)).not.toContain('companyId')
  })

  it('a matched extraction saved without companyId gets the match as matched; none saves company null', async () => {
    mockControl.nextMatch = { match: 'matched', printedName: 'S & A', dbaName: null, companyId: 2, candidates: [] }
    const matched = (await (await saveUpload(await extract())).json()) as RequestDetail
    expect(matched).toMatchObject({ company: { id: 2 }, companySource: 'matched' })
    const none = (await (await saveUpload(await extract('other.pdf'))).json()) as RequestDetail
    expect(none.company).toBeNull()
    expect(none.companySource).toBeNull()
    expect(none.allowedActions).toEqual(['edit', 'discard', 'set-company'])
  })

  it('an upload takes the only active company as default over the match; a bad or unassignable companyId is 400', async () => {
    mockControl.nextMatch = { match: 'matched', printedName: 'S & A', dbaName: null, companyId: 2, candidates: [] }
    const x = await extract()
    expect((await saveUpload(x, { companyId: 99 })).status).toBe(400)
    expect((await saveUpload(x, { companyId: 4 })).status).toBe(400)
    expect((await saveUpload(x, { companyId: 'two' })).status).toBe(400)
    mockDb.companies = mockDb.companies.filter((c) => c.id === 1)
    const body = (await (await saveUpload(x)).json()) as RequestDetail
    expect(body).toMatchObject({ company: { id: 1 }, companySource: 'default' })
  })

  it('the saved match lists its candidates as company ids, not references (M17 5.2)', async () => {
    const ref = (id: number) => ({ id, code: String(id), displayName: `Company ${id}` })
    mockControl.nextMatch = { match: 'ambiguous', printedName: 'S', dbaName: null, companyId: null, candidates: [ref(2), ref(1)] }
    const body = (await (await saveUpload(await extract())).json()) as RequestDetail
    expect(body.companyMatch?.candidates).toEqual([2, 1])
  })

  it('an n8n push takes the only active company as default, and none when several are active', async () => {
    const push = (ref: string) =>
      call('/saved-requests', { method: 'POST', body: JSON.stringify({ reference: ref, controlTotal: 0, transactions: [] }) })
    const many = (await (await push('multi-1')).json()) as RequestDetail
    expect(many.company).toBeNull()
    mockDb.companies = mockDb.companies.filter((c) => c.id === 1)
    const one = (await (await push('solo-1')).json()) as RequestDetail
    expect(one).toMatchObject({ company: { id: 1 }, companySource: 'default' })
  })
})

describe('company-scoped lists, summary and audit (R-20)', () => {
  it('company=2 lists differ from the default; a sync of 2 is 409 company-not-ready; a sync of 1 leaves 2 untouched', async () => {
    const two = (await (await call('/quickbooks/lists?company=2')).json()) as QbListsResponse
    expect(two.vendors).toContain('Coastal Beverage Supply')
    const one = (await (await call('/quickbooks/lists')).json()) as QbListsResponse
    expect(one.vendors).not.toContain('Coastal Beverage Supply')
    // M17 5.3: an unknown id on lists and sync is a 400 (never the default company); the history is an empty page
    expect((await call('/quickbooks/lists?company=99')).status).toBe(400)
    expect((await call('/quickbooks/lists?company=abc')).status).toBe(400)
    expect((await call('/quickbooks/lists/sync?company=99', { method: 'POST' })).status).toBe(400)
    expect(await (await call('/quickbooks/lists/syncs?company=99')).json()).toMatchObject({ items: [], total: 0 })
    expect((await call('/quickbooks/lists/syncs?company=abc')).status).toBe(400)
    const notReady = await call('/quickbooks/lists/sync?company=2', { method: 'POST' })
    expect(notReady.status).toBe(409)
    expect(await notReady.json()).toMatchObject({ code: 'company-not-ready', state: 'active', access: 'needs-approval' })
    const before = mockDb.companyLists[2].listSyncs.length
    expect((await call('/quickbooks/lists/sync?company=1', { method: 'POST' })).status).toBe(200)
    expect(mockDb.companyLists[2].listSyncs).toHaveLength(before)
    expect(((await (await call('/quickbooks/lists/syncs?company=2')).json()) as Page<QbListSyncRun>).total).toBe(before)
  })

  it('audit-events and dashboard/summary accept company; events carry companyId', async () => {
    const all = await audit()
    expect(all.some((e) => e.companyId === 1)).toBe(true)
    expect(all.some((e) => e.companyId === 2)).toBe(true)
    const two = await audit('&company=2')
    expect(two.length).toBeGreaterThan(0)
    expect(two.every((e) => e.companyId === 2)).toBe(true)

    const range = 'from=2026-10-01T00:00:00Z&to=2026-11-30T00:00:00Z'
    const sum = async (qs: string) => (await (await call(`/dashboard/summary?${range}${qs}`)).json()) as DashboardSummary
    const total = await sum('')
    const scoped = await sum('&company=2')
    expect(scoped.counts.posted).toBe(1)
    expect(total.counts.received).toBeGreaterThan(scoped.counts.received)
  })

  it('company audit events join the feed with their companyId and no id collision', async () => {
    expect((await call('/companies/1/check', { method: 'POST' })).status).toBe(200)
    const feed = await audit('&company=1')
    expect(feed.find((e) => e.action === 'company-checked')).toMatchObject({ companyId: 1 })
    const { etag } = await detail(14)
    await setCompany(14, etag, 1)
    const after = await audit()
    expect(after.find((e) => e.action === 'company-assigned')).toMatchObject({ companyId: 1, request: { id: 14 } })
    expect(new Set(after.map((e) => e.id)).size).toBe(after.length)
  })
})
