// Views and mutations on saved-request records, shared by the request handlers.
import { HttpResponse } from 'msw'
import type {
  Action,
  Actor,
  AttemptOutcome,
  Payload,
  RequestDetail,
  RequestStatus,
  RequestSummary,
  Role,
  Stats,
} from '@/api/schema'
import { DEFAULT_POST_DELAY_MS, mockDb, type RequestRecord } from '../db'
import type { MockUser } from '../fixtures/users'
import {
  canonicalPayload,
  computeValidation,
  controlTotalErrors,
  duplicateReasons,
  readErrorsOf,
  rowsOf,
  toPostedRows,
} from '../payloadRules'
import { actorOf, nowUtc, paginate, problem } from './common'

export const publicRef = (id: number) => `SR-${String(id).padStart(6, '0')}`

export function findRecord(idParam: unknown): RequestRecord | undefined {
  const raw = String(idParam)
  const m = /^SR-(\d+)$/i.exec(raw)
  const id = m ? Number(m[1]) : /^\d+$/.test(raw) ? Number(raw) : NaN
  return mockDb.requests.find((r) => r.id === id)
}

/** The single place that decides which buttons exist (API spec §7.1 and §11.1). */
export function allowedActionsFor(status: RequestStatus, role: Role): Action[] {
  if (role === 'viewer') return []
  if (status === 'pending') return ['edit', 'validate', 'post', 'discard']
  if (role !== 'admin') return []
  if (status === 'discarded') return ['restore']
  if (status === 'partial' || status === 'unknown') return ['resolve']
  return []
}

export const current = (r: RequestRecord) => r.versions[r.versions.length - 1]

export const needsAttention = (r: RequestRecord) =>
  r.readErrors.length > 0 || ['held', 'refused', 'unreadable'].includes(r.validation.state)

export function toSummary(r: RequestRecord, role: Role): RequestSummary {
  const payload = current(r).payload
  const other = r.duplicate.of === null ? undefined : mockDb.requests.find((x) => x.id === r.duplicate.of)
  const last = r.attempts[r.attempts.length - 1]
  const { validation: _findings, ...validation } = r.validation
  void _findings
  return {
    id: r.id,
    publicRef: publicRef(r.id),
    status: r.status,
    rowVersion: r.rowVersion,
    source: r.source,
    reference: typeof payload.reference === 'string' ? payload.reference : null,
    controlTotal: typeof payload.controlTotal === 'number' ? payload.controlTotal : null,
    transactionCount: rowsOf(payload).length,
    currentVersion: current(r).number,
    needsAttention: needsAttention(r),
    duplicate: {
      flagged: r.duplicate.of !== null,
      of: r.duplicate.of,
      ofRef: other ? publicRef(other.id) : null,
      ofStatus: other?.status ?? null,
      reasons: r.duplicate.reasons,
      acknowledgedBy: r.duplicate.acknowledgedBy,
    },
    validation,
    lastAttempt: last
      ? { id: last.id, outcome: last.outcome, httpStatus: last.httpStatus, finishedUtc: last.finishedUtc }
      : null,
    postId: r.postId,
    email: r.email,
    discardReason: r.discardReason,
    created: r.created,
    updated: r.updated,
    allowedActions: allowedActionsFor(r.status, role),
  }
}

export function toDetail(r: RequestRecord, role: Role, ledgerBatch = r.ledgerBatch): RequestDetail {
  const exposeBatch = (r.status === 'partial' || r.status === 'unknown') && ledgerBatch
  return {
    ...toSummary(r, role),
    payload: current(r).payload,
    readErrors: r.readErrors,
    validation: r.validation,
    ledgerBatch: exposeBatch ? ledgerBatch : null,
  }
}

export function detailResponse(r: RequestRecord, user: MockUser, init: { status?: number; ledgerBatch?: RequestRecord['ledgerBatch'] } = {}) {
  return HttpResponse.json(toDetail(r, user.role, init.ledgerBatch ?? r.ledgerBatch), {
    status: init.status ?? 200,
    headers: { ETag: `"${r.rowVersion}"` },
  })
}

export function addEvent(r: RequestRecord, kind: string, actor: Actor, detail: Record<string, unknown> | null = null) {
  r.events.push({ id: mockDb.counters.event++, kind, detail, atUtc: nowUtc(), actor })
}

/** Bumps rowVersion and records who touched the request. */
export function touch(r: RequestRecord, user: MockUser) {
  r.rowVersion++
  r.updated = { utc: nowUtc(), by: actorOf(user) }
}

export function revalidate(r: RequestRecord) {
  const v = current(r)
  r.readErrors = readErrorsOf(v.payload)
  r.validation = computeValidation(v.payload, mockDb.lists, v.number, nowUtc())
}

/** Re-runs the duplicate rules against older, non-discarded requests (the oldest match wins). */
export function recheckDuplicate(r: RequestRecord) {
  const payload = current(r).payload
  for (const other of [...mockDb.requests].sort((a, b) => a.id - b.id)) {
    if (other.id >= r.id || other.status === 'discarded') continue
    const reasons = duplicateReasons(payload, current(other).payload)
    if (reasons.length) {
      r.duplicate = { of: other.id, reasons, acknowledgedBy: r.duplicate.of === other.id ? r.duplicate.acknowledgedBy : null }
      return
    }
  }
  r.duplicate = { of: null, reasons: [], acknowledgedBy: null }
}

export const samePayload = (a: Payload, b: Payload) => canonicalPayload(a) === canonicalPayload(b)

export const STATUSES: RequestStatus[] = ['pending', 'posting', 'posted', 'partial', 'unknown', 'discarded']
const SORTS = ['created', 'updated', 'controlTotal', 'received']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)


// ---- list ----

export function listRequests(request: Request, user: MockUser) {
  const url = new URL(request.url)
  const bad = (detail: string) => problem(400, 'invalid-query', 'Invalid query', detail)
  const statuses = url.searchParams.getAll('status')
  if (statuses.some((s) => !STATUSES.includes(s as RequestStatus))) return bad('Unknown status.')
  const flag = (name: string): boolean | undefined | Error => {
    const v = url.searchParams.get(name)
    if (v === null) return undefined
    return v === 'true' ? true : v === 'false' ? false : new Error(name)
  }
  const na = flag('needsAttention')
  const dup = flag('duplicate')
  if (na instanceof Error || dup instanceof Error) return bad('needsAttention and duplicate must be true or false.')
  const dates: Record<string, string | null> = {}
  for (const name of ['createdFrom', 'createdTo', 'receivedFrom', 'receivedTo']) {
    const v = url.searchParams.get(name)
    if (v !== null && !DATE_RE.test(v)) return bad(`${name} must be yyyy-MM-dd.`)
    dates[name] = v
  }
  const sortParam = url.searchParams.get('sort') ?? '-created'
  const desc = sortParam.startsWith('-')
  const sortKey = desc ? sortParam.slice(1) : sortParam
  if (!SORTS.includes(sortKey)) return bad('Unknown sort.')
  const q = url.searchParams.get('q')?.toLowerCase()
  const source = url.searchParams.get('source')

  const received = (r: RequestRecord) => r.email?.receivedUtc ?? r.created.utc
  let rows = mockDb.requests.filter((r) => {
    if (statuses.length && !statuses.includes(r.status)) return false
    if (na !== undefined && needsAttention(r) !== na) return false
    if (dup !== undefined && (r.duplicate.of !== null) !== dup) return false
    if (source && r.source.id !== source && r.source.kind !== source) return false
    const created = r.created.utc.slice(0, 10)
    const got = received(r).slice(0, 10)
    if ((dates.createdFrom && created < dates.createdFrom) || (dates.createdTo && created > dates.createdTo)) return false
    if ((dates.receivedFrom && got < dates.receivedFrom) || (dates.receivedTo && got > dates.receivedTo)) return false
    if (q) {
      const p = current(r).payload
      const text = [
        typeof p.reference === 'string' ? p.reference : '',
        publicRef(r.id),
        r.email?.subject ?? '',
        ...rowsOf(p).flatMap((t) => [t.payee ?? '', t.memo ?? '']),
      ]
      if (!text.some((t) => t.toLowerCase().includes(q))) return false
    }
    return true
  })
  const key = (r: RequestRecord): string | number =>
    sortKey === 'updated' ? r.updated.utc : sortKey === 'received' ? received(r) : sortKey === 'controlTotal'
      ? (current(r).payload.controlTotal as number | undefined) ?? 0
      : r.created.utc
  rows = rows.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    const c = ka < kb ? -1 : ka > kb ? 1 : a.id - b.id
    return desc ? -c : c
  })
  const page = paginate(rows.map((r) => toSummary(r, user.role)), url)
  return 'error' in page ? page.error : HttpResponse.json(page)
}

export function stats(): Stats {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>
  const counts = { needsAttention: { pending: 0, all: 0 }, duplicate: { pending: 0, all: 0 } }
  for (const r of mockDb.requests) {
    byStatus[r.status]++
    for (const [flag, on] of [['needsAttention', needsAttention(r)], ['duplicate', r.duplicate.of !== null]] as const) {
      if (!on) continue
      counts[flag].all++
      if (r.status === 'pending') counts[flag].pending++
    }
  }
  return { byStatus, ...counts }
}


// ---- posting (engine stand-in) ----

export function outcomeFor(status: number, body: Record<string, unknown>): [AttemptOutcome, RequestStatus] {
  if (status === 200) {
    const noResponse = Array.isArray(body.validation) && body.validation.some((f) => isObj(f) && f.reason === 'quickbooks-no-response')
    if (body.status === 'unknown' || noResponse) return ['unknown', 'unknown']
    if (body.status === 'posted') return ['posted', 'posted']
    if (body.status === 'partial') return ['partial', 'partial']
    return ['failed', 'pending']
  }
  if (status === 400) return ['refused', 'pending']
  if (status === 422) return ['held', 'pending']
  if (status === 409) return ['busy', 'pending']
  if (status === 503) return ['unavailable', 'pending']
  return ['error', 'pending']
}

export const DEFAULT_CODES: Record<number, [string, string]> = {
  400: ['payload-refused', 'Request refused'],
  409: ['busy', 'QuickBooks is busy'],
  422: ['validation-held', 'Rows held'],
  500: ['internal-error', 'Internal error'],
  503: ['unavailable', 'Service unavailable'],
}

export interface Outcome {
  status: number
  body: Record<string, unknown>
  delayMs: number
}

/** What the engine would answer for the current version (default path when no outcome is forced). */
export function engineOutcome(r: RequestRecord): Outcome {
  const payload = current(r).payload
  if (r.readErrors.length) {
    return { status: 400, delayMs: 0, body: { code: 'payload-unreadable', title: 'Payload unreadable', detail: 'The payload could not be read.', errors: r.readErrors } }
  }
  const errors = controlTotalErrors(payload)
  if (errors.length) {
    return { status: 400, delayMs: 0, body: { code: 'payload-refused', title: 'Request refused', detail: errors.join(' '), errors } }
  }
  revalidate(r)
  if (r.validation.validation?.length) {
    return {
      status: 422,
      delayMs: 0,
      body: { code: 'validation-held', title: 'Rows held', detail: 'Some rows cannot be posted. Nothing was sent.', validation: r.validation.validation, counts: r.validation.counts },
    }
  }
  return { status: 200, delayMs: DEFAULT_POST_DELAY_MS, body: { status: 'posted' } }
}

export function fillSuccess(r: RequestRecord, attemptId: number, body: Record<string, unknown>): Record<string, unknown> {
  if (body.status !== 'posted') return body
  const payload = current(r).payload
  const rows = toPostedRows(payload, attemptId)
  const skipped = rowsOf(payload).length - rows.length
  return {
    postId: `api-${typeof payload.reference === 'string' ? payload.reference : r.id}`,
    counts: { submitted: rowsOf(payload).length, posted: rows.length, held: 0, skipped },
    rows,
    ...body,
  }
}

