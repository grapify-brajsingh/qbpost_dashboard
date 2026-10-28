// Seed requests. Ids are stable; tests refer to them:
//  1 clean pending (12 rows, 3 versions, extra `email` / `confidence` fields)   2 pending 210 rows, 3 findings, total off by 10.00
//  3 unreadable (kind "Cheque")   4 transactions not an array   5 duplicate of 1   6 posting   7 posted
//  8 unknown (+ledgerBatch)   9 partial (+ledgerBatch)   10 discarded   11 pending, hostile subject, last attempt busy
//  12 pending, no email metadata, no pushId, one row marked don't post
//  13 pending, second push of 11's reference (5 h later, one more row)
import type { Actor, Attempt, EmailMeta, Payload, RequestEvent, RequestStatus, Txn } from '@/api/schema'
import type { RequestRecord } from '../db'
import { computeValidation, diffPayload, readErrorsOf, sumCents, toPostedRows } from '../payloadRules'
import { QB_LISTS } from './lists'

const N8N: Actor = { id: 'api-client:n8n-mailbox', name: 'n8n mailbox workflow' }
const ASHA: Actor = { id: 'u-admin', name: 'Asha K', email: 'asha@example.com' }
const SOURCE = { kind: 'api-client', id: 'n8n-mailbox', name: 'n8n mailbox workflow' }

const EXPENSE = ['Repairs and Maintenance', 'Utilities', 'Office Supplies', 'Insurance', 'Professional Fees']

/** `seed` shifts amounts and check numbers so different requests do not share row fingerprints. */
export function makeRows(n: number, seed = 0): Txn[] {
  return Array.from({ length: n }, (_, i): Txn => {
    const j = i + seed * 1000
    const amount = Math.round(((j * 7919) % 90000) + 1234) / 100
    const base: Txn = {
      externalId: `row-${i + 1}`,
      date: `2026-08-${String(1 + (i % 28)).padStart(2, '0')}`,
      amount,
      memo: `INV ${88000 + i} item ${i + 1}`,
    }
    const vendor = QB_LISTS.vendors[i % QB_LISTS.vendors.length]
    switch (i % 5) {
      case 2:
        return { ...base, kind: 'Deposit', account: 'Operating Savings 1177', payee: QB_LISTS.customers[i % 4], lineAccount: 'Rental Income', last4: '1177' }
      case 1:
        return { ...base, kind: 'CcCharge', account: 'Chase Visa 8890', payee: vendor, lineAccount: EXPENSE[i % 5], last4: '8890' }
      case 3:
        return { ...base, kind: 'CcCredit', account: 'Chase Visa 8890', payee: vendor, lineAccount: EXPENSE[i % 5], last4: '8890' }
      default:
        return { ...base, kind: 'Check', account: 'Chase Checking 4521', payee: vendor, lineAccount: EXPENSE[i % 5], checkNo: String(1000 + j), refNumber: String(1000 + j), last4: '4521' }
    }
  })
}

function payloadOf(reference: string, rows: unknown, extra: Record<string, unknown> = {}): Payload {
  const p: Payload = { reference, controlTotal: Array.isArray(rows) ? sumCents({ transactions: rows }) / 100 : 0, transactions: rows, ...extra }
  return p
}

interface Opts {
  id: number
  status?: RequestStatus
  payload: Payload
  createdUtc: string
  email?: EmailMeta | null
  pushId?: string | null
  rowVersion?: number
  attempts?: Attempt[]
  extraEvents?: Omit<RequestEvent, 'id'>[]
  duplicate?: RequestRecord['duplicate']
  postId?: string | null
  discardReason?: string | null
  ledgerBatch?: RequestRecord['ledgerBatch']
  laterVersions?: { payload: Payload; by: Actor; utc: string; note: string }[]
  original?: Payload
}

function build(o: Opts): RequestRecord {
  const first = o.original ?? o.payload
  const versions: RequestRecord['versions'] = [
    { number: 1, created: { utc: o.createdUtc, by: N8N }, note: null, changeCount: 0, payload: first, changes: [] },
  ]
  let prev = first
  for (const v of o.laterVersions ?? []) {
    const changes = diffPayload(prev, v.payload)
    versions.push({ number: versions.length + 1, created: { utc: v.utc, by: v.by }, note: v.note, changeCount: changes.length, payload: v.payload, changes })
    prev = v.payload
  }
  const current = versions[versions.length - 1]
  const events: RequestEvent[] = [
    { id: 0, kind: 'created', detail: null, atUtc: o.createdUtc, actor: N8N },
    ...(o.duplicate?.of ? [{ id: 0, kind: 'flagged-duplicate', detail: { of: o.duplicate.of, reasons: o.duplicate.reasons }, atUtc: o.createdUtc, actor: N8N }] : []),
    ...versions.slice(1).map((v) => ({ id: 0, kind: 'edited', detail: { version: v.number, note: v.note }, atUtc: v.created.utc, actor: v.created.by })),
    ...(o.extraEvents ?? []).map((e) => ({ ...e, id: 0 })),
  ]
  events.sort((a, b) => a.atUtc.localeCompare(b.atUtc))
  events.forEach((e, i) => (e.id = o.id * 100 + i + 1))
  const lastBy = events[events.length - 1].actor
  return {
    id: o.id,
    status: o.status ?? 'pending',
    rowVersion: o.rowVersion ?? versions.length,
    source: SOURCE,
    created: { utc: o.createdUtc, by: N8N },
    updated: { utc: events[events.length - 1].atUtc, by: lastBy },
    email: o.email === undefined ? null : o.email,
    pushId: o.pushId ?? null,
    upload: null,
    original: JSON.stringify(first),
    versions,
    readErrors: readErrorsOf(current.payload),
    validation: computeValidation(current.payload, QB_LISTS, current.number, o.createdUtc),
    duplicate: o.duplicate ?? { of: null, reasons: [], acknowledgedBy: null },
    attempts: o.attempts ?? [],
    events,
    postId: o.postId ?? null,
    discardReason: o.discardReason ?? null,
    ledgerBatch: o.ledgerBatch ?? null,
  }
}

function attempt(a: Partial<Attempt> & Pick<Attempt, 'id' | 'outcome' | 'startedUtc'>): Attempt {
  return { versionNumber: 1, httpStatus: null, postId: null, counts: null, error: null, finishedUtc: null, startedBy: ASHA, ...a }
}

function email(subject: string, receivedUtc: string, from = 'alerts@chase.com'): EmailMeta {
  return { subject, receivedUtc, from, messageId: `<${Math.abs(subject.length * 7919)}@mail.example.com>` }
}

export function buildRequests(): RequestRecord[] {
  // 1: clean, three versions
  const mail1 = email('Chase statement – Aug 2026', '2026-10-27T07:12:44Z')
  const final1 = payloadOf('chase-4521-2026-08', makeRows(12), { email: mail1 })
  ;(final1.transactions as Txn[])[2].confidence = 0.82
  const v2 = structuredClone(final1)
  const v2rows = v2.transactions as Txn[]
  v2rows[4].amount = Math.round(v2rows[4].amount! * 100 - 400) / 100
  v2.controlTotal = sumCents(v2) / 100
  const v1 = structuredClone(v2)
  ;(v1.transactions as Txn[])[0].payee = 'ABC PLUMBING'
  const r1 = build({
    id: 1,
    pushId: '7f3a9c1e-5b2d-4e6a-9d10-3c8b1a2e4f01',
    payload: final1,
    original: v1,
    createdUtc: '2026-10-27T07:12:50Z',
    email: mail1,
    rowVersion: 4,
    laterVersions: [
      { payload: v2, by: ASHA, utc: '2026-10-27T08:00:00Z', note: 'fixed payee on row 1' },
      { payload: final1, by: ASHA, utc: '2026-10-27T08:10:00Z', note: 'amount on row 5 per the PDF' },
    ],
  })

  // 2: 210 rows, three findings, control total off by 10.00
  const rows2 = makeRows(210, 2)
  rows2[16].payee = 'Acme Roofing Inc'
  delete rows2[88].lineAccount
  rows2[139].date = '2019-12-30'
  const p2 = payloadOf('zemen-2026-08', rows2)
  p2.controlTotal = sumCents(p2) / 100 + 10
  const r2 = build({ id: 2, pushId: '2b8d4e7a-91c3-4f5b-a6e2-0d7c9b3a1f02', payload: p2, createdUtc: '2026-10-27T06:40:00Z', email: email('Zemen Bank statement – 2026-08', '2026-10-27T06:31:00Z', 'statements@zemenbank.example') })

  // 3: unreadable kind
  const rows3 = makeRows(6, 3)
  rows3[3].kind = 'Cheque'
  const r3 = build({ id: 3, pushId: 'c41e6a0b-3d7f-4a92-8b5c-6e1f2d9a0c03', payload: payloadOf('legacy-import-3', rows3), createdUtc: '2026-10-26T15:20:00Z', email: email('Old format statement', '2026-10-26T15:11:00Z', 'noreply@legacy.example') })

  // 4: transactions is not an array
  const r4 = build({ id: 4, pushId: '9d2f5b8c-0a6e-4c13-b7d4-1a3e5c7f9b04', payload: payloadOf('broken-shape', 'not-an-array'), createdUtc: '2026-10-26T14:00:00Z', email: email('Broken export', '2026-10-26T13:55:00Z', 'export@legacy.example') })

  // 5: duplicate of 1
  const r5 = build({
    id: 5,
    pushId: 'e6a1c3f7-2d94-4b0a-8e5f-7b9c1d3a5e05',
    payload: structuredClone(final1),
    createdUtc: '2026-10-27T07:30:00Z',
    email: email('Chase statement – Aug 2026 (resent)', '2026-10-27T07:29:10Z'),
    duplicate: { of: 1, reasons: ['same-payload', 'same-reference', 'overlapping-rows'], acknowledgedBy: null },
  })

  // 6: posting
  const p6 = payloadOf('visa-8890-2026-08', makeRows(8, 6))
  const r6 = build({
    id: 6,
    pushId: '3c7e9a1d-8f20-4d6b-a1c5-9e2b4d6f8a06',
    status: 'posting',
    payload: p6,
    createdUtc: '2026-10-27T05:00:00Z',
    email: email('Chase Visa statement – Aug 2026', '2026-10-27T04:50:00Z'),
    rowVersion: 2,
    attempts: [attempt({ id: 1, outcome: 'in-progress', startedUtc: '2026-10-27T09:00:00Z' })],
    extraEvents: [{ kind: 'post-started', detail: { attemptId: 1 }, atUtc: '2026-10-27T09:00:00Z', actor: ASHA }],
  })

  // 7: posted
  const p7 = payloadOf('savings-1177-2026-07', makeRows(8, 7))
  const rows7 = toPostedRows(p7, 2)
  const r7 = build({
    id: 7,
    pushId: 'a8d0f2b4-6c1e-4a3d-9f7b-5c3e1a9d7b07',
    status: 'posted',
    payload: p7,
    createdUtc: '2026-10-20T07:00:00Z',
    email: email('Savings statement – Jul 2026', '2026-10-20T06:50:00Z', 'statements@bank.example'),
    rowVersion: 3,
    postId: 'api-savings-1177-2026-07',
    attempts: [
      attempt({
        id: 2,
        outcome: 'posted',
        httpStatus: 200,
        postId: 'api-savings-1177-2026-07',
        counts: { submitted: 8, posted: 8, held: 0, skipped: 0 },
        startedUtc: '2026-10-20T09:00:00Z',
        finishedUtc: '2026-10-20T09:00:41Z',
        result: { status: 'posted', postId: 'api-savings-1177-2026-07', counts: { submitted: 8, posted: 8, held: 0, skipped: 0 }, posted: rows7 },
      }),
    ],
    extraEvents: [
      { kind: 'post-started', detail: { attemptId: 2 }, atUtc: '2026-10-20T09:00:00Z', actor: ASHA },
      { kind: 'post-finished', detail: { attemptId: 2, outcome: 'posted' }, atUtc: '2026-10-20T09:00:41Z', actor: ASHA },
    ],
  })

  // 8: unknown (server restarted mid-post)
  const p8 = payloadOf('checking-4521-2026-07', makeRows(6, 8))
  const r8 = build({
    id: 8,
    pushId: '5e9b1d3f-7a2c-4e8d-b0a6-2f4c6e8a0d08',
    status: 'unknown',
    payload: p8,
    createdUtc: '2026-10-19T07:00:00Z',
    email: email('Chase statement – Jul 2026', '2026-10-19T06:45:00Z'),
    rowVersion: 3,
    ledgerBatch: { postId: 'api-checking-4521-2026-07', status: 'partial', createdUtc: '2026-10-19T09:00:12Z', counts: { submitted: 6, posted: 4 } },
    attempts: [
      attempt({
        id: 3,
        outcome: 'unknown',
        postId: 'api-checking-4521-2026-07',
        error: 'the service restarted while this post was running',
        startedUtc: '2026-10-19T09:00:00Z',
      }),
    ],
    extraEvents: [{ kind: 'post-started', detail: { attemptId: 3 }, atUtc: '2026-10-19T09:00:00Z', actor: ASHA }],
  })

  // 9: partial
  const p9 = payloadOf('visa-8890-2026-07', makeRows(6, 9))
  const r9 = build({
    id: 9,
    pushId: 'd2c4e6a8-0b1f-4c3e-a5d7-9b1f3a5c7e09',
    status: 'partial',
    payload: p9,
    createdUtc: '2026-10-18T07:00:00Z',
    email: email('Chase Visa statement – Jul 2026', '2026-10-18T06:40:00Z'),
    rowVersion: 3,
    postId: 'api-visa-8890-2026-07',
    ledgerBatch: { postId: 'api-visa-8890-2026-07', status: 'partial', createdUtc: '2026-10-18T09:00:30Z', counts: { submitted: 6, posted: 4 } },
    attempts: [
      attempt({
        id: 4,
        outcome: 'partial',
        httpStatus: 200,
        postId: 'api-visa-8890-2026-07',
        counts: { submitted: 6, posted: 4, held: 2, skipped: 0 },
        startedUtc: '2026-10-18T09:00:00Z',
        finishedUtc: '2026-10-18T09:00:31Z',
        result: {
          status: 'partial',
          postId: 'api-visa-8890-2026-07',
          counts: { submitted: 6, posted: 4, held: 2, skipped: 0 },
          posted: toPostedRows(p9, 4, (i) => i < 4),
          validation: [
            { index: 4, externalId: 'row-5', reason: 'quickbooks-rejected', detail: 'QuickBooks rejected the row' },
            { index: 5, externalId: 'row-6', reason: 'quickbooks-rejected', detail: 'QuickBooks rejected the row' },
          ],
        },
      }),
    ],
    extraEvents: [
      { kind: 'post-started', detail: { attemptId: 4 }, atUtc: '2026-10-18T09:00:00Z', actor: ASHA },
      { kind: 'post-finished', detail: { attemptId: 4, outcome: 'partial' }, atUtc: '2026-10-18T09:00:31Z', actor: ASHA },
    ],
  })

  // 10: discarded
  const r10 = build({
    id: 10,
    pushId: '1f3b5d7e-9a0c-4b2e-8d4f-6a8c0e2b4d10',
    status: 'discarded',
    payload: payloadOf('test-statement', makeRows(5, 10)),
    createdUtc: '2026-10-17T07:00:00Z',
    email: email('Test statement', '2026-10-17T06:00:00Z', 'qa@example.com'),
    rowVersion: 2,
    discardReason: 'Sent by mistake while testing the n8n workflow',
    extraEvents: [{ kind: 'discarded', detail: { reason: 'Sent by mistake while testing the n8n workflow' }, atUtc: '2026-10-17T08:00:00Z', actor: ASHA }],
  })

  // 11: hostile subject, last attempt busy
  const r11 = build({
    id: 11,
    pushId: 'b4a6c8e0-2d1f-4a3b-9c5e-7d9f1b3a5c11',
    payload: payloadOf('savings-1177-2026-08', makeRows(5, 11)),
    createdUtc: '2026-10-27T06:00:00Z',
    email: email('<img src=x onerror=alert(1)> Savings statement', '2026-10-27T05:55:00Z', 'statements@bank.example'),
    rowVersion: 2,
    attempts: [
      attempt({
        id: 5,
        outcome: 'busy',
        httpStatus: 409,
        error: 'QuickBooks is in use by another process',
        startedUtc: '2026-10-27T06:30:00Z',
        finishedUtc: '2026-10-27T06:30:02Z',
        result: { type: 'https://qbautopost/problems/busy', title: 'QuickBooks is busy', status: 409, code: 'busy' },
      }),
    ],
    extraEvents: [
      { kind: 'post-started', detail: { attemptId: 5 }, atUtc: '2026-10-27T06:30:00Z', actor: ASHA },
      { kind: 'post-finished', detail: { attemptId: 5, outcome: 'busy' }, atUtc: '2026-10-27T06:30:02Z', actor: ASHA },
    ],
  })

  // 12: no email metadata (older n8n workflow)
  const rows12 = makeRows(4, 12)
  rows12[1] = { ...rows12[1], memo: 'Transfer to Operating Savings', post: false }
  const r12 = build({ id: 12, payload: payloadOf('manual-entry-12', rows12), createdUtc: '2026-10-25T10:00:00Z', email: null })

  // 13: a second push of 11's reference, 5 h after the first, with one more row (R-5, R-8.5)
  const r13 = build({
    id: 13,
    pushId: 'f0e2d4c6-8a1b-4c3d-b5e7-9a1c3e5d7f13',
    payload: payloadOf('savings-1177-2026-08', makeRows(6, 11)),
    createdUtc: '2026-10-27T11:00:00Z',
    email: email('Savings statement – Aug 2026 (second push)', '2026-10-27T10:55:00Z', 'statements@bank.example'),
  })

  return [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13]
}
