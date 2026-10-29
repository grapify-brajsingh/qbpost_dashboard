import { createContext, useContext } from 'react'
import type { LoginResponse } from '@/api/queries/auth'
import type { Me } from '@/api/schema'

export interface SessionValue {
  me: Me | null
  status: 'restoring' | 'signed-in' | 'signed-out'
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  refetchMe(): Promise<void>
  /** Takes over the token and user from a sign-in-shaped answer (password change). */
  adoptSession(res: LoginResponse): void
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const v = useContext(SessionContext)
  if (!v) throw new Error('useSession must be used inside <SessionProvider>')
  return v
}

export function hasScope(me: Me | null, scope: string): boolean {
  return !!me && me.scopes.includes(scope)
}

/**
 * Only same-app absolute paths are allowed as a post-login destination: no `//host`, no backslash (browsers read
 * `/\host` as `//host`) and no control characters.
 */
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const SAME_APP_PATH =/^\/(?![/\\])[^\\\x00-\x1f]*$/

export function safeNext(next: string | null): string | null {
  return next && SAME_APP_PATH.test(next) ? next : null
}
