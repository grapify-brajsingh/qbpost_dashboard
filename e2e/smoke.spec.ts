import { expect, test, type Page } from '@playwright/test'

// The mock API (MSW) runs inside the page, so each test starts from a fresh mock database.
const PASSWORD = 'correct horse battery'

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email').fill('asha@example.com')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/requests/)
}

test('edit a payee, save, post, and see the TxnIDs', async ({ page }) => {
  await signIn(page)

  // The To-do queue lists the 12-row pending request.
  await expect(page.getByRole('tab', { name: /^To do/ })).toHaveAttribute('data-state', 'active')
  await page.getByRole('link', { name: 'SR-000001' }).click()
  await expect(page.getByRole('heading', { name: 'SR-000001' })).toBeVisible()

  // Change row 1's payee through the combo.
  const payee = page.locator('tr[data-row="1"] td[data-field="payee"]')
  await expect(payee).toContainText('Metro Electric Co')
  await payee.click()
  await page.getByRole('option', { name: 'ABC Plumbing LLC' }).click()
  await expect(payee).toHaveAttribute('data-dirty', 'true')

  // Save: the PUT succeeds and the tint clears.
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(payee).not.toHaveAttribute('data-dirty', 'true')
  await expect(payee).toContainText('ABC Plumbing LLC')

  // Post and confirm.
  const actions = page.getByRole('group', { name: 'Request actions' })
  await actions.getByRole('button', { name: 'Post' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('status', { name: 'Post result' })).toContainText('Posted', { timeout: 10_000 })

  // The Attempts tab lists the TxnIDs.
  await page.getByRole('tab', { name: 'Attempts' }).click()
  await page.getByRole('button', { name: /^Attempt \d+$/, expanded: false }).first().click()
  await expect(page.getByRole('columnheader', { name: 'TxnID' })).toBeVisible()
  await expect(page.locator('td.font-mono').first()).not.toBeEmpty()
})

test('in-app navigation keeps the user signed in', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'SR-000001' }).click()
  await expect(page.getByRole('heading', { name: 'SR-000001' })).toBeVisible()
  await page.getByRole('link', { name: 'Requests', exact: true }).first().click()
  await expect(page).toHaveURL(/\/requests$/)
  await expect(page.getByRole('link', { name: 'SR-000001' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0)
})
