import { Link, Navigate } from 'react-router'
import type { RouteObject } from 'react-router'

function RequestsPlaceholder() {
  return <h1 className="p-6 text-xl font-semibold">Requests</h1>
}

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
  { path: '/', element: <Navigate to="/requests" replace /> },
  { path: '/requests', element: <RequestsPlaceholder /> },
  { path: '*', element: <NotFound /> },
]
