import { expect, test } from '@playwright/test'
import { ensureAdmin, signIn, signInToHome, unique, watchForErrors } from './support'

test.beforeAll(async ({ request }) => {
  await ensureAdmin(request)
})

test('admin creates an editor, the editor signs in with the temporary password and must change it', async ({ page, browser }) => {
  const errors = watchForErrors(page)
  const email = `${unique('editor')}@example.com`

  await signInToHome(page)
  await page.getByRole('link', { name: 'Users' }).click()
  await page.getByRole('button', { name: 'New user' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Display name').fill('Eddie Editor')
  await page.getByRole('radio', { name: 'editor' }).click()
  await page.getByRole('button', { name: 'Create user' }).click()
  const temporary = (await page.getByRole('dialog').locator('code').innerText()).trim()
  expect(temporary.length).toBeGreaterThanOrEqual(12)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByPlaceholder('Search name or email').fill(email)
  await expect(page.getByRole('row').filter({ hasText: email })).toContainText('Editor')

  // A second browser: the editor's first sign-in goes to the change-password page.
  const ctx = await browser.newContext()
  const editor = await ctx.newPage()
  await signIn(editor, email, temporary)
  await expect(editor).toHaveURL(/change-password/)
  const newPassword = 'Editor-Integration-Pass-9'
  await editor.getByLabel('Current password').fill(temporary)
  await editor.getByLabel('New password', { exact: true }).fill(newPassword)
  await editor.getByLabel('Confirm new password').fill(newPassword)
  await editor.getByRole('button', { name: 'Change password' }).click()
  await expect(editor.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
  // Editors don't manage users.
  await expect(editor.getByRole('link', { name: 'Users' })).toHaveCount(0)

  // The session survives a reload: the refresh cookie (path /api/v2/auth) gets a new access token.
  await editor.reload()
  await expect(editor.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
  await ctx.close()

  expect(errors).toEqual([])
})

test('admin disables a user on the user page and enables them again from the list', async ({ page }) => {
  const errors = watchForErrors(page)
  const email = `${unique('viewer')}@example.com`

  await signInToHome(page)
  await page.getByRole('link', { name: 'Users' }).click()
  await page.getByRole('button', { name: 'New user' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Display name').fill('Vera Viewer')
  await page.getByRole('button', { name: 'Create user' }).click()
  await page.getByRole('button', { name: 'Done' }).click()

  // Other test runs leave users behind, so find this one by email rather than on page 1.
  await page.getByPlaceholder('Search name or email').fill(email)
  await page.getByRole('row').filter({ hasText: email }).getByRole('link', { name: 'Edit Vera Viewer' }).click()
  await page.getByRole('button', { name: 'Disable', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('button', { name: 'Enable', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Users', exact: true }).first().click()
  await page.getByPlaceholder('Search name or email').fill(email)
  const row = page.getByRole('row').filter({ hasText: email })
  await expect(row).toContainText('Disabled')
  await row.getByRole('button', { name: 'Enable Vera Viewer' }).click()
  await expect(row).not.toContainText('Disabled')
  await expect(page.getByRole('alert')).toHaveCount(0)

  // The audit trail names the user each event is about, not their id (R-7.3).
  await page.goto('/audit?action=user-created,user-disabled,user-enabled')
  await expect(page.getByRole('row').filter({ hasText: `Created user ${email}` }).first()).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: `Disabled ${email}` }).first()).toBeVisible()

  expect(errors).toEqual([])
})
