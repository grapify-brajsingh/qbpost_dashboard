import { HttpResponse } from 'msw'
import type { Actor, Me, Role } from '@/api/schema'
import { mockControl, mockDb } from '../db'
import type { MockUser } from '../fixtures/users'

export const API = '/api/v1'

export type Scope =
  | 'requests:submit'
  | 'requests:read'
  | 'requests:edit'
  | 'requests:post'
  | 'requests:admin'
  | 'users:manage'
  | 'lists:read'

const VIEWER: Scope[] = ['requests:read', 'lists:read']
const EDITOR: Scope[] = [...VIEWER, 'requests:submit', 'requests:edit', 'requests:post']
const SCOPES: Record<Role, Scope[]> = {
  viewer: VIEWER,
  editor: EDITOR,
  admin: [...EDITOR, 'requests:admin', 'users:manage'],
}

export const scopesFor = (role: Role): string[] => SCOPES[role]

/** RFC 7807 response with the documented extension fields. */
export function problem(
  status: number,
  code: string,
  title: string,
  detail?: string,
  extensions: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return HttpResponse.json(
    { type: `https://qbautopost/problems/${code}`, title, status, detail, code, ...extensions },
    { status, headers: { 'Content-Type': 'application/problem+json', ...headers } },
  )
}

export const notFound = (what = 'Saved request') => problem(404, 'not-found', 'Not found', `${what} was not found.`)

export const nowUtc = () => new Date().toISOString()

export const actorOf = (u: MockUser): Actor => ({ id: u.id, name: u.displayName, email: u.email })

export function toMe(u: MockUser): Me {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    scopes: scopesFor(u.role),
  }
}

interface AuthOptions {
  /** Routes that stay reachable while the user must change their password. */
  allowMustChange?: boolean
  /** Routes that do not touch the database (lists, health). */
  ignoreDatabaseDown?: boolean
}

/**
 * Checks `Authorization: Bearer mock-token-<userId>-<n>` against the server-side session
 * (n must be generation - 1, the latest token issued), then must-change-password, then the scope.
 */
export function authenticate(
  request: Request,
  scope?: Scope,
  opts: AuthOptions = {},
): { user: MockUser } | { error: Response } {
  const unauthorized = () => ({
    error: problem(401, 'unauthorized', 'Unauthorized', 'A valid access token is required.'),
  })
  const header = request.headers.get('Authorization') ?? ''
  const m = /^Bearer mock-token-(.+)-(\d+)$/.exec(header)
  const session = mockDb.session
  if (!m || !session || m[1] !== session.userId || Number(m[2]) !== session.generation - 1) return unauthorized()
  const user = mockDb.users.find((u) => u.id === session.userId)
  if (!user || user.disabled) return unauthorized()
  if (user.mustChangePassword && !opts.allowMustChange) {
    return {
      error: problem(403, 'password-change-required', 'Password change required', 'Change your password to continue.'),
    }
  }
  if (scope && !scopesFor(user.role).includes(scope)) {
    return { error: problem(403, 'forbidden', 'Forbidden', 'Your role does not allow this action.') }
  }
  if (mockControl.databaseDown && !opts.ignoreDatabaseDown) {
    return {
      error: problem(503, 'database-unavailable', 'Database unavailable', 'The database is not reachable.', {}, {
        'Retry-After': '30',
      }),
    }
  }
  return { user }
}

/** Parses `"4"`, `W/"4"` or `4` into a number; null when absent or malformed. */
export function parseIfMatch(request: Request): number | null | undefined {
  const raw = request.headers.get('If-Match')
  if (raw === null) return undefined
  const n = Number(raw.replace(/^W\//, '').replace(/"/g, ''))
  return Number.isFinite(n) ? n : null
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number } | { error: Response }

export function paginate<T>(items: T[], url: URL, sizes = { default: 25, max: 100 }): Paged<T> {
  const num = (name: string, def: number, min: number, max: number) => {
    const raw = url.searchParams.get(name)
    if (raw === null) return def
    const n = Number(raw)
    return Number.isInteger(n) && n >= min && n <= max ? n : NaN
  }
  const page = num('page', 1, 1, 1_000_000)
  const pageSize = num('pageSize', sizes.default, 1, sizes.max)
  if (Number.isNaN(page) || Number.isNaN(pageSize)) {
    return { error: problem(400, 'invalid-query', 'Invalid query', `page must be >= 1 and pageSize between 1 and ${sizes.max}.`) }
  }
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length }
}
