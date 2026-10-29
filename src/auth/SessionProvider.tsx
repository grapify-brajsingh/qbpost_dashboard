import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { fetchMe, login, logout, type LoginResponse } from '@/api/queries/auth'
import { onPasswordChangeRequired } from '@/api/queryClient'
import { onSessionEnded, refreshSession, setAccessToken } from '@/api/session'
import type { Me } from '@/api/schema'
import { SessionContext, type SessionValue } from './useSession'

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [me, setMe] = useState<Me | null>(null)
  const [status, setStatus] = useState<SessionValue['status']>('restoring')

  // Restore on load: refresh cookie -> token -> /auth/me.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let restored: Me | null = null
      if ((await refreshSession()) !== null) {
        try {
          restored = await fetchMe()
        } catch {
          restored = null
        }
      }
      if (cancelled) return
      setMe(restored)
      setStatus(restored ? 'signed-in' : 'signed-out')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Session rejected here or in another tab.
  useEffect(
    () =>
      onSessionEnded(() => {
        setMe(null)
        setStatus('signed-out')
      }),
    [],
  )

  // Signed out (sign out, expiry, or failed restore): drop everything cached for the previous user.
  // Done in an effect so the shell has unmounted and no active query refetches without a token.
  useEffect(() => {
    if (status === 'signed-out') queryClient.clear()
  }, [status, queryClient])

  const refetchMe = useCallback(async () => {
    setMe(await fetchMe())
  }, [])

  // Global handler for 403 password-change-required (see src/api/queryClient.ts).
  useEffect(
    () =>
      onPasswordChangeRequired(() => {
        setMe((m) => (m && !m.mustChangePassword ? { ...m, mustChangePassword: true } : m))
        if (location.pathname !== '/change-password') {
          const next = encodeURIComponent(location.pathname + location.search)
          void navigate(`/change-password?next=${next}`, { replace: true })
        }
      }),
    [navigate, location.pathname, location.search],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await login(email, password)
    setAccessToken(res.accessToken, { broadcast: true })
    setMe(res.user)
    setStatus('signed-in')
  }, [])

  const adoptSession = useCallback((res: LoginResponse) => {
    setAccessToken(res.accessToken, { broadcast: true })
    setMe(res.user)
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // The server session may already be gone; sign out locally regardless.
    }
    setAccessToken(null, { broadcast: true })
    setMe(null)
    setStatus('signed-out')
    void navigate('/sign-in', { replace: true })
  }, [navigate])

  const value = useMemo<SessionValue>(
    () => ({ me, status, signIn, signOut, refetchMe, adoptSession }),
    [me, status, signIn, signOut, refetchMe, adoptSession],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
