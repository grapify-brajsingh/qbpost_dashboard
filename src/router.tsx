import { Link, Navigate, Outlet } from 'react-router'
import type { RouteObject } from 'react-router'
import { ChangePasswordPage } from '@/auth/ChangePasswordPage'
import { RequireAuth } from '@/auth/RequireAuth'
import { SessionProvider } from '@/auth/SessionProvider'
import { SignInPage } from '@/auth/SignInPage'
import { RequestDetailPage } from '@/features/requests/detail/RequestDetailPage'
import { RequestsPage } from '@/features/requests/list/RequestsPage'
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
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]
