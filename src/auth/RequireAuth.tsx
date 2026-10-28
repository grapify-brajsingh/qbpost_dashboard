import type { ReactNode } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from './useSession'

export function FullPageLoading() {
  return (
    <div role="status" className="grid min-h-screen place-items-center text-sm text-muted-foreground">
      <span className="flex items-center gap-2.5 animate-in fade-in-0 delay-150 fill-mode-backwards duration-300">
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
        Loading…
      </span>
    </div>
  )
}

/**
 * Signed-out users go to /sign-in?next=<path>. Users who must change their password can only reach pages
 * rendered with `allowMustChange` (the change-password page).
 */
export function RequireAuth({ children, allowMustChange = false }: { children: ReactNode; allowMustChange?: boolean }) {
  const { me, status } = useSession()
  const location = useLocation()
  if (status === 'restoring') return <FullPageLoading />
  const here = encodeURIComponent(location.pathname + location.search)
  if (status === 'signed-out' || !me) return <Navigate to={`/sign-in?next=${here}`} replace />
  if (me.mustChangePassword && !allowMustChange) return <Navigate to={`/change-password?next=${here}`} replace />
  return <>{children}</>
}
