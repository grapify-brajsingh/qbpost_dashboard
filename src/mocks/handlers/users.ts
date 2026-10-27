import { http, HttpResponse } from 'msw'
import type { Role } from '@/api/schema'
import { mockDb } from '../db'
import type { MockUser } from '../fixtures/users'
import { API, actorOf, authenticate, notFound, paginate, parseIfMatch, problem, readJson } from './common'
import { addUserAudit, newTemporaryPassword, toUser } from './userHelpers'

const ROLES: Role[] = ['admin', 'editor', 'viewer']
const isRole = (v: unknown): v is Role => ROLES.includes(v as Role)
const find = (id: unknown) => mockDb.users.find((u) => u.id === id)

function userResponse(u: MockUser, status = 200, extra: Record<string, unknown> = {}) {
  return HttpResponse.json({ ...toUser(u), ...extra }, { status, headers: { ETag: `"${u.rowVersion}"` } })
}

export const userHandlers = [
  http.get(`${API}/users`, ({ request }) => {
    const auth = authenticate(request, 'users:manage')
    if ('error' in auth) return auth.error
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const role = url.searchParams.get('role')
    const disabled = url.searchParams.get('disabled')
    if ((role && !isRole(role)) || (disabled && disabled !== 'true' && disabled !== 'false')) {
      return problem(400, 'invalid-query', 'Invalid query', 'Unknown role or disabled value.')
    }
    const matches = mockDb.users.filter(
      (u) =>
        (!q || u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)) &&
        (!role || u.role === role) &&
        (!disabled || u.disabled === (disabled === 'true')),
    )
    const page = paginate(matches.map(toUser), url)
    return 'error' in page ? page.error : HttpResponse.json(page)
  }),

  http.post(`${API}/users`, async ({ request }) => {
    const auth = authenticate(request, 'users:manage')
    if ('error' in auth) return auth.error
    const body = (await readJson(request)) as { email?: unknown; displayName?: unknown; role?: unknown } | undefined
    if (typeof body?.email !== 'string' || !body.email.includes('@') || typeof body.displayName !== 'string' || !body.displayName || !isRole(body.role)) {
      return problem(400, 'invalid-body', 'Invalid body', 'email, displayName and a valid role are required.')
    }
    const email = body.email
    if (mockDb.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return problem(409, 'email-exists', 'Email already exists', `A user with ${email} already exists.`)
    }
    const temporaryPassword = newTemporaryPassword()
    const user: MockUser = {
      id: `u-${mockDb.users.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
      email,
      displayName: body.displayName,
      role: body.role,
      disabled: false,
      lockedOutUntilUtc: null,
      lastLoginUtc: null,
      rowVersion: 1,
      mustChangePassword: true,
      password: temporaryPassword,
    }
    mockDb.users.push(user)
    addUserAudit(user.id, 'created', actorOf(auth.user), { role: user.role })
    return userResponse(user, 201, { temporaryPassword })
  }),

  http.get(`${API}/users/:id`, ({ request, params }) => {
    const auth = authenticate(request, 'users:manage')
    if ('error' in auth) return auth.error
    const user = find(params.id)
    return user ? userResponse(user) : notFound('User')
  }),

  http.patch(`${API}/users/:id`, async ({ request, params }) => {
    const auth = authenticate(request, 'users:manage')
    if ('error' in auth) return auth.error
    const user = find(params.id)
    if (!user) return notFound('User')
    const ifMatch = parseIfMatch(request)
    if (ifMatch === undefined) {
      return problem(428, 'precondition-required', 'Precondition required', 'Send If-Match with the ETag you loaded.')
    }
    if (ifMatch !== user.rowVersion) {
      return problem(412, 'edited-by-someone-else', 'Edited by someone else', 'This user changed since you loaded it.', {
        rowVersion: user.rowVersion,
      })
    }
    const body = (await readJson(request)) as { displayName?: unknown; role?: unknown; disabled?: unknown } | undefined
    if (
      !body ||
      (body.displayName !== undefined && (typeof body.displayName !== 'string' || !body.displayName)) ||
      (body.role !== undefined && !isRole(body.role)) ||
      (body.disabled !== undefined && typeof body.disabled !== 'boolean')
    ) {
      return problem(400, 'invalid-body', 'Invalid body', 'displayName, role or disabled is invalid.')
    }
    const wasAdmin = user.role === 'admin' && !user.disabled
    const nextRole = (body.role as Role | undefined) ?? user.role
    const nextDisabled = (body.disabled as boolean | undefined) ?? user.disabled
    if (body.disabled === true && user.id === auth.user.id) {
      return problem(409, 'cannot-disable-self', 'Cannot disable yourself', 'An admin cannot disable their own account.')
    }
    const stillAdmin = nextRole === 'admin' && !nextDisabled
    const otherAdmins = mockDb.users.filter((u) => u.id !== user.id && u.role === 'admin' && !u.disabled).length
    if (wasAdmin && !stillAdmin && otherAdmins === 0) {
      return problem(409, 'last-admin', 'Last admin', 'The only enabled admin cannot be demoted or disabled.')
    }
    const actor = actorOf(auth.user)
    if (nextRole !== user.role) addUserAudit(user.id, 'role-changed', actor, { from: user.role, to: nextRole })
    if (nextDisabled !== user.disabled) addUserAudit(user.id, nextDisabled ? 'disabled' : 'enabled', actor, null)
    user.role = nextRole
    user.disabled = nextDisabled
    if (typeof body.displayName === 'string') user.displayName = body.displayName
    user.rowVersion++
    if (user.disabled && mockDb.session?.userId === user.id) mockDb.session = null
    return userResponse(user)
  }),

  http.post(`${API}/users/:id/reset-password`, ({ request, params }) => {
    const auth = authenticate(request, 'users:manage')
    if ('error' in auth) return auth.error
    const user = find(params.id)
    if (!user) return notFound('User')
    const temporaryPassword = newTemporaryPassword()
    user.password = temporaryPassword
    user.mustChangePassword = true
    user.rowVersion++
    addUserAudit(user.id, 'password-reset', actorOf(auth.user), null)
    return HttpResponse.json({ temporaryPassword })
  }),

  http.post(`${API}/users/:id/unlock`, ({ request, params }) => {
    const auth = authenticate(request, 'users:manage')
    if ('error' in auth) return auth.error
    const user = find(params.id)
    if (!user) return notFound('User')
    user.lockedOutUntilUtc = null
    user.rowVersion++
    addUserAudit(user.id, 'unlocked', actorOf(auth.user), null)
    return userResponse(user)
  }),

  http.get(`${API}/users/:id/audit`, ({ request, params }) => {
    const auth = authenticate(request, 'users:manage')
    if ('error' in auth) return auth.error
    const user = find(params.id)
    if (!user) return notFound('User')
    return HttpResponse.json([...(mockDb.userAudit[user.id] ?? [])].reverse())
  }),
]
