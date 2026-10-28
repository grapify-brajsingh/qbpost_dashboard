import { ApiError, problemCode, retryAfterSeconds, toApiError } from './problem'

describe('problemCode', () => {
  it('reads the last segment of type', () => {
    expect(
      problemCode({ title: 'x', status: 409, type: 'https://qbautopost/problems/already-posting' }),
    ).toBe('already-posting')
  })
  it('prefers the code extension', () => {
    expect(problemCode({ title: 'x', status: 409, code: 'busy', type: 'https://a/b/other' })).toBe('busy')
  })
  it('falls back to a kebab-case title', () => {
    expect(problemCode({ title: 'already-posting', status: 409 })).toBe('already-posting')
    expect(problemCode({ title: 'Already posting', status: 409 })).toBeUndefined()
  })
})

describe('toApiError', () => {
  it('wraps a non-JSON body using the status', async () => {
    const err = await toApiError(
      new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
    )
    expect(err).toBeInstanceOf(ApiError)
    expect(err.problem).toEqual({ title: 'Bad Gateway', status: 502 })
  })
  it('keeps a problem body and headers', async () => {
    const err = await toApiError(
      new Response(JSON.stringify({ title: 'Busy', status: 409, code: 'busy' }), {
        status: 409,
        headers: { 'Retry-After': '5' },
      }),
    )
    expect(err.problem.code).toBe('busy')
    expect(retryAfterSeconds(err.headers)).toBe(5)
  })
})

describe('retryAfterSeconds', () => {
  it('parses seconds', () => expect(retryAfterSeconds(new Headers({ 'Retry-After': '5' }))).toBe(5))
  it('returns null when absent or not a number', () => {
    expect(retryAfterSeconds(new Headers())).toBeNull()
    expect(retryAfterSeconds(new Headers({ 'Retry-After': 'soon' }))).toBeNull()
  })
})
