import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach } from 'vitest'
import type { Stats } from '@/api/schema'
import { mockDb, mockControl } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

const STATS: Stats = {
  byStatus: { pending: 7, posting: 0, posted: 4, partial: 2, unknown: 1, discarded: 2 },
  needsAttention: { pending: 2, all: 3 },
  duplicate: { pending: 1, all: 1 },
  hasErrors: { pending: 2, all: 3 },
}

const originalWidth = window.innerWidth
afterEach(() => {
  window.innerWidth = originalWidth
})

function activeOf(name: string | RegExp) {
  // The sidebar comes first in the document; a breadcrumb link with the same name may follow it.
  return screen.getAllByRole('link', { name })[0].closest('[data-active]')
}

describe('sidebar', () => {
  test('shows Statements, Audit trail and My account; Users only with users:manage', async () => {
    mockControl.signInAs('u-admin')
    const first = renderApp('/statements')
    expect(await screen.findByRole('link', { name: /Statements/ })).toHaveAttribute('href', '/statements')
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Audit trail' })).toHaveAttribute('href', '/audit')
    expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users')
    first.unmount()

    mockControl.signInAs('u-editor')
    renderApp('/statements')
    await screen.findByRole('link', { name: 'Audit trail' })
    expect(screen.getByRole('link', { name: 'My account' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  test('the Statements badge shows the to-review count; admins also count partial and unknown', async () => {
    server.use(http.get('/api/v2/saved-requests/stats', () => HttpResponse.json(STATS)))
    mockControl.signInAs('u-editor')
    const first = renderApp('/statements')
    expect(await screen.findByLabelText('7 to review')).toHaveTextContent('7')
    first.unmount()

    mockControl.signInAs('u-admin')
    renderApp('/statements')
    expect(await screen.findByLabelText('10 to review')).toHaveTextContent('10')
  })

  test('the active item follows the route, including /statements/:id', async () => {
    mockControl.signInAs('u-admin')
    const { router } = renderApp('/statements/5')
    await screen.findAllByRole('link', { name: /Statements/ })
    await waitFor(() => expect(activeOf(/Statements/)).toHaveAttribute('data-active', 'true'))
    expect(activeOf('Audit trail')).toHaveAttribute('data-active', 'false')
    await act(() => router.navigate('/audit'))
    await waitFor(() => expect(activeOf('Audit trail')).toHaveAttribute('data-active', 'true'))
  })

  test('sign out from the footer clears the session and goes to /sign-in', async () => {
    mockControl.signInAs('u-admin')
    const { user, router, queryClient } = renderApp('/statements')
    queryClient.setQueryData(['probe'], 'cached')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await screen.findByLabelText('Email')
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(mockDb.session).toBeNull()
    await waitFor(() => expect(queryClient.getQueryData(['probe'])).toBeUndefined())
  })

  test('below 900px the sidebar is a menu button that opens it as a sheet', async () => {
    window.innerWidth = 600
    mockControl.signInAs('u-admin')
    const { user } = renderApp('/statements')
    const menu = await screen.findByRole('button', { name: 'Menu' })
    expect(screen.queryByRole('link', { name: 'Audit trail' })).not.toBeInTheDocument()
    await user.click(menu)
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('link', { name: 'Audit trail' })).toBeInTheDocument()
  })
})

describe('routes', () => {
  test('/requests/5?x=1 redirects to /statements/5?x=1; /requests goes to /statements; / is Home', async () => {
    mockControl.signInAs('u-admin')
    const { router } = renderApp('/requests/5?x=1')
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe('/statements/5?x=1'))
    await act(() => router.navigate('/requests'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/statements'))
    await act(() => router.navigate('/'))
    expect(await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  test('the breadcrumb shows the parent trail on a detail page', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/statements/5')
    const crumb = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumb).getByRole('link', { name: 'Statements' })).toHaveAttribute('href', '/statements')
    expect(within(crumb).getByText('Statement')).toHaveAttribute('aria-current', 'page')
  })

  test('the breadcrumb names the current page', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/account')
    const crumb = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumb).getByText('My account')).toHaveAttribute('aria-current', 'page')
  })
})

describe('command menu', () => {
  test('Ctrl+K opens it; typing a reference lists the statement; Enter navigates', async () => {
    mockControl.signInAs('u-admin')
    const { user, router } = renderApp('/audit')
    await screen.findByRole('link', { name: 'Audit trail' })
    await user.keyboard('{Control>}k{/Control}')
    const input = await screen.findByPlaceholderText(/Search by reference/)
    await user.type(input, 'SR-000005')
    const options = await screen.findAllByRole('option', { name: /SR-000005/ })
    expect(options[0]).toHaveAttribute('data-selected', 'true')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/statements/5'))
    expect(screen.queryByPlaceholderText(/Search by reference/)).not.toBeInTheDocument()
  })

  test('the sidebar search button opens it and lists pages', async () => {
    mockControl.signInAs('u-editor')
    const { user } = renderApp('/audit')
    await user.click(await screen.findByRole('button', { name: /Search or jump to/ }))
    const list = await screen.findByRole('listbox')
    expect(await within(list).findByRole('option', { name: 'My account' })).toBeInTheDocument()
    expect(within(list).queryByRole('option', { name: 'Users' })).not.toBeInTheDocument()
  })
})

describe('top bar', () => {
  test('health light is OK on 200', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/statements')
    expect(await screen.findByLabelText('Database: OK')).toBeInTheDocument()
  })

  test('health light is unavailable on 503', async () => {
    mockControl.signInAs('u-admin')
    server.use(
      http.get('/api/v2/health/database', () =>
        HttpResponse.json(
          { title: 'Database unavailable', status: 503, code: 'database-unavailable' },
          { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderApp('/statements')
    expect(await screen.findByLabelText('Database: unavailable')).toBeInTheDocument()
  })
})
