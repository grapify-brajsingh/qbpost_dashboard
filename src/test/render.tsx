import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { RouteObject } from 'react-router'
import { makeQueryClient } from '@/api/queryClient'
import { routes } from '@/router'

export type RenderAppResult = RenderResult & {
  user: UserEvent
  queryClient: QueryClient
  router: ReturnType<typeof createMemoryRouter>
}

function mount(routeObjects: RouteObject[], route: string): RenderAppResult {
  const queryClient = makeQueryClient({ retry: false })
  const router = createMemoryRouter(routeObjects, { initialEntries: [route] })
  const user = userEvent.setup()
  const result = render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="qbpost-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return { ...result, user, queryClient, router }
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
