import { screen, waitFor, within } from '@testing-library/react'
import { afterEach } from 'vitest'
import { formatTimestamp } from '@/lib/dates'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'
import type { QueryClient } from '@tanstack/react-query'

afterEach(() => server.events.removeAllListeners())

function open(route: string, as = 'u-admin') {
  mockControl.signInAs(as)
  return renderApp(route)
}

const rowOf = async (name: string) => (await screen.findByRole('link', { name })).closest('tr')!

function cacheDump(qc: QueryClient): string {
  return JSON.stringify([
    ...qc.getQueryCache().getAll().map((q) => [q.state.data, q.state.error]),
    ...qc.getMutationCache().getAll().map((m) => [m.state.data, m.state.variables, m.state.error]),
  ])
}

async function createUser(user: ReturnType<typeof renderApp>['user'], email: string) {
  await user.click(await screen.findByRole('button', { name: 'New user' }))
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Display name'), 'Nina New')
  await user.click(screen.getByRole('button', { name: 'Create user' }))
}

describe('Users list', () => {
  test('lists everyone and filters by role and search', async () => {
    const { user } = open('/users')
    await rowOf('Asha K')
    expect(within(await rowOf('Dan Disabled')).getByText('Disabled')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Role' }))
    await user.click(await screen.findByRole('option', { name: 'Viewer' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Asha K' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Vera Viewer' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear Role filter' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'lena')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Asha K' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Lena Locked' })).toBeInTheDocument()
  })

  test('status badges: Active and Locked out (tooltip has the time)', async () => {
    open('/users')
    expect(within(await rowOf('Asha K')).getByText('Active')).toBeInTheDocument()
    const locked = within(await rowOf('Lena Locked')).getByText('Locked out')
    expect(locked).toHaveAttribute('title', `Locked until ${formatTimestamp('2099-01-01T00:00:00Z')}`)
  })

  test('an editor sees not found', async () => {
    open('/users', 'u-editor')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Users' })).not.toBeInTheDocument()
  })

  test('an editor sees not found on a user page too', async () => {
    open('/users/u-viewer', 'u-editor')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('Create user', () => {
  test('shows the temporary password once and never keeps it', async () => {
    const { user, queryClient } = open('/users')
    await createUser(user, 'nina@example.com')
    const dialog = await screen.findByRole('dialog', { name: 'Temporary password' })
    const password = within(dialog).getByLabelText('Temporary password').textContent!
    expect(password).toMatch(/^Temp-/)
    expect(within(dialog).getByText("You won't see this again.")).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(cacheDump(queryClient)).not.toContain(password)

    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText(password)).not.toBeInTheDocument()
    expect(cacheDump(queryClient)).not.toContain(password)
    expect(window.location.href).not.toContain(password)

    // The new user is listed; opening it shows no password.
    await user.click(await screen.findByRole('link', { name: 'Nina New' }))
    await screen.findByRole('heading', { name: 'Nina New' })
    expect(screen.queryByText(password)).not.toBeInTheDocument()
  })

  test('an existing email shows "That email already exists."', async () => {
    const { user } = open('/users')
    await createUser(user, 'eli@example.com')
    expect(await screen.findByText('That email already exists.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Temporary password' })).not.toBeInTheDocument()
  })
})

describe('User page', () => {
  test('changing the role sends PATCH with If-Match', async () => {
    const seen: { method: string; ifMatch: string | null; body: unknown }[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PATCH') {
        void request.clone().json().then((body: unknown) => seen.push({ method: 'PATCH', ifMatch: request.headers.get('If-Match'), body }))
      }
    })
    const { user } = open('/users/u-viewer')
    await screen.findByRole('heading', { name: 'Vera Viewer' })
    await user.selectOptions(screen.getByLabelText('Role'), 'editor')
    await user.click(screen.getByRole('button', { name: 'Save role' }))
    await waitFor(() => expect(mockDb.users.find((u) => u.id === 'u-viewer')!.role).toBe('editor'))
    expect(seen).toEqual([{ method: 'PATCH', ifMatch: '"1"', body: { role: 'editor' } }])
  })

  test('changing the display name works', async () => {
    const { user } = open('/users/u-viewer')
    const input = await screen.findByLabelText('Display name')
    await user.clear(input)
    await user.type(input, 'Vera V')
    await user.click(screen.getByRole('button', { name: 'Save display name' }))
    expect(await screen.findByRole('heading', { name: 'Vera V' })).toBeInTheDocument()
  })

  test('demoting the last admin shows the explained message', async () => {
    const { user } = open('/users/u-admin')
    await screen.findByRole('heading', { name: 'Asha K' })
    await user.selectOptions(screen.getByLabelText('Role'), 'editor')
    await user.click(screen.getByRole('button', { name: 'Save role' }))
    expect(await screen.findByText('There must be at least one active admin.')).toBeInTheDocument()
  })

  test('a stale user shows the reload message and Reload fetches the new version', async () => {
    const { user } = open('/users/u-viewer')
    await screen.findByRole('heading', { name: 'Vera Viewer' })
    mockDb.users.find((u) => u.id === 'u-viewer')!.rowVersion++
    await user.selectOptions(screen.getByLabelText('Role'), 'editor')
    await user.click(screen.getByRole('button', { name: 'Save role' }))
    expect(await screen.findByText('This user changed since you opened it. Reload.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByText('This user changed since you opened it. Reload.')).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Role'), 'editor')
    await user.click(screen.getByRole('button', { name: 'Save role' }))
    await waitFor(() => expect(mockDb.users.find((u) => u.id === 'u-viewer')!.role).toBe('editor'))
  })

  test('Disable is hidden on the admin\'s own page', async () => {
    open('/users/u-admin')
    await screen.findByRole('heading', { name: 'Asha K' })
    expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument()
  })

  test('Disable asks for confirmation, then Enable brings the user back', async () => {
    const { user } = open('/users/u-viewer')
    await screen.findByRole('heading', { name: 'Vera Viewer' })
    await user.click(screen.getByRole('button', { name: 'Disable' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('button', { name: 'Enable' })).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(mockDb.users.find((u) => u.id === 'u-viewer')!.disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Enable' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('button', { name: 'Disable' })).toBeInTheDocument()
  })

  test('Reset password shows a new one-time password that is not kept', async () => {
    const { user, queryClient } = open('/users/u-viewer')
    await screen.findByRole('heading', { name: 'Vera Viewer' })
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    const dialog = await screen.findByRole('dialog', { name: 'Temporary password' })
    const password = within(dialog).getByLabelText('Temporary password').textContent!
    expect(password).toMatch(/^Temp-/)
    expect(cacheDump(queryClient)).not.toContain(password)
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByText(password)).not.toBeInTheDocument())
    expect(cacheDump(queryClient)).not.toContain(password)
  })

  test('Unlock calls POST /unlock and the locked status clears', async () => {
    const calls: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') calls.push(new URL(request.url).pathname)
    })
    const { user } = open('/users/u-locked')
    await screen.findByText('Locked out')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(calls).toContain('/api/v2/users/u-locked/unlock')
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument()
  })
})

describe('Temporary password dialog', () => {
  test('Escape and a click outside keep the password on screen; only Done closes it', async () => {
    const { user } = open('/users')
    await createUser(user, 'nina@example.com')
    const dialog = await screen.findByRole('dialog', { name: 'Temporary password' })
    const password = within(dialog).getByLabelText('Temporary password').textContent!
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Temporary password' })).toHaveTextContent(password)
    // A click outside, on the overlay (the modal makes the page itself unclickable).
    await user.pointer({ keys: '[MouseLeft]', target: document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')! })
    expect(screen.getByRole('dialog', { name: 'Temporary password' })).toHaveTextContent(password)
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
