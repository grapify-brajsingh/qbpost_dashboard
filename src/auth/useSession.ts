import { createContext, useContext } from 'react'
import type { Me } from '@/api/schema'

export interface SessionValue {
  me: Me | null
  status: 'restoring' | 'signed-in' | 'signed-out'
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  refetchMe(): Promise<void>
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

/** Only same-app absolute paths are allowed as a post-login destination. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}
