import { expect, test, type Page } from '@playwright/test'
import { makeStatementPdf } from './pdf'
import { ensureAdmin, signInToHome, unique } from './support'

// What the user sees for each way an upload can go wrong, against the real API.

let token = ''

test.beforeAll(async ({ request }) => {
  token = await ensureAdmin(request)
})

test.beforeEach(async ({ page }) => {
  await signInToHome(page)
})

async function openUpload(page: Page) {
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await page.getByRole('link', { name: 'Upload PDF' }).click()
}

async function upload(page: Page, name: string, buffer: Buffer) {
  await openUpload(page)
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/pdf', buffer })
}

async function review(page: Page, lines: string[], name = `${unique('err')}.pdf`) {
  await upload(page, name, makeStatementPdf(['Chase Bank - Business Checking statement', 'ACCOUNT: Chase - 4410', ...lines]))
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible({ timeout: 30_000 })
}

const save = (page: Page) => page.getByRole('button', { name: 'Save statement' })
const unreadable = /Fix 1 value that could not be read/

test('a file that is not a real PDF offers no Try again', async ({ page }) => {
  await upload(page, 'fake.pdf', Buffer.from('hello, not a pdf'))
  await expect(page.getByText(/isn.t a PDF/i).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible()
})

test('a PDF with no text says it may be a scan', async ({ page }) => {
  await upload(page, 'scan.pdf', makeStatementPdf([]))
  await expect(page.getByText(/no readable text/i).first()).toBeVisible({ timeout: 30_000 })
})

test('a reference with spaces is cleaned, and a bad one is explained', async ({ page }) => {
  await review(page, ['2026-09-02 DEP 40.00 MOBILE DEPOSIT'], 'chase sept 2026.pdf')
  const reference = page.getByRole('textbox', { name: 'Reference' })
  await expect(reference).toHaveValue('chase-sept-2026')
  await reference.fill('')
  await expect(page.getByText('Enter a reference').first()).toBeVisible()
  await reference.fill('has space')
  await expect(page.getByText(/Use only letters, digits/).first()).toBeVisible()
  await expect(save(page)).toBeDisabled()
})

test('a missing control total warns but does not stop the save', async ({ page }) => {
  await review(page, ['2026-09-02 DEP 40.00 MOBILE DEPOSIT'])
  await expect(page.getByText("Enter the statement's printed total")).toBeVisible()
  await expect(save(page)).toBeEnabled()
  await save(page).click()
  await expect(page).toHaveURL(/\/statements\/\d+$/)
  await expect(page.getByRole('alert', { name: 'Validation problems' })).toContainText('controlTotal is required')
})

test('a date not on the calendar is caught in review', async ({ page }) => {
  await review(page, ['2026-13-45 DEP 40.00 MOBILE DEPOSIT'])
  await expect(save(page)).toBeDisabled()
  await expect(page.getByText(unreadable).first()).toBeVisible()
})

test('an amount of zero is caught in review', async ({ page }) => {
  await review(page, ['2026-09-02 DEP 0.00 MOBILE DEPOSIT'])
  await expect(save(page)).toBeDisabled()
  await expect(page.getByText(unreadable).first()).toBeVisible()
})

test('a row problem from the API uses the row number the table shows', async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${token}` }
  const pdf = makeStatementPdf(['Chase Bank - Business Checking statement', '2026-09-02 DEP 40.00 MOBILE DEPOSIT'])
  const read = await request.post('/api/v2/statement-extractions', { headers, multipart: { file: { name: 'x.pdf', mimeType: 'application/pdf', buffer: pdf } } })
  const { extractionId } = (await read.json()) as { extractionId: string }
  const row = { externalId: 'row-1', kind: 'Deposit', date: '2026-09-02', amount: 0, account: 'Chase - 4410', payee: 'P', lineAccount: 'Bank Service Charges' }
  const saved = await request.post('/api/v2/saved-requests', { headers, data: { reference: unique('row'), controlTotal: 1, transactions: [row], upload: { extractionId } } })
  const { id } = (await saved.json()) as { id: number }
  await page.goto(`/statements/${id}`)
  await expect(page.getByRole('alert', { name: 'Validation problems' })).toContainText('Row 1: amount must be greater than zero')
})

test('an expired extraction says so and cannot be saved', async ({ page }) => {
  await review(page, ['2026-09-02 DEP 40.00 MOBILE DEPOSIT'])
  await page.route('**/api/v2/saved-requests', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 410, contentType: 'application/problem+json', body: JSON.stringify({ type: 'extraction-expired', title: 'Extraction expired', status: 410 }) })
      : route.continue(),
  )
  await save(page).click()
  await expect(page.getByText(/This upload has expired/).first()).toBeVisible()
})
