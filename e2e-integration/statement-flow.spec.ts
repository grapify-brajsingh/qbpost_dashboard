import { expect, test } from '@playwright/test'
import { ensureAdmin, seedStatement, signInToHome, watchForErrors } from './support'

test.beforeAll(async ({ request }) => {
  await ensureAdmin(request)
})

test('n8n push, edit payee, row off, save, validate, post, TxnIDs, audit trail', async ({ page, request }) => {
  const errors = watchForErrors(page)
  const s = await seedStatement(request)

  await signInToHome(page)

  // Find it on the Statements list by its reference, open it by its email subject.
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await page.getByPlaceholder(/Search reference/).fill(s.reference)
  await expect(page.getByRole('link', { name: s.subject })).toBeVisible()
  await page.getByRole('link', { name: s.subject }).click()
  await expect(page.getByRole('heading', { level: 1, name: s.subject })).toBeVisible()

  // Every name is in QuickBooks, so nothing is flagged.
  await expect(page.getByText('not in QuickBooks')).toHaveCount(0)

  // Row 3's payee: pick the QuickBooks vendor.
  const payee = page.locator('tr[data-row="2"] td[data-field="payee"]')
  await payee.click()
  await page.getByRole('option', { name: 'ABC Plumbing LLC' }).click()
  await expect(payee).toHaveAttribute('data-dirty', 'true')

  // Row 2 (the bank fee) does not post.
  await page.getByRole('switch', { name: 'Post row 2' }).click()
  await expect(page.getByRole('switch', { name: 'Post row 2' })).not.toBeChecked()

  const saveBar = page.getByRole('region', { name: 'Save bar' })
  await saveBar.getByPlaceholder(/What did you fix/).fill('Payee to the QuickBooks name; fee not posted')
  await saveBar.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(payee).not.toHaveAttribute('data-dirty', 'true')
  await expect(payee).toContainText('ABC Plumbing LLC')

  await saveBar.getByRole('button', { name: 'Validate' }).click()
  await expect(saveBar.getByRole('button', { name: 'Validate' })).toBeEnabled()

  await saveBar.getByRole('button', { name: 'Post to QuickBooks' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Post 2 rows to QuickBooks?')
  await dialog.getByRole('button', { name: 'Post 2 rows' }).click()
  await expect(page.getByRole('status', { name: 'Post result' })).toContainText('Posted', { timeout: 30_000 })

  // The Results sheet lists a TxnID per posted row.
  await page.getByRole('button', { name: 'Results' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('columnheader', { name: 'TxnID' })).toBeVisible()
  await expect(sheet.locator('td.font-mono').first()).toContainText(/\S/)
  await page.keyboard.press('Escape')

  // The audit trail for this statement shows the edit, the row switched off, and the post.
  await page.goto(`/audit?requestId=${s.id}`)
  await expect(page.getByRole('row').filter({ hasText: 'ABC Plumbing LLC' }).first()).toContainText('payee')
  await expect(page.getByRole('row').filter({ hasText: "don't post" }).first()).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Posted' }).first()).toBeVisible()

  expect(errors).toEqual([])
})
