import { expect, test, type Page } from '@playwright/test'

// The mock API (MSW) runs inside the page, so each test starts from a fresh mock database.
const PASSWORD = 'correct horse battery'
const REFERENCE = 'savings-1177-2026-08'

async function signIn(page: Page, email = 'asha@example.com') {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Sign-in lands on Home; these tests start from the Statements list.
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await expect(page).toHaveURL(/\/statements/)
}

test('edit a payee, switch a row off, save, validate, post, and see the TxnIDs and the audit trail', async ({ page }) => {
  await signIn(page)

  // The same reference arrived twice (two pushes): filter by it and open the newer, still pending one.
  await page.getByRole('button', { name: 'Reference' }).click()
  await page.getByRole('textbox', { name: 'Reference' }).fill(REFERENCE)
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(/reference=savings-1177-2026-08/)
  await expect(page.getByRole('link', { name: /second push/ })).toBeVisible()
  await page.getByRole('link', { name: /second push/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /second push/ })).toBeVisible()

  // Change row 2's payee through the QuickBooks list.
  const payee = page.locator('tr[data-row="1"] td[data-field="payee"]')
  await payee.click()
  await page.getByRole('option', { name: 'ABC Plumbing LLC' }).click()
  await expect(payee).toHaveAttribute('data-dirty', 'true')

  // Switch row 3 off: it stays in the table, it just won't post.
  await page.getByRole('switch', { name: 'Post row 3' }).click()
  await expect(page.getByRole('switch', { name: 'Post row 3' })).not.toBeChecked()

  const saveBar = page.getByRole('region', { name: 'Save bar' })
  await saveBar.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(payee).not.toHaveAttribute('data-dirty', 'true')
  await expect(payee).toContainText('ABC Plumbing LLC')

  await saveBar.getByRole('button', { name: 'Validate' }).click()
  await expect(saveBar.getByRole('button', { name: 'Validate' })).toBeEnabled()

  // Post: the dialog counts only the rows that will post (6 rows, 1 off).
  await saveBar.getByRole('button', { name: 'Post to QuickBooks' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Post 5 rows to QuickBooks?')
  // The other push of this reference is also pending: the dialog says so and asks for an explicit yes.
  await expect(dialog).toContainText('Possible duplicate of SR-000011')
  await expect(dialog.getByRole('button', { name: 'Post 5 rows' })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: 'Yes, post anyway' }).check()
  await dialog.getByRole('button', { name: 'Post 5 rows' }).click()
  await expect(page.getByRole('status', { name: 'Post result' })).toContainText('Posted', { timeout: 10_000 })

  // The Results sheet lists the TxnIDs.
  await page.getByRole('button', { name: 'Results' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('columnheader', { name: 'TxnID' })).toBeVisible()
  await expect(sheet.locator('td.font-mono').first()).not.toBeEmpty()
  await page.keyboard.press('Escape')

  // The Audit trail shows both edits, by Asha K.
  await page.getByRole('link', { name: 'Audit trail' }).click()
  await expect(page).toHaveURL(/\/audit/)
  const payeeEvent = page.getByRole('row').filter({ hasText: 'Edited' }).filter({ hasText: 'f0e2…f13' }).filter({ hasText: 'ABC Plumbing LLC' })
  await expect(payeeEvent).toContainText('payee')
  await expect(payeeEvent).toContainText('Asha K')
  const offEvent = page.getByRole('row').filter({ hasText: 'f0e2…f13' }).filter({ hasText: "Marked row 3 don't post" })
  await expect(offEvent).toContainText('Asha K')
})

test('in-app navigation keeps the user signed in', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Audit trail' }).click()
  await expect(page).toHaveURL(/\/audit/)
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await expect(page).toHaveURL(/\/statements/)
  await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0)
})
