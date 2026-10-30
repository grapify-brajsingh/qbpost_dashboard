import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '@/test/render'
import { server } from '@/mocks/server'
import { mockControl, mockDb } from '@/mocks/db'
import { MOCK_PASSWORD } from '@/mocks/fixtures/users'
import { safeNext } from './useSession'

async function fillSignIn(user: ReturnType<typeof renderApp>['user'], email: string, password = MOCK_PASSWORD) {
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

function problemResponse(status: number, body: Record<string, unknown>) {
  return HttpResponse.json({ status, ...body }, { status, headers: { 'Content-Type': 'application/problem+json' } })
}

afterEach(() => {
  server.events.removeAllListeners()
})

describe('sign in', () => {
  test('wrong password', async () => {
    const { user } = renderApp('/sign-in')
    await fillSignIn(user, 'asha@example.com', 'nope nope nope')
    expect(await screen.findByText('Email or password is wrong.')).toBeInTheDocument()
  })

  test('locked account shows minutes from Retry-After', async () => {
    const { user } = renderApp('/sign-in')
    await fillSignIn(user, 'lena@example.com')
    expect(await screen.findByText('Locked. Try again in 5 minutes.')).toBeInTheDocument()
  })

  test('503 shows the problem detail', async () => {
    server.use(
      http.post('/api/v2/auth/login', () =>
        problemResponse(503, { title: 'Database unavailable', detail: 'The database is not reachable.' }),
      ),
    )
    const { user } = renderApp('/sign-in')
    await fillSignIn(user, 'asha@example.com')
    expect(await screen.findByText('The database is not reachable.')).toBeInTheDocument()
  })

  test('mustChangePassword lands on change password and /statements redirects back', async () => {
    mockDb.users.find((u) => u.id === 'u-editor')!.mustChangePassword = true
    const { user, router } = renderApp('/sign-in')
    await fillSignIn(user, 'eli@example.com')
    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/change-password')
    await act(() => router.navigate('/statements'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'))
    expect(screen.queryByRole('heading', { name: 'Statements' })).not.toBeInTheDocument()
  })

  test('a 403 password-change-required from any call sends the user to change password', async () => {
    mockControl.signInAs('u-admin')
    server.use(
      http.get('/api/v2/health/database', () =>
        problemResponse(403, { title: 'Password change required', code: 'password-change-required' }),
      ),
    )
    const { router } = renderApp('/requests')
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'))
  })
})

describe('change password', () => {
  function mustChange() {
    mockDb.users.find((u) => u.id === 'u-editor')!.mustChangePassword = true
    mockControl.signInAs('u-editor')
  }

  test('too short is rejected before sending', async () => {
    mustChange()
    let sent = false
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/auth/change-password')) sent = true
    })
    const { user } = renderApp('/change-password')
    await user.type(await screen.findByLabelText('Current password'), MOCK_PASSWORD)
    await user.type(screen.getByLabelText('New password'), 'short-11-ch')
    await user.type(screen.getByLabelText('Confirm new password'), 'short-11-ch')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('At least 12 characters')).toBeInTheDocument()
    expect(sent).toBe(false)
  })

  test('mismatched confirmation', async () => {
    mustChange()
    const { user } = renderApp('/change-password')
    await user.type(await screen.findByLabelText('Current password'), MOCK_PASSWORD)
    await user.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await user.type(screen.getByLabelText('Confirm new password'), 'a different passphrase')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument()
  })

  test('success with no next goes to Home', async () => {
    mustChange()
    const { user, router } = renderApp('/change-password')
    await user.type(await screen.findByLabelText('Current password'), MOCK_PASSWORD)
    await user.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await user.type(screen.getByLabelText('Confirm new password'), 'a brand new passphrase')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    // Change-password, a session refresh and the Home page's first queries: allow more than the default second.
    expect(await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ }, { timeout: 4000 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('session restore and guards', () => {
  test('valid refresh cookie signs in without showing the form', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/requests')
    // First full-app render in this file: it loads the page modules once, which can take over the default 1 s.
    expect(await screen.findByRole('heading', { name: 'Statements' }, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  test('no session redirects to sign-in with next, and returns after sign-in', async () => {
    const { user, router } = renderApp('/statements/5')
    await screen.findByLabelText('Email')
    expect(router.state.location.pathname + router.state.location.search).toBe('/sign-in?next=%2Fstatements%2F5')
    await fillSignIn(user, 'asha@example.com')
    expect(await screen.findByRole('heading', { level: 1, name: 'Chase statement – Aug 2026 (resent)' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/statements/5')
  })

  test('sign out calls logout, clears the query cache and goes to sign-in', async () => {
    mockControl.signInAs('u-admin')
    let logoutCalled = false
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/auth/logout')) logoutCalled = true
    })
    const { user, router, queryClient } = renderApp('/requests')
    await screen.findByRole('heading', { name: 'Statements' })
    queryClient.setQueryData(['probe'], 'cached')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await screen.findByLabelText('Email')
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(logoutCalled).toBe(true)
    expect(mockDb.session).toBeNull()
    await waitFor(() => expect(queryClient.getQueryData(['probe'])).toBeUndefined())
  })
})

describe('safeNext', () => {
  test('keeps only same-site paths', () => {
    expect(safeNext('/requests/5?tab=history')).toBe('/requests/5?tab=history')
    for (const bad of ['//evil.com', 'https://x', '/\\evil.com', '/a\nb', '', null]) expect(safeNext(bad)).toBeNull()
  })
})
