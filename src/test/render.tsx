import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { RouteObject } from 'react-router'
import { routes } from '@/router'

export type RenderAppResult = RenderResult & {
  user: UserEvent
  queryClient: QueryClient
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function mount(routeObjects: RouteObject[], route: string): RenderAppResult {
  const queryClient = makeQueryClient()
  const router = createMemoryRouter(routeObjects, { initialEntries: [route] })
  const user = userEvent.setup()
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, user, queryClient }
}

/** Renders the full route table at `route`. */
export function renderApp(route: string): RenderAppResult {
  return mount(routes, route)
}

/** Mounts `ui` inside a data memory router (supports useBlocker) plus providers. */
export function renderWithProviders(
  ui: ReactElement,
  opts: { route?: string } = {},
): RenderAppResult {
  return mount([{ path: '*', element: ui }], opts.route ?? '/')
}
