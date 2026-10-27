import { Link, Navigate, Outlet } from 'react-router'
import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { ChangePasswordPage } from '@/auth/ChangePasswordPage'
import { RequireAuth } from '@/auth/RequireAuth'
import { SessionProvider } from '@/auth/SessionProvider'
import { SignInPage } from '@/auth/SignInPage'
import { hasScope, useSession } from '@/auth/useSession'
import { RequestDetailPage } from '@/features/requests/detail/RequestDetailPage'
import { RequestsPage } from '@/features/requests/list/RequestsPage'
import { UserPage } from '@/features/users/UserPage'
import { UsersPage } from '@/features/users/UsersPage'
import { AppShell } from '@/layout/AppShell'

function NotFound() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link className="underline" to="/requests">
        Back to Requests
      </Link>
    </div>
  )
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { me } = useSession()
  return hasScope(me, 'users:manage') ? children : <NotFound />
}

export const routes: RouteObject[] = [
  {
    // The session provider navigates, so it lives inside the data router.
    element: (
      <SessionProvider>
        <Outlet />
      </SessionProvider>
    ),
    children: [
      { path: '/sign-in', element: <SignInPage /> },
      {
        path: '/change-password',
        element: (
          <RequireAuth allowMustChange>
            <ChangePasswordPage />
          </RequireAuth>
        ),
      },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { path: '/', element: <Navigate to="/requests" replace /> },
          { path: '/requests', element: <RequestsPage /> },
          { path: '/requests/:id', element: <RequestDetailPage /> },
          { path: '/users', element: <RequireAdmin><UsersPage /></RequireAdmin> },
          { path: '/users/:id', element: <RequireAdmin><UserPage /></RequireAdmin> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]
