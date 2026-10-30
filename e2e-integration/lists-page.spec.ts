import { expect, test } from '@playwright/test'
import { ensureAdmin, signInToHome, watchForErrors } from './support'

test.beforeAll(async ({ request }) => {
  await ensureAdmin(request)
})

// R-16, R-17: the Lists page against the real API (M15), whose simulated QuickBooks is seeded from
// docker/seed/qb-lists.json, so a sync returns the seeded names.
test('Lists: seeded names with types, Sync now, and the attempt at the top of the history', async ({ page }) => {
  const errors = watchForErrors(page)
  await signInToHome(page)
  await page.getByRole('link', { name: 'Lists', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'QuickBooks lists' })).toBeVisible()

  const accounts = page.getByRole('table', { name: 'Accounts' })
  const chase = accounts.getByRole('row', { name: /Chase Business Checking 4410/ })
  await expect(chase).toBeVisible()
  await expect(chase.getByRole('cell', { name: 'Bank', exact: true })).toBeVisible()

  await page.getByRole('tab', { name: /^Vendors/ }).click()
  await page.getByRole('searchbox', { name: 'Search names' }).fill('payroll')
  await expect(page.getByRole('table', { name: 'Vendors' }).getByRole('row', { name: /ADP Payroll/ })).toBeVisible()
  await expect(page).toHaveURL(/q=payroll/)

  await page.getByRole('tab', { name: 'Sync history' }).click()
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText(/^QuickBooks lists synced: \d+ accounts?, \d+ vendors?, \d+ customers?$/)).toBeVisible({ timeout: 30_000 })

  const top = page.getByRole('table', { name: 'Sync history' }).getByRole('row').nth(1)
  await expect(top.getByText('Synced', { exact: true })).toBeVisible()
  await expect(top.getByText('In use', { exact: true })).toBeVisible()
  await expect(top).not.toContainText('0 accounts · 0 vendors · 0 customers')

  // The sync stored the seed, not empty lists: the names are still there.
  await page.getByRole('tab', { name: /^Accounts/ }).click()
  await page.getByRole('searchbox', { name: 'Search names' }).fill('') // the search is shared by the name tabs
  await expect(page.getByRole('table', { name: 'Accounts' }).getByRole('row', { name: /Chase Business Checking 4410/ })).toBeVisible()
  expect(errors).toEqual([])
})
