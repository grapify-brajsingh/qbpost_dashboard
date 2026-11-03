import { ApiTimeoutError } from '@/api/client'
import { ApiError, type ApiProblem } from '@/api/problem'
import type { RequestDetail } from '@/api/schema'
import { interpretPost, outcomeFromRequest, UNKNOWN_TITLE } from './outcome'

const ok = (body: unknown) => ({ status: 200, body, headers: new Headers() })
const err = (problem: ApiProblem, headers: Record<string, string> = {}) => new ApiError(problem, new Headers(headers))

const ext = { savedRequestId: 1, attemptId: 101 }

describe('interpretPost', () => {
  test('200 with request status posted → posted, with the postId', () => {
    const o = interpretPost(
      ok({
        status: 'posted',
        postId: 'api-chase-4521-2026-08',
        counts: { submitted: 12, posted: 12, held: 0, skipped: 0 },
        rows: [],
        ...ext,
        savedRequestStatus: 'posted',
      }),
    )
    expect(o).toMatchObject({ kind: 'posted', title: 'Posted', postId: 'api-chase-4521-2026-08', attemptId: 101 })
  })

  test('200 partial → partial, listing the held rows', () => {
    const validation = [{ index: 4, externalId: 'row-5', reason: 'quickbooks-rejected', detail: 'QuickBooks rejected the row' }]
    const o = interpretPost(ok({ status: 'partial', postId: 'p-1', validation, ...ext, savedRequestStatus: 'partial' }))
    expect(o).toMatchObject({ kind: 'partial', title: "Some rows posted, some didn't.", postId: 'p-1', findings: validation })
  })

  test('200 with request status unknown → unknown', () => {
    const o = interpretPost(ok({ status: 'posted', postId: 'p-2', ...ext, savedRequestStatus: 'unknown' }))
    expect(o.kind).toBe('unknown')
    expect(o.title).toBe('QuickBooks may have posted this. Check QuickBooks before resolving.')
  })

  test('200 failed (request back to pending) → failed', () => {
    const o = interpretPost(ok({ status: 'failed', ...ext, savedRequestStatus: 'pending' }))
    expect(o).toMatchObject({ kind: 'failed', title: 'Nothing was posted.' })
  })

  test('200 without savedRequestStatus falls back to the body status', () => {
    expect(interpretPost(ok({ status: 'posted', postId: 'p-3' })).kind).toBe('posted')
    expect(interpretPost(ok({ status: 'failed' })).kind).toBe('failed')
  })

  test('422 → held, with the findings', () => {
    const validation = [
      { index: 16, externalId: 'row-17', reason: 'unknown-vendor', detail: 'Acme Roofing Inc is not a vendor', candidates: ['Acme Roofing'] },
      { index: 88, externalId: 'row-89', reason: 'missing-line-account' },
    ]
    const o = interpretPost(
      err({ type: 'https://qbautopost/problems/validation-held', title: 'Rows held', status: 422, code: 'validation-held', detail: 'Some rows cannot be posted. Nothing was sent.', validation, ...ext, savedRequestStatus: 'pending' }),
    )
    expect(o).toMatchObject({ kind: 'held', title: 'Nothing was sent.', findings: validation })
  })

  test('400 → refused, with the errors', () => {
    const errors = ['controlTotal 4830.17 does not match the sum of rows 4820.17']
    const o = interpretPost(err({ title: 'Request refused', status: 400, code: 'payload-refused', detail: errors[0], errors, ...ext }))
    expect(o).toMatchObject({ kind: 'refused', title: 'Request refused', detail: errors[0], errors })
  })

  test('409 busy → busy, with Retry-After', () => {
    const o = interpretPost(err({ title: 'QuickBooks is busy', status: 409, code: 'busy', ...ext, savedRequestStatus: 'pending' }, { 'Retry-After': '30' }))
    expect(o).toMatchObject({ kind: 'busy', retryAfter: 30, title: 'QuickBooks is busy. Try again in 30 seconds' })
  })

  test('409 already-posting → conflict naming who pressed Post', () => {
    const o = interpretPost(
      err({ title: 'Already posting', status: 409, code: 'already-posting', detail: 'This request is posting.', savedRequestId: 1, attemptId: 7, startedBy: { id: 'u-editor', name: 'Ben T' }, savedRequestStatus: 'posting' }),
    )
    expect(o).toMatchObject({ kind: 'conflict', attemptId: 7 })
    expect(o.title).toContain('Ben T pressed Post')
  })

  test('409 already-posted → conflict', () => {
    const o = interpretPost(
      err({ title: 'Already posted', status: 409, code: 'already-posted', savedRequestId: 1, attemptId: 8, startedBy: { id: 'u-admin', name: 'Asha K' }, savedRequestStatus: 'posted' }),
    )
    expect(o.kind).toBe('conflict')
    expect(o.title).toContain('Asha K pressed Post')
  })

  test('409 duplicate-unconfirmed → duplicate, with the other request', () => {
    const o = interpretPost(
      err({ title: 'Possible duplicate', status: 409, code: 'duplicate-unconfirmed', savedRequestId: 5, duplicate: { of: 1, status: 'pending', reasons: ['same-payload'] } }),
    )
    expect(o).toMatchObject({ kind: 'duplicate', duplicate: { of: 1, ofStatus: 'pending' } })
  })

  test('200 with engine failed but saved status unknown never says nothing was posted', () => {
    const o = interpretPost(ok({ status: 'failed', error: 'The session closed', ...ext, savedRequestStatus: 'unknown' }))
    expect(o).toMatchObject({ kind: 'unknown', title: UNKNOWN_TITLE, errors: ['The session closed'] })
  })

  test('200 partial reads held rows and error from the real body', () => {
    const held = [{ index: 2, externalId: 'row-3', requestId: 'r', reason: 'quickbooks-rejected', note: 'Vendor is inactive', candidates: [] }]
    const o = interpretPost(ok({ status: 'partial', postId: 'p-1', held, error: 'One row failed', ...ext, savedRequestStatus: 'partial' }))
    expect(o.findings).toEqual([{ index: 2, externalId: 'row-3', reason: 'quickbooks-rejected', detail: 'Vendor is inactive' }])
    expect(o.errors).toEqual(['One row failed'])
  })

  test('500 post-outcome-unknown → unknown, keeping the warning', () => {
    const detail = 'It is locked as unknown: check QuickBooks. Do not send it again.'
    const o = interpretPost(err({ type: 'post-outcome-unknown', title: "The post's ending is not known", status: 500, detail, savedRequestStatus: 'unknown' }))
    expect(o).toMatchObject({ kind: 'unknown', title: UNKNOWN_TITLE, detail })
  })

  test('500 post-not-started shows what the API said', () => {
    const o = interpretPost(err({ type: 'post-not-started', title: 'The post could not be started', status: 500, detail: 'Nothing was sent.' }))
    expect(o).toMatchObject({ kind: 'error', title: 'The post could not be started', detail: 'Nothing was sent.' })
  })

  test('the real busy 409, which has only an RFC type, is busy', () => {
    const o = interpretPost(
      err({ type: 'https://tools.ietf.org/html/rfc9110#section-15.5.10', title: 'QuickBooks is busy with another operation', status: 409, retryAfterSeconds: 5, ...ext }, { 'Retry-After': '5' }),
    )
    expect(o).toMatchObject({ kind: 'busy', retryAfter: 5 })
  })

  test('429 and 503 carry their Retry-After', () => {
    expect(interpretPost(err({ title: 'Too many requests', status: 429, detail: 'Slow down.' }, { 'Retry-After': '20' }))).toMatchObject({ retryAfter: 20, title: 'Too many requests', detail: 'Slow down.' })
    expect(interpretPost(err({ title: 'Database unavailable', status: 503 }, { 'Retry-After': '30' })).retryAfter).toBe(30)
  })

  test('409 not-postable names the saved status', () => {
    const o = interpretPost(err({ type: 'not-postable', title: 'Not postable', status: 409, savedRequestStatus: 'discarded' }))
    expect(o).toMatchObject({ kind: 'conflict', title: 'This request is discarded now.' })
  })

  test('412 → stale', () => {
    const o = interpretPost(err({ title: 'Edited by someone else', status: 412, code: 'edited-by-someone-else', rowVersion: 5 }))
    expect(o).toMatchObject({ kind: 'stale', title: 'This changed since you opened it.' })
  })

  test('503 → unavailable, with the problem detail', () => {
    const o = interpretPost(err({ title: 'Service unavailable', status: 503, code: 'unavailable', detail: 'QuickBooks Desktop is not running.' }))
    expect(o).toMatchObject({ kind: 'unavailable', title: 'QuickBooks Desktop is not running.', detail: 'Try again later.' })
  })

  test('ApiTimeoutError → timeout', () => {
    expect(interpretPost(new ApiTimeoutError()).kind).toBe('timeout')
  })

  test('anything else → error, with the request id when present', () => {
    const o = interpretPost(err({ title: 'Internal error', status: 500, code: 'internal-error', requestId: 'req-42' }))
    expect(o).toMatchObject({ kind: 'error', title: 'Internal error', detail: 'Request ID: req-42' })
    expect(interpretPost(new TypeError('Failed to fetch')).kind).toBe('error')
  })
})

describe('outcomeFromRequest', () => {
  test('no newer attempt than before the post → the server did not take it', () => {
    const r = { status: 'pending', postId: null, lastAttempt: { id: 7, outcome: 'busy', httpStatus: 409, finishedUtc: null } } as unknown as RequestDetail
    expect(outcomeFromRequest(r, 7)).toEqual({ kind: 'error', title: 'The server did not take the post. Nothing was posted.' })
  })
})
