import { expect, test, type Page } from '@playwright/test'

// Manual PDF upload (issue #4). The mock API "reads" any file that starts with %PDF- as a 14-row statement with two
// rows missing their account.
const PASSWORD = 'correct horse battery'
const PDF = { name: 'chase-sep-2026.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% e2e statement\n') }

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email').fill('asha@example.com')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
}

async function pickAccount(page: Page, row: number) {
  await page.locator(`tr[data-row="${row}"] td[data-field="account"]`).click()
  await page.getByRole('option', { name: 'Chase Checking 4521' }).click()
}

test('upload a PDF, fill the empty accounts, set the total, save, and land on the statement', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await page.getByRole('link', { name: 'Upload PDF' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Upload a statement PDF' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(PDF)
  await expect(page.getByText(/Reading the statement/)).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: PDF.name })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Reference' })).toHaveValue('chase-sep-2026')
  const save = page.getByRole('button', { name: 'Save statement' })
  await expect(save).toBeDisabled()

  await pickAccount(page, 2)
  await pickAccount(page, 9)
  await page.getByRole('button', { name: 'Edit control total' }).click()
  await page.getByRole('textbox', { name: 'Control total' }).fill('6249.02')
  await page.getByRole('textbox', { name: 'Control total' }).press('Enter')
  await expect(save).toBeEnabled()
  await save.click()

  await expect(page).toHaveURL(/\/statements\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name: PDF.name })).toBeVisible()
  await expect(page.getByTestId('statement-meta').getByText('Uploaded')).toBeVisible()
})

test('the upload page does not scroll sideways at 375 px', async ({ page }) => {
  // A reload would reset the in-page mock API (and the session), so navigate inside the app, then narrow the window.
  await signIn(page)
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await page.getByRole('link', { name: 'Upload PDF' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Upload a statement PDF' })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 800 })
  await page.locator('input[type="file"]').setInputFiles(PDF)
  await expect(page.getByRole('heading', { level: 2, name: PDF.name })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
