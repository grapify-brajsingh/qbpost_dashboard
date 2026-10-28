import { screen, waitFor, within } from '@testing-library/react'
import { afterEach } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import { addUserAudit } from '@/mocks/handlers/userHelpers'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

afterEach(() => server.events.removeAllListeners())

function open(route: string, as = 'u-admin') {
  mockControl.signInAs(as)
  return renderApp(route)
}

const rowOf = async (name: string) => (await screen.findByRole('link', { name })).closest('tr')!

describe('Users v2 list', () => {
  test('the status filter sends status=locked and lists only locked users', async () => {
    const urls: URL[] = []
    server.events.on('request:start', ({ request }) => {
      const u = new URL(request.url)
      if (u.pathname.endsWith('/users')) urls.push(u)
    })
    open('/users?status=locked')
    await rowOf('Lena Locked')
    expect(screen.queryByRole('link', { name: 'Asha K' })).not.toBeInTheDocument()
    expect(urls.some((u) => u.searchParams.getAll('status').join() === 'locked')).toBe(true)
  })

  test('garbage in the URL is ignored', async () => {
    open('/users?role=boss&status=nope&page=abc')
    expect(await rowOf('Asha K')).toBeInTheDocument()
  })

  test('Unlock shows only on locked rows, Enable only on disabled rows', async () => {
    open('/users')
    const locked = await rowOf('Lena Locked')
    const disabled = await rowOf('Dan Disabled')
    const active = await rowOf('Asha K')
    expect(within(locked).getByRole('button', { name: /^Unlock/ })).toBeInTheDocument()
    expect(within(disabled).queryByRole('button', { name: /^Unlock/ })).not.toBeInTheDocument()
    expect(within(active).queryByRole('button', { name: /^Unlock/ })).not.toBeInTheDocument()
    expect(within(disabled).getByRole('button', { name: /^Enable/ })).toBeInTheDocument()
    expect(within(locked).queryByRole('button', { name: /^Enable/ })).not.toBeInTheDocument()
    for (const row of [locked, disabled, active]) {
      expect(within(row).getByRole('button', { name: /^Reset password/ })).toBeInTheDocument()
      expect(within(row).getByRole('link', { name: /^Edit/ })).toBeInTheDocument()
    }
  })

  test('badges: Must set password, and inline Unlock / Enable work', async () => {
    mockDb.users.find((u) => u.id === 'u-viewer')!.mustChangePassword = true
    const { user } = open('/users')
    expect(within(await rowOf('Vera Viewer')).getByText('Must set password')).toBeInTheDocument()

    await user.click(within(await rowOf('Lena Locked')).getByRole('button', { name: /^Unlock/ }))
    await waitFor(() => expect(mockDb.users.find((u) => u.id === 'u-locked')!.lockedOutUntilUtc).toBeNull())
    await waitFor(() => expect(within(screen.getByRole('link', { name: 'Lena Locked' }).closest('tr')!).queryByRole('button', { name: /^Unlock/ })).not.toBeInTheDocument())

    await user.click(within(await rowOf('Dan Disabled')).getByRole('button', { name: /^Enable/ }))
    await waitFor(() => expect(mockDb.users.find((u) => u.id === 'u-disabled')!.disabled).toBe(false))
  })

  test('an avatar with initials sits next to name and email', async () => {
    open('/users')
    const row = await rowOf('Asha K')
    expect(within(row).getByText('AK')).toBeInTheDocument()
    expect(within(row).getByText('asha@example.com')).toBeInTheDocument()
  })
})

describe('New user dialog', () => {
  test('role toggle shows one line per role; creating shows the password until Done', async () => {
    const { user } = open('/users')
    await user.click(await screen.findByRole('button', { name: 'New user' }))
    const form = await screen.findByRole('dialog', { name: 'New user' })
    expect(within(form).getByText('Editors can fix and post statements.')).toBeInTheDocument()
    await user.click(within(form).getByRole('radio', { name: 'admin' }))
    expect(within(form).getByText('Admins manage users and can resolve posts.')).toBeInTheDocument()
    await user.click(within(form).getByRole('radio', { name: 'viewer' }))
    expect(within(form).getByText('Viewers can only look.')).toBeInTheDocument()

    await user.type(within(form).getByLabelText('Email'), 'nina@example.com')
    await user.type(within(form).getByLabelText('Display name'), 'Nina New')
    await user.click(within(form).getByRole('button', { name: 'Create user' }))
    expect(mockDb.users.find((u) => u.email === 'nina@example.com')?.role).toBe('viewer')

    const dialog = await screen.findByRole('dialog', { name: 'Temporary password' })
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Temporary password' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('User activity', () => {
  test('the user page lists that user\'s events from the audit feed', async () => {
    addUserAudit('u-viewer', 'role-changed', { id: 'u-admin', name: 'Asha K', email: 'asha@example.com' }, { from: 'viewer', to: 'editor' })
    open('/users/u-admin')
    const section = await screen.findByRole('region', { name: 'Activity' })
    expect(await within(section).findByRole('table')).toBeInTheDocument()
    expect(within(section).getAllByText('Asha K').length).toBeGreaterThan(0)
    expect(within(section).queryByText('Vera Viewer')).not.toBeInTheDocument()
  })

  test('a user with no events says so', async () => {
    open('/users/u-viewer')
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument()
  })
})
