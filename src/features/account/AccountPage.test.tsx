import { screen } from '@testing-library/react'
import { mockControl } from '@/mocks/db'
import { MOCK_PASSWORD } from '@/mocks/fixtures/users'
import { renderApp } from '@/test/render'

describe('My account', () => {
  test('shows name, email and role', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/account')
    expect(await screen.findByRole('heading', { name: 'My account' })).toBeInTheDocument()
    expect(screen.getByText('Asha K', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('asha@example.com')).toBeInTheDocument()
    expect(screen.getByText('Admin', { selector: 'dd' })).toBeInTheDocument()
  })

  test('changes the password, checking the 12 character minimum first', async () => {
    mockControl.signInAs('u-admin')
    const { user } = renderApp('/account')
    await user.type(await screen.findByLabelText('Current password'), MOCK_PASSWORD)
    await user.type(screen.getByLabelText('New password'), 'short-11-ch')
    await user.type(screen.getByLabelText('Confirm new password'), 'short-11-ch')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('At least 12 characters')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('New password'))
    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await user.type(screen.getByLabelText('Confirm new password'), 'a brand new passphrase')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Password changed.')).toBeInTheDocument()
  })

  test('offers Light, Dark and Match computer', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/account')
    await screen.findByRole('heading', { name: 'My account' })
    for (const name of ['Light', 'Dark', 'Match computer']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
  })
})
