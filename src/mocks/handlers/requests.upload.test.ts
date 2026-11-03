import { beforeEach, describe, expect, it } from 'vitest'
import { mockControl } from '@/mocks/db'
import type { AuditEvent, Extraction, Page, RequestDetail, RequestSummary, Txn, Version } from '@/api/schema'

const API = '/api/v2'
let token = ''

const call = (path: string, init: RequestInit = {}, as = token) =>
  fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${as}`, 'Content-Type': 'application/json', ...init.headers } })

async function extract(name = 'chase-sep-2026.pdf', as = token): Promise<Extraction> {
  const form = new FormData()
  form.append('file', new File(['%PDF-1.4\n% mock\n'], name, { type: 'application/pdf' }), name)
  const res = await fetch(`${API}/statement-extractions`, { method: 'POST', headers: { Authorization: `Bearer ${as}` }, body: form })
  return (await res.json()) as Extraction
}

const save = (x: Extraction, transactions: unknown = x.payload.transactions, extra: Record<string, unknown> = {}, as = token) =>
  call('/saved-requests', {
    method: 'POST',
    body: JSON.stringify({ upload: { extractionId: x.extractionId }, reference: 'chase-sep-2026', controlTotal: 6249.02, transactions, ...extra }),
  }, as)

/** Oldest first (the endpoint lists newest first). */
const versions = async (id: number) => ((await (await call(`/saved-requests/${id}/versions`)).json()) as { items: Version[] }).items.sort((a, b) => a.number - b.number)
const version = async (id: number, n: number) => (await (await call(`/saved-requests/${id}/versions/${n}`)).json()) as Version

beforeEach(() => {
  token = mockControl.signInAs('u-editor')
})

describe('POST /saved-requests with upload.extractionId (R-14)', () => {
  it('version 1 is the rows as read with the saved reference and total; version 2 holds the review edits', async () => {
    const x = await extract()
    const rows = structuredClone(x.payload.transactions as Txn[])
    rows[2].account = 'Chase Checking 4521'
    rows[5].payee = 'Staples Business'
    rows.push({ externalId: 'dash-1', kind: 'Check', date: '2026-09-30', amount: 12, account: 'Chase Checking 4521' })
    const res = await save(x, rows)
    expect(res.status).toBe(201)
    const d = (await res.json()) as RequestDetail
    expect(d.currentVersion).toBe(2)
    expect(d.email).toBeNull()
    expect(d.source).toMatchObject({ kind: 'user', id: 'u-editor' })
    expect(d.upload).toEqual({ fileName: 'chase-sep-2026.pdf', sizeBytes: x.file.sizeBytes, sha256: x.file.sha256, model: x.model, promptVersion: x.promptVersion, extractedUtc: x.extractedUtc })

    const vs = await versions(d.id)
    expect(vs.map((v) => v.note)).toEqual(['Read from chase-sep-2026.pdf', 'Reviewed before saving'])
    const v1 = await version(d.id, 1)
    expect(v1.payload.transactions).toEqual(x.payload.transactions)
    expect(v1.payload).toMatchObject({ reference: 'chase-sep-2026', controlTotal: 6249.02 })
    const v2 = await version(d.id, 2)
    expect(v2.changes.map((c) => c.path).sort()).toEqual(['$.transactions[14]', '$.transactions[2].account', '$.transactions[5].payee'])
    expect(v2.payload).not.toHaveProperty('upload')
  })

  it('no row edits → only version 1', async () => {
    const x = await extract()
    const d = (await (await save(x)).json()) as RequestDetail
    expect(d.currentVersion).toBe(1)
    expect((await versions(d.id)).map((v) => v.note)).toEqual(['Read from chase-sep-2026.pdf'])
  })

  it('the list carries upload, and q finds the file name', async () => {
    const x = await extract('Odd Name Statement.pdf')
    const d = (await (await save(x)).json()) as RequestDetail
    const page = (await (await call('/saved-requests?q=odd%20name&pageSize=100')).json()) as Page<RequestSummary>
    expect(page.items.map((r) => r.id)).toEqual([d.id])
    expect(page.items[0].upload?.fileName).toBe('Odd Name Statement.pdf')
  })

  it('saving the same extraction twice returns 409 with the first statement', async () => {
    const x = await extract()
    const d = (await (await save(x)).json()) as RequestDetail
    const again = await save(x)
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'extraction-already-saved', savedRequestId: d.id, publicRef: d.publicRef })
  })

  it('an expired or unknown extraction is 410; another user’s is 404', async () => {
    const x = await extract()
    const other = mockControl.signInAs('u-admin')
    const theirs = await save(x, x.payload.transactions, {}, other)
    expect(theirs.status).toBe(404)
    token = mockControl.signInAs('u-editor')
    mockControl.expireExtractions()
    const expired = await save(x)
    expect(expired.status).toBe(410)
    expect(await expired.json()).toMatchObject({ code: 'extraction-expired' })
    const unknown = await save({ ...x, extractionId: '00000000-0000-4000-8000-000000000000' })
    expect(unknown.status).toBe(410)
  })

  it('audit: received by the user with source upload and file name, then the row events', async () => {
    const x = await extract()
    const rows = structuredClone(x.payload.transactions as Txn[])
    rows[2].account = 'Chase Checking 4521'
    const d = (await (await save(x, rows)).json()) as RequestDetail
    const feed = (await (await call(`/audit-events?requestId=${d.id}`)).json()) as Page<AuditEvent>
    const received = feed.items.find((e) => e.action === 'received')!
    expect(received.actor).toMatchObject({ id: 'u-editor', kind: 'user' })
    expect(received.detail).toEqual({ source: 'upload', fileName: 'chase-sep-2026.pdf' })
    expect(feed.items.filter((e) => e.action === 'row-edited').map((e) => e.field)).toEqual(['account'])
  })

  it('an n8n-style save records source email on its received event', async () => {
    const res = await call('/saved-requests', { method: 'POST', body: JSON.stringify({ reference: 'n8n-1', controlTotal: 0, transactions: [] }) })
    const d = (await res.json()) as RequestDetail
    expect(d.upload).toBeNull()
    const feed = (await (await call(`/audit-events?requestId=${d.id}`)).json()) as Page<AuditEvent>
    expect(feed.items.find((e) => e.action === 'received')!.detail).toEqual({ source: 'email' })
  })
})
