import { beforeEach, describe, expect, it } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import type { Extraction, RequestDetail, Txn } from '@/api/schema'

const API = '/api/v2'
let token = ''

export const pdfFile = (name = 'chase-sep-2026.pdf', body = '%PDF-1.4\n% mock statement\n') =>
  new File([body], name, { type: 'application/pdf' })

function extract(file: File, as = token) {
  const form = new FormData()
  form.append('file', file, file.name)
  return fetch(`${API}/statement-extractions`, { method: 'POST', headers: { Authorization: `Bearer ${as}` }, body: form })
}

const save = (body: unknown) =>
  fetch(`${API}/saved-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const DEFAULTS = ['Capital One - 3188', '6891', 'zemen-2019-12-p01', 'Uncategorized', 'Ask My Accountant']

beforeEach(() => {
  token = mockControl.signInAs('u-admin')
})

describe('POST /statement-extractions (R-13)', () => {
  it('reads a PDF: no control total, no defaults, row ids in order, model and prompt version', async () => {
    const res = await extract(pdfFile())
    expect(res.status).toBe(200)
    const x = (await res.json()) as Extraction
    expect(x.extractionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(x.file).toMatchObject({ name: 'chase-sep-2026.pdf', pageCount: expect.any(Number) })
    expect(x.file.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(x.model).toBe('google/gemini-pro-latest')
    expect(x.promptVersion).toBeTruthy()
    expect(x.isBankStatement).toBe(true)
    expect(x.payload.controlTotal).toBeNull()
    expect(x.payload.reference).toBeNull()
    const rows = x.payload.transactions as Txn[]
    expect(rows).toHaveLength(14)
    expect(rows.map((r) => r.externalId)).toEqual(rows.map((_, i) => `row-${i + 1}`))
    expect(rows.every((r) => r.kind === 'Deposit' || r.kind === 'Check')).toBe(true)
    expect(rows.filter((r) => r.account === undefined || r.payee === undefined)).toHaveLength(3)
    expect(JSON.stringify(x.payload)).not.toMatch(new RegExp(DEFAULTS.join('|')))
    expect(x.possibleDuplicates).toEqual([])
  })

  it('refuses viewers', async () => {
    const viewer = mockControl.signInAs('u-viewer')
    expect((await extract(pdfFile(), viewer)).status).toBe(403)
  })

  it('refuses a file that is not a PDF by content, and one over 10 MB', async () => {
    const notPdf = await extract(new File(['hello'], 'x.pdf', { type: 'application/pdf' }))
    expect(notPdf.status).toBe(415)
    expect(await notPdf.json()).toMatchObject({ code: 'not-a-pdf' })
    const big = await extract(pdfFile('big.pdf', '%PDF-' + 'x'.repeat(10 * 1024 * 1024)))
    expect(big.status).toBe(413)
    expect(await big.json()).toMatchObject({ code: 'file-too-large' })
  })

  it.each([
    ['not-statement.pdf', 422, 'not-a-bank-statement'],
    ['scan.pdf', 422, 'no-text'],
    ['protected.pdf', 422, 'pdf-protected'],
    ['fail.pdf', 502, 'extraction-failed'],
  ])('%s → %i %s, and keeps no record', async (name, status, code) => {
    const res = await extract(pdfFile(name))
    expect(res.status).toBe(status)
    expect(await res.json()).toMatchObject({ code })
    expect(mockDb.extractions).toHaveLength(0)
  })

  it('a statement with no rows is 200 with an empty list', async () => {
    const x = (await (await extract(pdfFile('empty.pdf'))).json()) as Extraction
    expect(x.payload.transactions).toEqual([])
  })

  it('mockControl.nextExtraction forces the next answer once', async () => {
    mockControl.nextExtraction = { status: 503, body: { code: 'extraction-unavailable', title: 'Unavailable' } }
    expect((await extract(pdfFile())).status).toBe(503)
    expect((await extract(pdfFile())).status).toBe(200)
  })

  it('warns about a statement with the same reference', async () => {
    const x = (await (await extract(pdfFile('dup-chase.pdf'))).json()) as Extraction
    expect(x.payload.reference).toBe('chase-4521-2026-08')
    const ids = x.possibleDuplicates!.map((d) => d.id)
    expect(ids).toContain(1)
    expect(x.possibleDuplicates!.find((d) => d.id === 1)).toMatchObject({
      publicRef: 'SR-000001',
      source: 'email',
      reasons: expect.arrayContaining(['same-reference']),
    })
  })

  it('warns same-file after the same PDF was uploaded and saved', async () => {
    const first = (await (await extract(pdfFile())).json()) as Extraction
    const saved = await save({ upload: { extractionId: first.extractionId }, reference: 'chase-sep', controlTotal: null, transactions: first.payload.transactions })
    const statement = (await saved.json()) as RequestDetail
    const again = (await (await extract(pdfFile())).json()) as Extraction
    expect(again.possibleDuplicates!.find((d) => d.id === statement.id)).toMatchObject({
      source: 'upload',
      reasons: expect.arrayContaining(['same-file', 'overlapping-rows']),
    })
  })
})
