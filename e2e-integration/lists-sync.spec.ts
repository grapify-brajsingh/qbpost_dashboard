import { expect, test } from '@playwright/test'
import { ensureAdmin, seedStatement, signInToHome, watchForErrors } from './support'

test.beforeAll(async ({ request }) => {
  await ensureAdmin(request)
})

// R-16: against the real API with the simulated QuickBooks (always open).
test('Sync now on a statement replaces the lists and the status reads "just now"', async ({ page, request }) => {
  const errors = watchForErrors(page)
  const s = await seedStatement(request)
  await signInToHome(page)
  await page.goto(`/statements/${s.id}`)
  await expect(page.getByRole('heading', { level: 1, name: s.subject })).toBeVisible()

  // The status line shows how old the lists are (or that they were never synced) before the press.
  // `last`: the hidden live region before it can say the same words.
  await expect(page.getByText(/^(Lists synced|Lists from|QuickBooks lists never synced)/).last()).toBeVisible()

  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText(/^QuickBooks lists synced: \d+ accounts?, \d+ vendors?, \d+ customers?$/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Lists synced just now')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled()
  expect(errors).toEqual([])
})
