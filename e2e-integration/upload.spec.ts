import { expect, test, type Page } from '@playwright/test'
import { makeStatementPdf } from './pdf'
import { ensureAdmin, signInToHome, unique, watchForErrors } from './support'

// The API reads the PDF's text and asks the model (here the OpenRouter stand-in) for rows. The stand-in turns
// "YYYY-MM-DD DEP|CHK amount memo" lines into rows and leaves account, payee and line account empty unless given.

test.beforeAll(async ({ request }) => {
  await ensureAdmin(request)
})

async function openUpload(page: Page) {
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await page.getByRole('link', { name: 'Upload PDF' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Upload a statement PDF' })).toBeVisible()
}

/** The QuickBooks lists load once per session; a picker opened before they arrive is empty, so open it again. */
async function pickInCell(page: Page, row: number, field: string, option: string) {
  await expect(async () => {
    await page.keyboard.press('Escape')
    await page.locator(`tr[data-row="${row}"] td[data-field="${field}"]`).click()
    await page.getByRole('option', { name: option, exact: true }).click({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
}

test('upload a PDF, review the rows read from it, save, then the statement and its audit trail', async ({ page }) => {
  const errors = watchForErrors(page)
  const reference = unique('upl')
  const cents = String(Math.floor(Math.random() * 90) + 10)
  const name = `${reference}.pdf`
  const pdf = makeStatementPdf([
    'Chase Bank - Business Checking statement',
    `REFERENCE: ${reference}`,
    `2026-09-02 DEP 512.${cents} MOBILE DEPOSIT`,
    `2026-09-04 CHK 87.${cents} HOME DEPOT 4410`,
    `2026-09-09 CHK 19.${cents} MONTHLY SERVICE FEE`,
  ])

  await signInToHome(page)
  await openUpload(page)
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible({ timeout: 30_000 })
  // The model's reference, not a default.
  await expect(page.getByRole('textbox', { name: 'Reference' })).toHaveValue(reference)
  await expect(page.locator('tr[data-row="2"] td[data-field="memo"]')).toContainText('MONTHLY SERVICE FEE')

  // Nothing the model did not read is filled in, so Save waits for the accounts and the control total.
  const save = page.getByRole('button', { name: 'Save statement' })
  await expect(save).toBeDisabled()
  for (const row of [0, 1, 2]) await pickInCell(page, row, 'account', 'Chase - 4410')
  // One review edit: the line account of the fee.
  await pickInCell(page, 2, 'lineAccount', 'Bank Service Charges')
  await page.getByRole('button', { name: 'Edit control total' }).click()
  const total = (51200 + Number(cents) + 8700 + Number(cents) + 1900 + Number(cents)) / 100
  await page.getByRole('textbox', { name: 'Control total' }).fill(total.toFixed(2))
  await page.getByRole('textbox', { name: 'Control total' }).press('Enter')
  await expect(save).toBeEnabled()
  await save.click()

  // An ordinary statement now, marked as uploaded.
  await expect(page).toHaveURL(/\/statements\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByTestId('statement-meta').getByText('Uploaded')).toBeVisible()
  const id = /\/statements\/(\d+)$/.exec(page.url())![1]

  // Version 1 is what was read, version 2 the review edits: the audit trail shows the received event and the edits.
  await page.goto(`/audit?requestId=${id}`)
  await expect(page.getByRole('row').filter({ hasText: 'Received' }).first()).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Bank Service Charges' }).first()).toBeVisible()

  expect(errors).toEqual([])
})

test('uploading the same PDF again warns that it was saved before', async ({ page }) => {
  const reference = unique('dup')
  const name = `${reference}.pdf`
  const pdf = makeStatementPdf([`REFERENCE: ${reference}`, '2026-09-02 DEP 40.00 MOBILE DEPOSIT'])

  await signInToHome(page)
  await openUpload(page)
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible({ timeout: 30_000 })
  await pickInCell(page, 0, 'account', 'Chase - 4410')
  await page.getByRole('button', { name: 'Edit control total' }).click()
  await page.getByRole('textbox', { name: 'Control total' }).fill('40.00')
  await page.getByRole('textbox', { name: 'Control total' }).press('Enter')
  await page.getByRole('button', { name: 'Save statement' }).click()
  await expect(page).toHaveURL(/\/statements\/\d+$/)

  await openUpload(page)
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/same file|uploaded before|same PDF/i).first()).toBeVisible()
})

test('a PDF that is not a statement is refused with a clear message', async ({ page }) => {
  await signInToHome(page)
  await openUpload(page)
  const pdf = makeStatementPdf(['Dinner menu for the harbour restaurant', 'Starters, mains and desserts served daily', 'NOT A STATEMENT'])
  await page.locator('input[type="file"]').setInputFiles({ name: 'menu.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByText(/doesn.t look like a bank or card statement/i)).toBeVisible({ timeout: 30_000 })
})

test('a file that is not a PDF is refused', async ({ page }) => {
  await signInToHome(page)
  await openUpload(page)
  await page.locator('input[type="file"]').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hello, not a pdf') })
  await expect(page.getByText(/isn.t a PDF/i).first()).toBeVisible({ timeout: 30_000 })
})
