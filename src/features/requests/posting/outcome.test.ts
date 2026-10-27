import { ApiTimeoutError } from '@/api/client'
import { ApiError, type ApiProblem } from '@/api/problem'
import { interpretPost } from './outcome'

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
        requestStatus: 'posted',
      }),
    )
    expect(o).toMatchObject({ kind: 'posted', title: 'Posted', postId: 'api-chase-4521-2026-08', attemptId: 101 })
  })

  test('200 partial → partial, listing the held rows', () => {
    const validation = [{ index: 4, externalId: 'row-5', reason: 'quickbooks-rejected', detail: 'QuickBooks rejected the row' }]
    const o = interpretPost(ok({ status: 'partial', postId: 'p-1', validation, ...ext, requestStatus: 'partial' }))
    expect(o).toMatchObject({ kind: 'partial', title: "Some rows posted, some didn't.", postId: 'p-1', findings: validation })
  })

  test('200 with request status unknown → unknown', () => {
    const o = interpretPost(ok({ status: 'posted', postId: 'p-2', ...ext, requestStatus: 'unknown' }))
    expect(o.kind).toBe('unknown')
    expect(o.title).toBe('QuickBooks may have posted this. Check QuickBooks before resolving.')
  })

  test('200 failed (request back to pending) → failed', () => {
    const o = interpretPost(ok({ status: 'failed', ...ext, requestStatus: 'pending' }))
    expect(o).toMatchObject({ kind: 'failed', title: 'Nothing was posted.' })
  })

  test('200 without requestStatus falls back to the body status', () => {
    expect(interpretPost(ok({ status: 'posted', postId: 'p-3' })).kind).toBe('posted')
    expect(interpretPost(ok({ status: 'failed' })).kind).toBe('failed')
  })

  test('422 → held, with the findings', () => {
    const validation = [
      { index: 16, externalId: 'row-17', reason: 'unknown-vendor', detail: 'Acme Roofing Inc is not a vendor', candidates: ['Acme Roofing'] },
      { index: 88, externalId: 'row-89', reason: 'missing-line-account' },
    ]
    const o = interpretPost(
      err({ type: 'https://qbautopost/problems/validation-held', title: 'Rows held', status: 422, code: 'validation-held', detail: 'Some rows cannot be posted. Nothing was sent.', validation, ...ext, requestStatus: 'pending' }),
    )
    expect(o).toMatchObject({ kind: 'held', title: 'Nothing was sent.', findings: validation })
  })

  test('400 → refused, with the errors', () => {
    const errors = ['controlTotal 4830.17 does not match the sum of rows 4820.17']
    const o = interpretPost(err({ title: 'Request refused', status: 400, code: 'payload-refused', detail: errors[0], errors, ...ext }))
    expect(o).toMatchObject({ kind: 'refused', title: 'Request refused', detail: errors[0], errors })
  })

  test('409 busy → busy, with Retry-After', () => {
    const o = interpretPost(err({ title: 'QuickBooks is busy', status: 409, code: 'busy', ...ext, requestStatus: 'pending' }, { 'Retry-After': '30' }))
    expect(o).toMatchObject({ kind: 'busy', retryAfter: 30, title: 'QuickBooks is busy. Try again in 30 seconds' })
  })

  test('409 already-posting → conflict naming who pressed Post', () => {
    const o = interpretPost(
      err({ title: 'Already posting', status: 409, code: 'already-posting', detail: 'This request is posting.', savedRequestId: 1, attemptId: 7, startedBy: { id: 'u-editor', name: 'Ben T' }, requestStatus: 'posting' }),
    )
    expect(o).toMatchObject({ kind: 'conflict', attemptId: 7 })
    expect(o.title).toContain('Ben T pressed Post')
  })

  test('409 already-posted → conflict', () => {
    const o = interpretPost(
      err({ title: 'Already posted', status: 409, code: 'already-posted', savedRequestId: 1, attemptId: 8, startedBy: { id: 'u-admin', name: 'Asha K' }, requestStatus: 'posted' }),
    )
    expect(o.kind).toBe('conflict')
    expect(o.title).toContain('Asha K pressed Post')
  })

  test('409 duplicate-unconfirmed → duplicate, with the other request', () => {
    const o = interpretPost(
      err({ title: 'Possible duplicate', status: 409, code: 'duplicate-unconfirmed', savedRequestId: 5, of: 1, ofRef: 'SR-000001', ofStatus: 'pending', reasons: ['same-payload'] }),
    )
    expect(o).toMatchObject({ kind: 'duplicate', duplicate: { of: 1, ofRef: 'SR-000001', ofStatus: 'pending' } })
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
    expect(o).toMatchObject({ kind: 'error', title: 'Something went wrong', detail: 'Request ID: req-42' })
    expect(interpretPost(new TypeError('Failed to fetch')).kind).toBe('error')
  })
})
