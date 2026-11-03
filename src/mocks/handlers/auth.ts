import { http, HttpResponse } from 'msw'
import { mockDb } from '../db'
import { API, authenticate, nowUtc, problem, readJson, toMe } from './common'
import { addUserAudit } from './userHelpers'

const ACCESS_TOKEN_MS = 15 * 60 * 1000

function tokenResponse(userId: string, token: string) {
  const user = mockDb.users.find((u) => u.id === userId)!
  return HttpResponse.json({
    accessToken: token,
    expiresUtc: new Date(Date.now() + ACCESS_TOKEN_MS).toISOString(),
    user: toMe(user),
  })
}

export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await readJson(request)) as { email?: unknown; password?: unknown } | undefined
    const invalid = () =>
      problem(401, 'invalid-credentials', 'Invalid credentials', 'The email or password is incorrect.')
    if (typeof body?.email !== 'string' || typeof body.password !== 'string') return invalid()
    const user = mockDb.users.find((u) => u.email.toLowerCase() === (body.email as string).toLowerCase())
    if (!user) return invalid()
    if (user.lockedOutUntilUtc && user.lockedOutUntilUtc > nowUtc()) {
      return problem(
        423,
        'locked-out',
        'Locked out',
        'Too many failed attempts. Try again later.',
        { lockedOutUntilUtc: user.lockedOutUntilUtc },
        { 'Retry-After': '300' },
      )
    }
    if (user.disabled || body.password !== user.password) {
      addUserAudit(user.id, 'login-failed', { id: user.id, name: user.displayName }, null)
      return invalid()
    }
    user.lastLoginUtc = nowUtc()
    mockDb.session = { userId: user.id, generation: 1 }
    addUserAudit(user.id, 'login', { id: user.id, name: user.displayName }, null)
    return tokenResponse(user.id, `mock-token-${user.id}-0`)
  }),

  // The refresh cookie is modelled as server-side session state (no cookie jar in msw-node/jsdom).
  http.post(`${API}/auth/refresh`, () => {
    const session = mockDb.session
    const user = session && mockDb.users.find((u) => u.id === session.userId)
    if (!session || !user || user.disabled) {
      mockDb.session = null
      return problem(401, 'unauthorized', 'Unauthorized', 'The session has expired. Sign in again.')
    }
    const token = `mock-token-${session.userId}-${session.generation}`
    session.generation++
    return tokenResponse(session.userId, token)
  }),

  http.post(`${API}/auth/logout`, ({ request }) => {
    const auth = authenticate(request, undefined, { allowMustChange: true, ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    mockDb.session = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/auth/me`, ({ request }) => {
    const auth = authenticate(request, undefined, { allowMustChange: true, ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    return HttpResponse.json(toMe(auth.user))
  }),

  http.post(`${API}/auth/change-password`, async ({ request }) => {
    const auth = authenticate(request, undefined, { allowMustChange: true })
    if ('error' in auth) return auth.error
    const body = (await readJson(request)) as { currentPassword?: unknown; newPassword?: unknown } | undefined
    if (typeof body?.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
      return problem(400, 'invalid-body', 'Invalid body', 'currentPassword and newPassword are required.')
    }
    if (body.currentPassword !== auth.user.password) {
      return problem(400, 'current-password-incorrect', 'Current password is incorrect')
    }
    if (body.newPassword.length < 12) {
      return problem(400, 'password-too-short', 'Password too short', 'The new password needs at least 12 characters.')
    }
    auth.user.password = body.newPassword
    auth.user.mustChangePassword = false
    addUserAudit(auth.user.id, 'password-changed', { id: auth.user.id, name: auth.user.displayName }, null)
    // Like the API: the old access token stops working and the answer carries a new one (same shape as sign-in).
    const session = mockDb.session!
    const token = `mock-token-${session.userId}-${session.generation}`
    session.generation++
    return tokenResponse(auth.user.id, token)
  }),
]
