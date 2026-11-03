// Maps a post response (or failure) to what the screen shows. Design §6.3.2.
import { ApiTimeoutError } from '@/api/client'
import { ApiError, problemCode, retryAfterSeconds } from '@/api/problem'
import type { Finding, RequestDetail } from '@/api/schema'

export type PostOutcomeKind =
  | 'posted'
  | 'partial'
  | 'failed'
  | 'unknown'
  | 'held'
  | 'refused'
  | 'busy'
  | 'conflict'
  | 'duplicate'
  | 'stale'
  | 'unavailable'
  | 'timeout'
  | 'error'

export interface DuplicateInfo {
  of: number | null
  ofRef?: string | null
  ofStatus?: string | null
}

export type PostOutcome = {
  kind: PostOutcomeKind
  title: string
  detail?: string
  retryAfter?: number
  findings?: Finding[]
  errors?: string[]
  postId?: string
  attemptId?: number
  /** `duplicate` only: the other request, as the 409 named it. */
  duplicate?: DuplicateInfo
}

export interface PostResponse {
  status: number
  body: unknown
  headers: Headers
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const findings = (v: unknown) => (Array.isArray(v) ? (v.filter(isObj) as unknown as Finding[]) : undefined)
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : undefined)

export const UNKNOWN_TITLE = 'QuickBooks may have posted this. Check QuickBooks before resolving.'
export const busyTitle = (n?: number) =>
  n === undefined ? 'QuickBooks is busy. Try again in a moment' : `QuickBooks is busy. Try again in ${n} ${n === 1 ? 'second' : 'seconds'}`
export const waitTitle = (n: number) => `Try again in ${n} ${n === 1 ? 'second' : 'seconds'}`

/** A post result's `held` rows, which carry `note` where a finding has `detail`. */
export function heldFindings(v: unknown): Finding[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter(isObj).flatMap((r): Finding[] => {
    const index = num(r.index)
    const reason = str(r.reason)
    if (index === undefined || reason === undefined) return []
    const externalId = str(r.externalId)
    const detail = str(r.note)
    return [{ index, reason, ...(externalId ? { externalId } : {}), ...(detail ? { detail } : {}) }]
  })
}

function successOutcome(savedStatus: unknown, base: Pick<PostOutcome, 'postId' | 'attemptId' | 'findings' | 'errors'>): PostOutcome {
  switch (savedStatus) {
    case 'posted':
      return { kind: 'posted', title: 'Posted', ...base }
    case 'partial':
      return { kind: 'partial', title: "Some rows posted, some didn't.", ...base }
    case 'unknown':
      return { kind: 'unknown', title: UNKNOWN_TITLE, ...base }
    case 'pending':
    case 'failed':
      return { kind: 'failed', title: 'Nothing was posted.', detail: 'The request is back to pending.', ...base }
    default:
      // Never claim nothing was posted about a status this screen doesn't know.
      return { kind: 'unknown', title: UNKNOWN_TITLE, ...base }
  }
}

function fromProblem(e: ApiError): PostOutcome {
  const p = e.problem
  const code = problemCode(p)
  const attemptId = num(p.attemptId)
  if (code === 'post-outcome-unknown' || p.savedRequestStatus === 'unknown') {
    return { kind: 'unknown', title: UNKNOWN_TITLE, detail: str(p.detail), attemptId }
  }
  const retryAfter = retryAfterSeconds(e.headers) ?? num(p.retryAfterSeconds) ?? undefined
  switch (p.status) {
    case 422:
      return { kind: 'held', title: 'Nothing was sent.', detail: str(p.detail), findings: findings(p.validation) ?? [], attemptId }
    case 400:
      return { kind: 'refused', title: p.title || 'Request refused', detail: str(p.detail), errors: strings(p.errors) ?? [], attemptId }
    case 409: {
      // The API's busy answer has no type of its own; `retryAfterSeconds` is what marks it.
      if (code === 'busy' || num(p.retryAfterSeconds) !== undefined) {
        return { kind: 'busy', title: busyTitle(retryAfter), retryAfter, attemptId }
      }
      if (code === 'already-posting' || code === 'already-posted') {
        const by = isObj(p.startedBy) ? str(p.startedBy.name) : undefined
        const what = code === 'already-posting' ? 'is already posting' : 'was already posted'
        return { kind: 'conflict', title: `${by ?? 'Someone else'} pressed Post: this request ${what}.`, attemptId }
      }
      if (code === 'duplicate-unconfirmed') {
        const other = isObj(p.duplicate) ? p.duplicate : {}
        return {
          kind: 'duplicate',
          title: 'Possible duplicate',
          detail: str(p.detail),
          duplicate: { of: num(other.of) ?? null, ofRef: null, ofStatus: str(other.status) ?? null },
        }
      }
      // not-postable: the request moved on. Its new status is `savedRequestStatus`.
      const now = str(p.savedRequestStatus)
      return { kind: 'conflict', title: now ? `This request is ${now} now.` : p.title, detail: str(p.detail), attemptId }
    }
    case 412:
      return { kind: 'stale', title: 'This changed since you opened it.', detail: 'The latest version was reloaded.' }
    case 503:
      return { kind: 'unavailable', title: str(p.detail) ?? p.title, detail: 'Try again later.', retryAfter }
    case 401:
      return {
        kind: 'error',
        title: 'Your session had expired, so nothing was re-sent.',
        detail: 'The request was reloaded. Check its status before posting again.',
      }
    default: {
      const requestId = str(p.requestId)
      const detail = [str(p.detail), requestId && `Request ID: ${requestId}`].filter(Boolean).join(' ')
      return { kind: 'error', title: p.title, detail: detail || undefined, retryAfter }
    }
  }
}

export function interpretPost(res: PostResponse | ApiError | ApiTimeoutError | Error): PostOutcome {
  if (res instanceof ApiTimeoutError) {
    return { kind: 'timeout', title: 'QuickBooks is taking a while. Checking whether the post went through…' }
  }
  if (res instanceof ApiError) return fromProblem(res)
  if (res instanceof Error) return { kind: 'error', title: 'Something went wrong' }
  const body = isObj(res.body) ? res.body : {}
  if (res.status < 200 || res.status >= 300) return { kind: 'error', title: 'Something went wrong' }
  // The request's new status is `savedRequestStatus`; the body's own `status` is the engine result.
  const held = heldFindings(body.held)
  const error = str(body.error)
  return successOutcome(body.savedRequestStatus ?? body.status, {
    postId: str(body.postId),
    attemptId: num(body.attemptId),
    findings: held?.length ? held : findings(body.validation),
    ...(error ? { errors: [error] } : {}),
  })
}

/**
 * The outcome of a post this screen did not see answered (timeout, network error, or reopened while posting),
 * read from the reloaded request. `sinceAttemptId` is the latest attempt before the post: no newer attempt means
 * the API never took the post.
 */
export function outcomeFromRequest(r: RequestDetail, sinceAttemptId?: number | null): PostOutcome {
  const a = r.lastAttempt
  const base = { postId: r.postId ?? undefined, attemptId: a?.id }
  if (r.status === 'posted' || r.status === 'partial' || r.status === 'unknown') return successOutcome(r.status, base)
  if (!a || (sinceAttemptId !== undefined && a.id === sinceAttemptId)) {
    return { kind: 'error', title: 'The server did not take the post. Nothing was posted.' }
  }
  switch (a.outcome) {
    case 'failed':
      return successOutcome('pending', base)
    case 'held':
      return { kind: 'held', title: 'Nothing was sent.', detail: 'Some rows cannot be posted.', attemptId: a.id }
    case 'refused':
      return { kind: 'refused', title: 'Request refused', detail: 'See the Attempts tab for the reasons.', attemptId: a.id }
    case 'busy':
      return { kind: 'busy', title: busyTitle(), attemptId: a.id }
    case 'unavailable':
      return { kind: 'unavailable', title: 'QuickBooks is unavailable.', detail: 'Try again later.', attemptId: a.id }
    default:
      return { kind: 'error', title: 'Something went wrong', detail: 'See the Attempts tab for details.', attemptId: a.id }
  }
}
