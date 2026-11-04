import { http, HttpResponse } from 'msw'
import type { Attempt, CompanySource, EmailMeta, Payload, VersionSummary } from '@/api/schema'
import { DEFAULT_POST_DELAY_MS, mockControl, mockDb, type RequestRecord } from '../db'
import type { MockUser } from '../fixtures/users'
import { allReadErrors, computeValidation, diffPayload, rowsOf, UUID_RE } from '../payloadRules'
import { companyRef, findCompany, isReady } from './companies'
import { API, actorOf, authenticate, nowUtc, notFound, parseIfMatch, problem, readJson } from './common'
import {
  addEvent,
  allowedActionsFor,
  current,
  DEFAULT_CODES,
  detailResponse,
  engineOutcome,
  fillSuccess,
  findRecord,
  isObj,
  listRequests,
  listsFor,
  outcomeFor,
  publicRef,
  recheckDuplicate,
  revalidate,
  samePayload,
  stats,
  touch,
  type Outcome,
} from './requestHelpers'

const precondition = () =>
  problem(428, 'precondition-required', 'Precondition required', 'Send If-Match with the ETag you loaded.')

function stale(r: RequestRecord) {
  return problem(412, 'edited-by-someone-else', 'Edited by someone else', 'This request changed since you loaded it.', {
    rowVersion: r.rowVersion,
    updatedUtc: r.updated.utc,
    updatedBy: { id: r.updated.by.id, name: r.updated.by.name },
  })
}

const invalidState = (r: RequestRecord, what: string) =>
  problem(409, 'invalid-state', 'Not allowed in this status', `A ${r.status} request cannot be ${what}.`, { savedRequestStatus: r.status })

/** validate and post need a company that is ready (R-19.4): 409 company-required, then 409 company-not-ready. */
function companyGate(r: RequestRecord): Response | null {
  if (r.companyId === null) {
    return problem(409, 'company-required', 'Company required', 'Choose the company before validating or posting.', { savedRequestId: r.id })
  }
  const c = findCompany(r.companyId)
  if (!c) return problem(409, 'company-required', 'Company required', 'Choose the company before validating or posting.', { savedRequestId: r.id })
  if (!isReady(c)) {
    return problem(409, 'company-not-ready', 'Company not ready', 'QuickBooks has not approved this company file yet.', { state: c.state, access: c.access })
  }
  return null
}

// ---- posting ----

async function postRequest(request: Request, r: RequestRecord, user: MockUser) {
  const body = await readJson(request)
  const confirm = isObj(body) && body.confirmDuplicate === true
  const id = { savedRequestId: r.id }

  const gate = companyGate(r)
  if (gate) return gate

  // 1. claim checks (status first: the loser of a race has a stale ETag but must see 409, not 412)
  if (r.status === 'posting' || r.status === 'posted') {
    const winner = r.attempts[r.attempts.length - 1]
    return problem(409, r.status === 'posting' ? 'already-posting' : 'already-posted', r.status === 'posting' ? 'Already posting' : 'Already posted', `This request is ${r.status}.`, {
      ...id,
      attemptId: winner?.id,
      startedBy: winner?.startedBy,
      savedRequestStatus: r.status,
    })
  }
  if (r.status !== 'pending') return invalidState(r, 'posted')
  const ifMatch = parseIfMatch(request)
  if (ifMatch !== undefined && ifMatch !== r.rowVersion) return stale(r)
  const rows = rowsOf(current(r).payload)
  if (rows.length > 0 && rows.every((row) => row.post === false)) {
    return problem(400, 'nothing-to-post', 'Nothing to post', "Every row is marked don't post.", id)
  }
  if (r.duplicate.of !== null && !confirm) {
    const other = mockDb.requests.find((x) => x.id === r.duplicate.of)
    return problem(409, 'duplicate-unconfirmed', 'Possible duplicate', 'This request may duplicate another. Confirm to post it anyway.', {
      ...id,
      duplicate: { of: r.duplicate.of, status: other?.status ?? null, reasons: r.duplicate.reasons },
    })
  }
  if (r.duplicate.of !== null) r.duplicate.acknowledgedBy = actorOf(user)

  // The file QuickBooks has open is not this company's: record one unavailable attempt, never retry (R-19.4).
  const open = mockControl.companyOpenElsewhere
  const company = findCompany(r.companyId!)!
  if (open !== null && open !== company.fileName) {
    const refused: Attempt = {
      id: ++mockDb.counters.attempt,
      versionNumber: current(r).number,
      outcome: 'unavailable',
      httpStatus: 409,
      postId: null,
      counts: null,
      error: `QuickBooks has ${open} open.`,
      startedUtc: nowUtc(),
      finishedUtc: nowUtc(),
      startedBy: actorOf(user),
    }
    r.attempts.push(refused)
    touch(r, user)
    return problem(409, 'company-file-open-elsewhere', 'Another company file is open', `QuickBooks has ${open} open.`, {
      ...id,
      openFile: open,
      neededFile: company.fileName,
      attemptId: refused.id,
    })
  }

  // 2. claim: status posting + in-progress attempt, committed before anything is awaited
  const forced = mockControl.nextPost
  mockControl.nextPost = null
  const attempt: Attempt = {
    id: ++mockDb.counters.attempt,
    versionNumber: current(r).number,
    outcome: 'in-progress',
    httpStatus: null,
    postId: null,
    counts: null,
    error: null,
    startedUtc: nowUtc(),
    finishedUtc: null,
    startedBy: actorOf(user),
  }
  r.attempts.push(attempt)
  r.status = 'posting'
  touch(r, user)
  addEvent(r, 'post-started', actorOf(user), { attemptId: attempt.id })

  const outcome: Outcome = forced
    ? { status: forced.status, body: isObj(forced.body) ? forced.body : {}, delayMs: forced.delayMs ?? DEFAULT_POST_DELAY_MS }
    : engineOutcome(r)
  if (outcome.delayMs > 0) await mockControl.sleep(outcome.delayMs)

  // 3. finish
  let result = outcome.body
  if (outcome.status === 200) result = fillSuccess(r, attempt.id, { status: 'posted', ...result })
  const [attemptOutcome, nextStatus] = outcomeFor(outcome.status, result)
  attempt.outcome = attemptOutcome
  attempt.httpStatus = outcome.status
  attempt.finishedUtc = nowUtc()
  attempt.postId = typeof result.postId === 'string' ? result.postId : null
  attempt.counts = isObj(result.counts) ? (result.counts as Record<string, number>) : null
  attempt.error = outcome.status >= 400 ? String(result.detail ?? result.title ?? 'error') : null
  r.status = nextStatus
  if ((nextStatus === 'posted' || nextStatus === 'partial') && attempt.postId) r.postId = attempt.postId
  if ((nextStatus === 'partial' || nextStatus === 'unknown') && attempt.postId) {
    r.ledgerBatch = { postId: attempt.postId, status: nextStatus === 'partial' ? 'partial' : 'unknown', createdUtc: attempt.finishedUtc, counts: attempt.counts ?? {} }
  }
  touch(r, user)
  addEvent(r, 'post-finished', actorOf(user), { attemptId: attempt.id, outcome: attemptOutcome })

  const ext = { ...id, attemptId: attempt.id, savedRequestStatus: r.status }
  if (outcome.status < 400) {
    attempt.result = { ...result, ...ext }
    return HttpResponse.json({ ...result, ...ext })
  }
  const [code, title] = DEFAULT_CODES[outcome.status] ?? ['error', 'Error']
  const { code: c, title: t, detail, ...rest } = result
  const problemBody = { ...rest, ...ext }
  attempt.result = { type: `https://qbautopost/problems/${c ?? code}`, title: t ?? title, status: outcome.status, detail, code: c ?? code, ...problemBody }
  const retry: Record<string, string> = outcome.status === 409 || outcome.status === 503 ? { 'Retry-After': String(result.retryAfterSeconds ?? 5) } : {}
  return problem(outcome.status, String(c ?? code), String(t ?? title), detail === undefined ? undefined : String(detail), problemBody, retry)
}

// ---- edit ----

function applyEdit(r: RequestRecord, payload: Payload, note: string | null, user: MockUser) {
  const prev = current(r).payload
  if (samePayload(prev, payload)) return
  const changes = diffPayload(prev, payload)
  r.versions.push({
    number: current(r).number + 1,
    created: { utc: nowUtc(), by: actorOf(user) },
    note,
    changeCount: changes.length,
    payload,
    changes,
  })
  revalidate(r)
  recheckDuplicate(r)
  touch(r, user)
  addEvent(r, 'edited', actorOf(user), { version: current(r).number, note })
  addEvent(r, 'validated', actorOf(user), { state: r.validation.state })
}

// ---- save (n8n push) ----

/** Rows without an `externalId` get `row-<n>` (1-based position) in version 1 (R-6.4). */
function withRowIds(payload: Payload): Payload {
  if (!Array.isArray(payload.transactions)) return payload
  return {
    ...payload,
    transactions: payload.transactions.map((row: unknown, i: number) =>
      isObj(row) && row.externalId === undefined ? { ...row, externalId: `row-${i + 1}` } : row,
    ),
  }
}

function saveRequest(raw: string, user: MockUser) {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    body = undefined
  }
  if (!isObj(body)) return problem(400, 'not-a-json-object', 'Not a JSON object', 'The body must be a JSON object.')
  if (isObj(body.upload)) return saveUpload(body, raw, user)
  const pushId = typeof body.pushId === 'string' && UUID_RE.test(body.pushId) ? body.pushId.toLowerCase() : null
  const existing = pushId ? mockDb.requests.find((x) => x.pushId === pushId) : undefined
  if (existing) return detailResponse(existing, user)

  const payload = withRowIds(body as Payload)
  const mail = isObj(body.email) ? (body.email as unknown as EmailMeta) : null
  const active = mockDb.companies.filter((c) => c.state === 'active')
  const companyId = active.length === 1 ? active[0].id : null
  const record = createRecord(user, raw, [{ payload, note: null }], {
    email: mail,
    pushId,
    upload: null,
    companyId,
    companySource: companyId === null ? null : 'default',
    companyMatch: null,
  })
  addEvent(record, 'created', actorOf(user), { source: 'email' })
  return detailResponse(record, user, { status: 201 })
}

/** R-14: the model's rows become version 1 (with the reference and total the user typed), review edits version 2. */
function saveUpload(body: Record<string, unknown>, raw: string, user: MockUser) {
  const id = String((body.upload as Record<string, unknown>).extractionId)
  const x = mockDb.extractions.find((e) => e.id === id)
  if (!x || x.expiresUtc <= nowUtc()) {
    return problem(410, 'extraction-expired', 'Upload expired', 'This upload has expired. Upload the PDF again.')
  }
  if (x.userId !== user.id) return notFound('Extraction')
  if (x.savedRequestId !== null) {
    return problem(409, 'extraction-already-saved', 'Already saved', 'This upload was already saved.', {
      savedRequestId: x.savedRequestId,
      publicRef: publicRef(x.savedRequestId),
    })
  }

  const { upload: sentUpload, ...reviewed } = body
  // The chosen company travels inside `upload`; a top-level companyId is ignored and nothing reaches the payload.
  const chosen = (sentUpload as Record<string, unknown>).companyId
  delete reviewed.companyId
  if (chosen !== undefined && (typeof chosen !== 'number' || !Number.isInteger(chosen) || chosen < 1)) {
    return problem(400, 'invalid-request', 'Invalid upload', 'upload.extractionId must be a UUID, and upload.companyId, when sent, a company id. Nothing was saved.')
  }
  let companyId: number | null = null
  let companySource: CompanySource | null = null
  const active = mockDb.companies.filter((c) => c.state === 'active')
  if (typeof chosen === 'number') {
    const picked = findCompany(chosen)
    if (!picked || !(picked.state === 'active' || picked.state === 'ambiguous')) {
      return problem(400, 'invalid-request', 'Company not assignable', `Company ${chosen} does not exist, or is missing or disabled. Choose an active company. Nothing was saved.`)
    }
    companyId = chosen
    companySource = 'chosen'
  } else if (active.length === 1) {
    // The one company there is wins over the extraction's match, as on the API (M17 4.6).
    companyId = active[0].id
    companySource = 'default'
  } else if (x.company.match === 'matched' && x.company.companyId !== null) {
    companyId = x.company.companyId
    companySource = 'matched'
  }
  const header = { reference: reviewed.reference ?? null, controlTotal: reviewed.controlTotal ?? null }
  const read: Payload = { ...header, transactions: x.payload.transactions }
  const final = withRowIds({ ...reviewed, ...header } as Payload)
  const versions = [{ payload: read, note: `Read from ${x.file.name}` }]
  if (diffPayload(read, final).length > 0) versions.push({ payload: final, note: 'Reviewed before saving' })
  const upload = {
    fileName: x.file.name,
    sizeBytes: x.file.sizeBytes,
    sha256: x.file.sha256,
    model: x.model,
    promptVersion: x.promptVersion,
    extractedUtc: x.extractedUtc,
  }
  const record = createRecord(user, raw, versions, {
    email: null,
    pushId: null,
    upload,
    companyId,
    companySource,
    companyMatch: { match: x.company.match, printedName: x.company.printedName, dbaName: x.company.dbaName, candidates: x.company.candidates.map((c) => c.id) },
  })
  x.savedRequestId = record.id
  addEvent(record, 'created', actorOf(user), { source: 'upload', fileName: x.file.name })
  return detailResponse(record, user, { status: 201 })
}

/** A new pending request saved by `user`; later versions carry their change lists. */
function createRecord(
  user: MockUser,
  raw: string,
  payloads: { payload: Payload; note: string | null }[],
  meta: Pick<RequestRecord, 'email' | 'pushId' | 'upload' | 'companyId' | 'companySource' | 'companyMatch'>,
): RequestRecord {
  const utc = nowUtc()
  const by = actorOf(user)
  const versions = payloads.map(({ payload, note }, i) => {
    const changes = i === 0 ? [] : diffPayload(payloads[i - 1].payload, payload)
    return { number: i + 1, created: { utc, by }, note, changeCount: changes.length, payload, changes }
  })
  const last = versions[versions.length - 1]
  const record: RequestRecord = {
    id: Math.max(0, ...mockDb.requests.map((r) => r.id)) + 1,
    status: 'pending',
    rowVersion: versions.length,
    source: { kind: 'user', id: user.id, name: user.displayName },
    created: { utc, by },
    updated: { utc, by },
    ...meta,
    original: raw,
    versions,
    readErrors: allReadErrors(last.payload),
    validation: computeValidation(last.payload, listsFor(meta.companyId).lists, last.number, utc),
    duplicate: { of: null, reasons: [], acknowledgedBy: null },
    attempts: [],
    events: [],
    postId: null,
    discardReason: null,
    ledgerBatch: null,
  }
  mockDb.requests.push(record)
  recheckDuplicate(record)
  return record
}

// ---- handlers ----

type Found = { r: RequestRecord; user: MockUser } | { error: Response }

function lookup(request: Request, id: unknown, scope: Parameters<typeof authenticate>[1]): Found {
  const auth = authenticate(request, scope)
  if ('error' in auth) return auth
  const r = findRecord(id)
  return r ? { r, user: auth.user } : { error: notFound() }
}

export const requestHandlers = [
  http.get(`${API}/saved-requests`, ({ request }) => {
    const auth = authenticate(request, 'requests:read')
    return 'error' in auth ? auth.error : listRequests(request, auth.user)
  }),

  http.post(`${API}/saved-requests`, async ({ request }) => {
    const auth = authenticate(request, 'requests:submit')
    return 'error' in auth ? auth.error : saveRequest(await request.text(), auth.user)
  }),

  http.get(`${API}/saved-requests/stats`, ({ request }) => {
    const auth = authenticate(request, 'requests:read')
    if ('error' in auth) return auth.error
    const company = new URL(request.url).searchParams.get('company')
    if (company !== null && company !== 'none' && !/^[1-9]\d*$/.test(company)) {
      return problem(400, 'invalid-request', 'Invalid query', 'company is a company id (a whole number, 1 or more) or none, sent once.')
    }
    return HttpResponse.json(stats(company))
  }),

  http.get(`${API}/saved-requests/:id`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:read')
    return 'error' in f ? f.error : detailResponse(f.r, f.user)
  }),

  http.get(`${API}/saved-requests/:id/original`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:read')
    return 'error' in f ? f.error : new HttpResponse(f.r.original, { headers: { 'Content-Type': 'application/json' } })
  }),

  http.get(`${API}/saved-requests/:id/versions`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:read')
    if ('error' in f) return f.error
    const list: VersionSummary[] = f.r.versions.map((v) => ({ number: v.number, created: v.created, note: v.note, changeCount: v.changeCount }))
    return HttpResponse.json({ items: list.reverse() })
  }),

  http.get(`${API}/saved-requests/:id/versions/:n`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:read')
    if ('error' in f) return f.error
    const v = f.r.versions.find((x) => x.number === Number(params.n))
    return v ? HttpResponse.json(v) : notFound('Version')
  }),

  http.put(`${API}/saved-requests/:id`, async ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:edit')
    if ('error' in f) return f.error
    const ifMatch = parseIfMatch(request)
    if (ifMatch === undefined) return precondition()
    if (f.r.status !== 'pending') {
      return problem(409, 'not-editable', 'Not editable', `A ${f.r.status} request cannot be edited.`, { savedRequestStatus: f.r.status })
    }
    if (ifMatch !== f.r.rowVersion) return stale(f.r)
    const body = await readJson(request)
    if (!isObj(body) || !isObj(body.payload)) {
      return problem(400, 'not-a-json-object', 'Not a JSON object', 'Send { payload, note? } where payload is a JSON object.')
    }
    applyEdit(f.r, body.payload as Payload, typeof body.note === 'string' ? body.note : null, f.user)
    return detailResponse(f.r, f.user)
  }),

  http.post(`${API}/saved-requests/:id/validate`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:edit')
    if ('error' in f) return f.error
    const gate = companyGate(f.r)
    if (gate) return gate
    if (!allowedActionsFor(f.r.status, f.user.role, f.r.companyId).includes('validate')) return invalidState(f.r, 'validated')
    revalidate(f.r)
    touch(f.r, f.user)
    addEvent(f.r, 'validated', actorOf(f.user), { state: f.r.validation.state })
    return detailResponse(f.r, f.user)
  }),

  http.post(`${API}/saved-requests/:id/company`, async ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:edit')
    if ('error' in f) return f.error
    const ifMatch = parseIfMatch(request)
    if (ifMatch === undefined) return precondition()
    if (f.r.status !== 'pending') return invalidState(f.r, 'given a company')
    if (ifMatch !== f.r.rowVersion) return stale(f.r)
    const body = await readJson(request)
    const id = isObj(body) && typeof body.companyId === 'number' && Number.isInteger(body.companyId) && body.companyId >= 1 ? body.companyId : null
    if (id === null) return problem(400, 'invalid-request', 'Invalid company', 'Send { "companyId": <company id> }. Nothing was changed.')
    // A person may give a statement an active or ambiguous company; a missing, disabled or unknown one is a 400 (M17 4.6).
    const company = findCompany(id)
    if (!company || !(company.state === 'active' || company.state === 'ambiguous')) {
      return problem(400, 'invalid-request', 'Company not assignable', `Company ${id} does not exist, or is missing or disabled. Choose an active company. Nothing was changed.`)
    }
    const from = companyRef(f.r.companyId)
    f.r.companyId = company.id
    f.r.companySource = 'chosen'
    f.r.validation = { state: 'ok' }
    touch(f.r, f.user)
    addEvent(f.r, 'company-assigned', actorOf(f.user), { companyId: company.id, from, to: companyRef(company.id), source: 'chosen' })
    return detailResponse(f.r, f.user)
  }),

  http.post(`${API}/saved-requests/:id/post`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:post')
    return 'error' in f ? f.error : postRequest(request, f.r, f.user)
  }),

  http.get(`${API}/saved-requests/:id/attempts`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:read')
    if ('error' in f) return f.error
    return HttpResponse.json({ items: [...f.r.attempts].reverse().map(({ result: _result, ...a }) => (void _result, a)) })
  }),

  http.get(`${API}/saved-requests/:id/attempts/:attemptId`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:read')
    if ('error' in f) return f.error
    const a = f.r.attempts.find((x) => x.id === Number(params.attemptId))
    return a ? HttpResponse.json(a) : notFound('Attempt')
  }),

  http.get(`${API}/saved-requests/:id/events`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:read')
    return 'error' in f ? f.error : HttpResponse.json([...f.r.events].reverse())
  }),

  http.post(`${API}/saved-requests/:id/discard`, async ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:edit')
    if ('error' in f) return f.error
    const body = await readJson(request)
    const reason = isObj(body) && typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < 1 || reason.length > 500) {
      return problem(400, 'invalid-reason', 'Invalid reason', 'A reason of 1 to 500 characters is required.')
    }
    if (f.r.status !== 'pending') return invalidState(f.r, 'discarded')
    f.r.status = 'discarded'
    f.r.discardReason = reason
    touch(f.r, f.user)
    addEvent(f.r, 'discarded', actorOf(f.user), { reason })
    return detailResponse(f.r, f.user)
  }),

  http.post(`${API}/saved-requests/:id/restore`, ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:admin')
    if ('error' in f) return f.error
    if (f.r.status !== 'discarded') return invalidState(f.r, 'restored')
    f.r.status = 'pending'
    f.r.discardReason = null
    recheckDuplicate(f.r)
    touch(f.r, f.user)
    addEvent(f.r, 'restored', actorOf(f.user))
    return detailResponse(f.r, f.user)
  }),

  http.post(`${API}/saved-requests/:id/resolve`, async ({ request, params }) => {
    const f = lookup(request, params.id, 'requests:admin')
    if ('error' in f) return f.error
    const body = await readJson(request)
    const outcome = isObj(body) ? body.outcome : undefined
    const note = isObj(body) && typeof body.note === 'string' ? body.note.trim() : ''
    if ((outcome !== 'posted' && outcome !== 'not-posted') || !note) {
      return problem(400, 'invalid-body', 'Invalid body', 'outcome (posted | not-posted) and a note are required.')
    }
    if (f.r.status !== 'partial' && f.r.status !== 'unknown') return invalidState(f.r, 'resolved')
    if (f.r.status === 'partial' && outcome === 'not-posted') {
      return problem(409, 'partial-requires-posted', 'Outcome not allowed', 'A partial request can only be resolved as posted (accepted as is).', { status: 'partial' })
    }
    const batch = f.r.ledgerBatch
    const last = f.r.attempts[f.r.attempts.length - 1]
    if (last) {
      last.resolvedBy = actorOf(f.user)
      last.resolvedUtc = nowUtc()
      last.resolutionNote = note
    }
    if (outcome === 'posted') {
      f.r.status = 'posted'
      f.r.postId = last?.postId ?? batch?.postId ?? f.r.postId
    } else {
      f.r.status = 'pending'
    }
    touch(f.r, f.user)
    addEvent(f.r, 'resolved', actorOf(f.user), { outcome, note })
    return detailResponse(f.r, f.user, { ledgerBatch: batch })
  }),
]
