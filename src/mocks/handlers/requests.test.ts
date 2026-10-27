import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import type { Page, RequestDetail, RequestSummary, Stats } from '@/api/schema'

const API = '/api/v1'
let token = ''

function call(path: string, init: RequestInit & { as?: string } = {}) {
  const { as, ...rest } = init
  const headers = new Headers(rest.headers)
  headers.set('Authorization', `Bearer ${as ?? token}`)
  if (rest.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(`${API}${path}`, { ...rest, headers })
}

beforeEach(() => {
  token = mockControl.signInAs('u-admin')
})

describe('auth', () => {
  it('rejects requests without a valid token', async () => {
    const res = await fetch(`${API}/saved-requests`)
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
  })

  it('logs in, refreshes with a rotated token and invalidates the old one', async () => {
    mockControl.endSession()
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'asha@example.com', password: 'correct horse battery' }),
    })
    expect(login.status).toBe(200)
    const body = (await login.json()) as { accessToken: string }
    expect((await call('/auth/me', { as: body.accessToken })).status).toBe(200)

    const refreshed = await fetch(`${API}/auth/refresh`, { method: 'POST' })
    const next = (await refreshed.json()) as { accessToken: string }
    expect(next.accessToken).not.toBe(body.accessToken)
    expect((await call('/auth/me', { as: body.accessToken })).status).toBe(401)
    expect((await call('/auth/me', { as: next.accessToken })).status).toBe(200)
  })

  it('refresh fails without a session', async () => {
    mockControl.endSession()
    expect((await fetch(`${API}/auth/refresh`, { method: 'POST' })).status).toBe(401)
  })

  it('locked users get 423 with Retry-After', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lena@example.com', password: 'correct horse battery' }),
    })
    expect(res.status).toBe(423)
    expect(res.headers.get('Retry-After')).toBe('300')
  })

  it('blocks routes with password-change-required except me/change-password/logout', async () => {
    mockDb.users.find((u) => u.id === 'u-admin')!.mustChangePassword = true
    const list = await call('/saved-requests')
    expect(list.status).toBe(403)
    expect(((await list.json()) as { code: string }).code).toBe('password-change-required')
    expect((await call('/auth/me')).status).toBe(200)
  })
})

describe('GET /saved-requests', () => {
  it('filters pending + needsAttention and reports a matching total', async () => {
    const res = await call('/saved-requests?status=pending&needsAttention=true')
    const page = (await res.json()) as Page<RequestSummary>
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.total).toBe(page.items.length)
    for (const r of page.items) {
      expect(r.status).toBe('pending')
      expect(r.needsAttention).toBe(true)
    }
    const all = (await (await call('/saved-requests?pageSize=100')).json()) as Page<RequestSummary>
    const expected = all.items.filter((r) => r.status === 'pending' && r.needsAttention).length
    expect(page.total).toBe(expected)
  })

  it('searches the email subject and sorts by received', async () => {
    const res = await call('/saved-requests?q=chase&sort=-received')
    const page = (await res.json()) as Page<RequestSummary>
    expect(page.items.length).toBeGreaterThan(0)
    const times = page.items.map((r) => r.email?.receivedUtc ?? r.created.utc)
    expect(times).toEqual([...times].sort().reverse())
  })

  it('rejects unknown query values with 400', async () => {
    expect((await call('/saved-requests?status=bogus')).status).toBe(400)
  })

  it('stats cover every status and the pending-only flag counts', async () => {
    const stats = (await (await call('/saved-requests/stats')).json()) as Stats
    expect(Object.keys(stats.byStatus).sort()).toEqual(
      ['discarded', 'partial', 'pending', 'posted', 'posting', 'unknown'],
    )
    expect(stats.needsAttention.all).toBeGreaterThanOrEqual(stats.needsAttention.pending)
    expect(stats.duplicate.pending).toBeGreaterThan(0)
  })
})

describe('GET /saved-requests/{id}', () => {
  it('returns the ETag as the quoted rowVersion', async () => {
    const res = await call('/saved-requests/1')
    const body = (await res.json()) as RequestDetail
    expect(res.headers.get('ETag')).toBe(`"${body.rowVersion}"`)
    expect(body.allowedActions).toEqual(['edit', 'validate', 'post', 'discard'])
  })

  it('resolves SR- references and 404s unknown ids', async () => {
    expect((await call('/saved-requests/SR-000001')).status).toBe(200)
    expect((await call('/saved-requests/9999')).status).toBe(404)
  })

  it('computes allowedActions by role and status', async () => {
    const viewer = mockControl.signInAs('u-viewer')
    const v = (await (await call('/saved-requests/1', { as: viewer })).json()) as RequestDetail
    expect(v.allowedActions).toEqual([])
    const editor = mockControl.signInAs('u-editor')
    const disc = (await (await call('/saved-requests/10', { as: editor })).json()) as RequestDetail
    expect(disc.allowedActions).toEqual([])
    const admin = mockControl.signInAs('u-admin')
    const d = (await (await call('/saved-requests/10', { as: admin })).json()) as RequestDetail
    expect(d.allowedActions).toEqual(['restore'])
    const u = (await (await call('/saved-requests/8', { as: admin })).json()) as RequestDetail
    expect(u.allowedActions).toEqual(['resolve'])
    expect(u.ledgerBatch).not.toBeNull()
  })

  it('serves the original body', async () => {
    const res = await call('/saved-requests/1/original')
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(JSON.parse(await res.text())).toHaveProperty('transactions')
  })
})

describe('PUT /saved-requests/{id}', () => {
  async function currentPayload() {
    const res = await call('/saved-requests/1')
    const body = (await res.json()) as RequestDetail
    return { body, etag: res.headers.get('ETag')! }
  }

  it('answers 412 with who changed it for a stale If-Match', async () => {
    const { body } = await currentPayload()
    const res = await call('/saved-requests/1', {
      method: 'PUT',
      headers: { 'If-Match': '"1"' },
      body: JSON.stringify({ payload: body.payload }),
    })
    expect(res.status).toBe(412)
    const problem = (await res.json()) as { code: string; updatedBy: { name: string }; rowVersion: number }
    expect(problem.code).toBe('edited-by-someone-else')
    expect(problem.updatedBy.name).toBeTruthy()
    expect(problem.rowVersion).toBe(body.rowVersion)
  })

  it('answers 428 without If-Match', async () => {
    const { body } = await currentPayload()
    const res = await call('/saved-requests/1', { method: 'PUT', body: JSON.stringify({ payload: body.payload }) })
    expect(res.status).toBe(428)
  })

  it('answers 409 not-editable for a posted request', async () => {
    const res = await call('/saved-requests/7', {
      method: 'PUT',
      headers: { 'If-Match': '"2"' },
      body: JSON.stringify({ payload: {} }),
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('not-editable')
  })

  it('creates a version with a change list and bumps the ETag', async () => {
    const { body, etag } = await currentPayload()
    const payload = structuredClone(body.payload) as { transactions: { memo?: string }[] }
    payload.transactions[0].memo = 'edited memo'
    const res = await call('/saved-requests/1', {
      method: 'PUT',
      headers: { 'If-Match': etag },
      body: JSON.stringify({ payload, note: 'fixed memo' }),
    })
    expect(res.status).toBe(200)
    const next = (await res.json()) as RequestDetail
    expect(next.currentVersion).toBe(body.currentVersion + 1)
    expect(res.headers.get('ETag')).toBe(`"${next.rowVersion}"`)
    const version = (await (await call(`/saved-requests/1/versions/${next.currentVersion}`)).json()) as {
      changes: { op: string; path: string; new: string }[]
    }
    expect(version.changes).toEqual([
      expect.objectContaining({ op: 'replace', path: '$.transactions[0].memo', new: 'edited memo' }),
    ])
  })

  it('treats an identical payload as a no-op', async () => {
    const { body, etag } = await currentPayload()
    const res = await call('/saved-requests/1', {
      method: 'PUT',
      headers: { 'If-Match': etag },
      body: JSON.stringify({ payload: body.payload }),
    })
    const next = (await res.json()) as RequestDetail
    expect(next.currentVersion).toBe(body.currentVersion)
    expect(next.rowVersion).toBe(body.rowVersion)
  })

  it('forbids viewers', async () => {
    const viewer = mockControl.signInAs('u-viewer')
    const res = await call('/saved-requests/1', { as: viewer, method: 'PUT', headers: { 'If-Match': '"4"' }, body: '{}' })
    expect(res.status).toBe(403)
  })
})

describe('validate, discard, restore, resolve', () => {
  it('re-validates', async () => {
    const res = await call('/saved-requests/2/validate', { method: 'POST' })
    const body = (await res.json()) as RequestDetail
    expect(body.validation.validation).toHaveLength(3)
    expect(body.validation.versionNumber).toBe(body.currentVersion)
  })

  it('discards with a reason, then an admin restores', async () => {
    expect((await call('/saved-requests/11/discard', { method: 'POST', body: '{"reason":""}' })).status).toBe(400)
    const d = await call('/saved-requests/11/discard', { method: 'POST', body: '{"reason":"duplicate email"}' })
    expect(((await d.json()) as RequestDetail).status).toBe('discarded')
    const r = await call('/saved-requests/11/restore', { method: 'POST' })
    expect(((await r.json()) as RequestDetail).status).toBe('pending')
  })

  it('resolves an unknown request', async () => {
    const res = await call('/saved-requests/8/resolve', {
      method: 'POST',
      body: JSON.stringify({ outcome: 'posted', note: 'checked in QuickBooks' }),
    })
    const body = (await res.json()) as RequestDetail
    expect(body.status).toBe('posted')
    expect(body.postId).toBeTruthy()
  })

  it('only allows posted for partial', async () => {
    const res = await call('/saved-requests/9/resolve', {
      method: 'POST',
      body: JSON.stringify({ outcome: 'not-posted', note: 'x' }),
    })
    expect(res.status).toBe(409)
  })
})

describe('POST /saved-requests/{id}/post', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const post = (id: number, body: unknown = {}, etag?: string) =>
    call(`/saved-requests/${id}/post`, {
      method: 'POST',
      headers: etag ? { 'If-Match': etag } : {},
      body: JSON.stringify(body),
    })

  it('sets posting immediately and finishes as posted with TxnIDs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const pending = post(1)
    await vi.waitFor(() => expect(mockDb.requests.find((r) => r.id === 1)!.status).toBe('posting'))
    const during = (await (await call('/saved-requests/1')).json()) as RequestDetail
    expect(during.status).toBe('posting')
    expect(during.lastAttempt?.outcome).toBe('in-progress')
    const racing = await post(1)
    expect(racing.status).toBe(409)
    expect(((await racing.json()) as { code: string }).code).toBe('already-posting')

    await vi.advanceTimersByTimeAsync(1500)
    const res = await pending
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; savedRequestId: number; attemptId: number; rows: { txnId: string }[] }
    expect(body.status).toBe('posted')
    expect(body.savedRequestId).toBe(1)
    expect(body.rows).toHaveLength(12)
    const after = (await (await call('/saved-requests/1')).json()) as RequestDetail
    expect(after.status).toBe('posted')
    expect(after.postId).toBeTruthy()
    const attempt = (await (await call(`/saved-requests/1/attempts/${body.attemptId}`)).json()) as {
      result: { rows: { txnId: string }[] }
    }
    expect(attempt.result.rows[0].txnId).toBeTruthy()
  })

  it('honours a forced outcome and returns the request to pending', async () => {
    mockControl.nextPost = {
      status: 409,
      body: { code: 'busy', title: 'QuickBooks is busy', detail: 'Try again' },
      delayMs: 0,
    }
    const res = await post(1)
    expect(res.status).toBe(409)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    const body = (await res.json()) as { code: string; requestStatus: string; attemptId: number }
    expect(body.code).toBe('busy')
    expect(body.requestStatus).toBe('pending')
    const detail = (await (await call('/saved-requests/1')).json()) as RequestDetail
    expect(detail.status).toBe('pending')
    expect(detail.lastAttempt?.outcome).toBe('busy')
  })

  it('answers 409 duplicate-unconfirmed for a flagged request and accepts confirmDuplicate', async () => {
    const res = await post(5)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; of: number; ofStatus: string }
    expect(body.code).toBe('duplicate-unconfirmed')
    expect(body.of).toBe(1)
    mockControl.nextPost = { status: 200, body: { status: 'posted' }, delayMs: 0 }
    expect((await post(5, { confirmDuplicate: true })).status).toBe(200)
  })

  it('answers 412 for a stale If-Match and 422 for held rows', async () => {
    expect((await post(1, {}, '"1"')).status).toBe(412)
    const held = await post(2)
    expect([400, 422]).toContain(held.status)
    const e = await post(3)
    expect(e.status).toBe(400)
  })

  it('forbids viewers', async () => {
    const viewer = mockControl.signInAs('u-viewer')
    const res = await call('/saved-requests/1/post', { as: viewer, method: 'POST', body: '{}' })
    expect(res.status).toBe(403)
  })
})
