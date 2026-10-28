import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router'
import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { ChangePasswordPage } from '@/auth/ChangePasswordPage'
import { RequireAuth } from '@/auth/RequireAuth'
import { SessionProvider } from '@/auth/SessionProvider'
import { SignInPage } from '@/auth/SignInPage'
import { hasScope, useSession } from '@/auth/useSession'
import { AccountPage } from '@/features/account/AccountPage'
import { AuditPage } from '@/features/audit/AuditPage'
import { HomePage } from '@/features/home/HomePage'
import { StatementPage } from '@/features/statements/detail/StatementPage'
import { StatementsPage } from '@/features/statements/list/StatementsPage'
import { UploadPage } from '@/features/statements/upload/UploadPage'
import { UserPage } from '@/features/users/UserPage'
import { UsersPage } from '@/features/users/UsersPage'
import { AppShell } from '@/layout/AppShell'

function NotFound() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link className="underline" to="/statements">
        Back to Statements
      </Link>
    </div>
  )
}

/** Pages for some roles only: anyone else gets Page not found. The API enforces the same scope. */
function RequireScope({ scope, children }: { scope: string; children: ReactNode }) {
  const { me } = useSession()
  return hasScope(me, scope) ? children : <NotFound />
}

function RequireAdmin({ children }: { children: ReactNode }) {
  return <RequireScope scope="users:manage">{children}</RequireScope>
}

/** Keyed by id: nothing on the page (draft, post state, dialogs) carries over to another statement. */
function StatementRoute() {
  const { id } = useParams()
  return <StatementPage key={id} />
}

/** Old v1 addresses keep working: same id, same query string. */
function RedirectToStatements() {
  const { id } = useParams()
  const { search } = useLocation()
  return <Navigate to={`/statements${id ? `/${encodeURIComponent(id)}` : ''}${search}`} replace />
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
          { path: '/', element: <HomePage />, handle: { crumb: 'Home' } },
          { path: '/requests', element: <RedirectToStatements /> },
          { path: '/requests/:id', element: <RedirectToStatements /> },
          {
            path: '/statements',
            handle: { crumb: 'Statements' },
            children: [
              { index: true, element: <StatementsPage /> },
              {
                path: 'upload',
                element: (
                  <RequireScope scope="requests:submit">
                    <UploadPage />
                  </RequireScope>
                ),
                handle: { crumb: 'Upload PDF' },
              },
              { path: ':id', element: <StatementRoute />, handle: { crumb: 'Statement' } },
            ],
          },
          { path: '/audit', element: <AuditPage />, handle: { crumb: 'Audit trail' } },
          {
            path: '/users',
            handle: { crumb: 'Users' },
            children: [
              { index: true, element: <RequireAdmin><UsersPage /></RequireAdmin> },
              { path: ':id', element: <RequireAdmin><UserPage /></RequireAdmin>, handle: { crumb: 'User' } },
            ],
          },
          { path: '/account', element: <AccountPage />, handle: { crumb: 'My account' } },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]
