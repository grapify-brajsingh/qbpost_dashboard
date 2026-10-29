import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockControl } from '@/mocks/db'
import { server } from '@/mocks/server'
import { ApiError } from './problem'
import { api, apiFetch, ApiTimeoutError } from './client'
import { getAccessToken, onSessionEnded, setAccessToken } from './session'

const STALE = 'mock-token-u-admin-99'

type Me = { id: string }

function countRequests() {
  const seen: { method: string; path: string; request: Request }[] = []
  server.events.on('request:start', ({ request }) => {
    seen.push({ method: request.method, path: new URL(request.url).pathname, request })
  })
  return (method: string, path: string) => seen.filter((s) => s.method === method && s.path === path).length
}

beforeEach(() => {
  mockControl.signInAs('u-admin')
  setAccessToken(STALE)
})

afterEach(() => {
  server.events.removeAllListeners()
  setAccessToken(null)
})

describe('apiFetch', () => {
  it('sends the bearer token under /api/v2 and parses JSON', async () => {
    setAccessToken(mockControl.signInAs('u-editor'))
    const { data, status, headers } = await apiFetch<Me>('/auth/me')
    expect(status).toBe(200)
    expect(data.id).toBe('u-editor')
    expect(headers.get('Content-Type')).toContain('application/json')
  })

  it('401 → one refresh → retry succeeds', async () => {
    const count = countRequests()
    const { data } = await apiFetch<Me>('/auth/me')
    expect(data.id).toBe('u-admin')
    expect(count('POST', '/api/v2/auth/refresh')).toBe(1)
    expect(count('GET', '/api/v2/auth/me')).toBe(2)
    expect(getAccessToken()).toBe('mock-token-u-admin-1')
  })

  it('three parallel 401s share one refresh', async () => {
    const count = countRequests()
    const results = await Promise.all([apiFetch<Me>('/auth/me'), apiFetch<Me>('/auth/me'), apiFetch<Me>('/auth/me')])
    expect(results.map((r) => r.data.id)).toEqual(['u-admin', 'u-admin', 'u-admin'])
    expect(count('POST', '/api/v2/auth/refresh')).toBe(1)
    expect(count('GET', '/api/v2/auth/me')).toBe(6)
  })

  it('refreshes again for a later 401 (the shared refresh is cleared once settled)', async () => {
    const count = countRequests()
    await apiFetch('/auth/me')
    setAccessToken(STALE)
    await apiFetch('/auth/me')
    expect(count('POST', '/api/v2/auth/refresh')).toBe(2)
  })

  it('noAuthRetry: post is not re-sent after 401', async () => {
    const count = countRequests()
    const err = await apiFetch('/saved-requests/sr-1/post', { method: 'POST', noAuthRetry: true }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).problem.status).toBe(401)
    expect(count('POST', '/api/v2/saved-requests/sr-1/post')).toBe(1)
    expect(count('POST', '/api/v2/auth/refresh')).toBe(1)
    // The session was refreshed, so the next call works without another refresh.
    expect(getAccessToken()).toBe('mock-token-u-admin-1')
    await apiFetch('/auth/me')
    expect(count('POST', '/api/v2/auth/refresh')).toBe(1)
  })

  it('login with invalid credentials is sent once and never triggers a refresh', async () => {
    const ended = vi.fn()
    const off = onSessionEnded(ended)
    const count = countRequests()
    const err = await api
      .post('/auth/login', { email: 'asha@example.com', password: 'wrong-password' })
      .catch((e: unknown) => e)
    off()
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).problem.status).toBe(401)
    expect(count('POST', '/api/v2/auth/login')).toBe(1)
    expect(count('POST', '/api/v2/auth/refresh')).toBe(0)
    expect(ended).not.toHaveBeenCalled()
  })

  it('change-password 401 is sent once and never triggers a refresh', async () => {
    const count = countRequests()
    const err = await api
      .post('/auth/change-password', { currentPassword: 'x', newPassword: 'y'.repeat(12) })
      .catch((e: unknown) => e)
    expect((err as ApiError).problem.status).toBe(401)
    expect(count('POST', '/api/v2/auth/change-password')).toBe(1)
    expect(count('POST', '/api/v2/auth/refresh')).toBe(0)
    expect(getAccessToken()).toBe(STALE)
  })

  it('refresh failure ends session', async () => {
    mockControl.endSession()
    const ended = vi.fn()
    const off = onSessionEnded(ended)
    const count = countRequests()
    const err = await apiFetch('/auth/me').catch((e: unknown) => e)
    off()
    expect((err as ApiError).problem.status).toBe(401)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
    expect(count('GET', '/api/v2/auth/me')).toBe(1)
  })

  it('timeout throws ApiTimeoutError and is not retried', async () => {
    let calls = 0
    server.use(
      http.get('/api/v2/slow', async () => {
        calls++
        await mockControl.sleep(200)
        return HttpResponse.json({})
      }),
    )
    await expect(apiFetch('/slow', { timeoutMs: 50 })).rejects.toBeInstanceOf(ApiTimeoutError)
    expect(calls).toBe(1)
  })

  it('a network error is not retried', async () => {
    let calls = 0
    server.use(
      http.post('/api/v2/saved-requests/sr-1/post', () => {
        calls++
        return HttpResponse.error()
      }),
    )
    await expect(apiFetch('/saved-requests/sr-1/post', { method: 'POST' })).rejects.toBeInstanceOf(TypeError)
    expect(calls).toBe(1)
  })

  it('throws ApiError with the problem body for non-2xx', async () => {
    setAccessToken(mockControl.signInAs('u-viewer'))
    const err = await apiFetch('/users').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).problem.code).toBe('forbidden')
  })

  it('returns undefined data for 204 and sends same-origin credentials', async () => {
    setAccessToken(mockControl.signInAs('u-admin'))
    let credentials: RequestCredentials | undefined
    server.events.on('request:start', ({ request }) => {
      credentials = request.credentials
    })
    const res = await apiFetch<undefined>('/auth/logout', { method: 'POST' })
    expect(res.status).toBe(204)
    expect(res.data).toBeUndefined()
    expect(credentials).toBe('same-origin')
  })
})

describe('api helpers', () => {
  it('serialises plain-object bodies as JSON and passes strings through', async () => {
    const seen: { type: string | null; body: string }[] = []
    server.use(
      http.put('/api/v2/echo', async ({ request }) => {
        seen.push({ type: request.headers.get('Content-Type'), body: await request.text() })
        return HttpResponse.json({ ok: true })
      }),
      http.patch('/api/v2/echo', async ({ request }) => {
        seen.push({ type: request.headers.get('Content-Type'), body: await request.text() })
        return HttpResponse.json({ ok: true })
      }),
    )
    setAccessToken(mockControl.signInAs('u-admin'))
    const put = await api.put<{ ok: boolean }>('/echo', { a: 1 }, { headers: { 'If-Match': '"3"' } })
    expect(put.data.ok).toBe(true)
    await api.patch('/echo', 'raw')
    expect(seen[0]).toEqual({ type: 'application/json', body: '{"a":1}' })
    expect(seen[1].body).toBe('raw')
    expect(seen[1].type).not.toBe('application/json')
  })

  it('get and post go through apiFetch', async () => {
    setAccessToken(mockControl.signInAs('u-admin'))
    expect((await api.get<Me>('/auth/me')).data.id).toBe('u-admin')
    const err = await api
      .post('/auth/change-password', { currentPassword: 'wrong', newPassword: 'x'.repeat(12) })
      .catch((e: unknown) => e)
    expect((err as ApiError).problem.code).toBe('current-password-incorrect')
  })
})
