import { expect, test, type Page } from '@playwright/test'
import { makeStatementPdf } from './pdf'
import { ensureAdmin, signInToHome, unique, watchForErrors } from './support'

// Multi-company against the real API (M17). Needs a stack with Companies:RootFolder holding two company folders:
// "18_…" holding the default company's file (Takoma.QBW) and "440_S & A Convenience Market LLC". The rest of this suite
// assumes one company, so these tests skip on the standard stack and the others are run there (see the plan, §8).
// The OpenRouter stand-in turns a "HOLDER: <name>" line into accountHolderName, which the API matches to a company.
const SA = '440 · S & A Convenience Market LLC'

interface CompanyItem {
  code: string | null
  displayName: string
  isDefault: boolean
}

let defaultCompany: CompanyItem | undefined

test.beforeAll(async ({ request }) => {
  const token = await ensureAdmin(request)
  const res = await request.get('/api/v2/companies', { headers: { Authorization: `Bearer ${token}` } })
  const body = (await res.json()) as { rootConfigured: boolean; items: CompanyItem[] }
  test.skip(!body.rootConfigured, 'needs the multi-company stack (Companies:RootFolder)')
  defaultCompany = body.items.find((c) => c.isDefault)
})

/** Random amounts, so a run never looks like a duplicate of an earlier run's statement. */
function amounts(): [number, number] {
  const r = () => Math.floor(Math.random() * 90_000) + 1_000
  return [r(), r()]
}

function statementPdf(reference: string, holder: string | null, [dep, chk]: [number, number]) {
  return makeStatementPdf([
    'Business Checking statement',
    ...(holder ? [`HOLDER: ${holder}`] : []),
    `REFERENCE: ${reference}`,
    'ACCOUNT: Chase - 4410',
    `2026-09-02 DEP ${(dep / 100).toFixed(2)} MOBILE DEPOSIT`,
    `2026-09-04 CHK ${(chk / 100).toFixed(2)} HOME DEPOT 4410`,
  ])
}

/** The QuickBooks lists load once per session; a picker opened before they arrive is empty, so open it again. */
async function pickInCell(page: Page, row: number, field: string, option: string) {
  await expect(async () => {
    await page.keyboard.press('Escape')
    await page.locator(`tr[data-row="${row}"] td[data-field="${field}"]`).click()
    await page.getByRole('option', { name: option, exact: true }).click({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
}

/** Uploads a PDF, sets the control total and leaves the review open; the file name never names a company. */
async function uploadForReview(page: Page, reference: string, holder: string | null) {
  const cents = amounts()
  const name = `${reference}.pdf`
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await page.getByRole('link', { name: 'Upload PDF' }).click()
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/pdf', buffer: statementPdf(reference, holder, cents) })
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Edit control total' }).click()
  await page.getByRole('textbox', { name: 'Control total' }).fill(((cents[0] + cents[1]) / 100).toFixed(2))
  await page.getByRole('textbox', { name: 'Control total' }).press('Enter')
  return name
}

async function saveAndOpen(page: Page, name: string) {
  await page.getByRole('button', { name: 'Save statement' }).click()
  await expect(page).toHaveURL(/\/statements\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

test('Companies: Sync lists both company folders and Check access approves the second one', async ({ page }) => {
  const errors = watchForErrors(page)
  await signInToHome(page)
  await page.getByRole('link', { name: 'Companies', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Companies' })).toBeVisible()
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const table = page.getByRole('table', { name: 'Companies' })
  const row = table.getByRole('row').filter({ hasText: 'S & A Convenience Market LLC' })
  await expect(row).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'Takoma.QBW' })).toBeVisible()

  await row.getByRole('button', { name: 'Actions for S & A Convenience Market LLC' }).click()
  await page.getByRole('menuitem', { name: 'Check access' }).click()
  await expect(row).toContainText('Approved', { timeout: 30_000 })
  expect(errors).toEqual([])
})

test('a PDF naming S & A is matched by its content and validated against S & A, not the default company', async ({ page }) => {
  const errors = watchForErrors(page)
  await signInToHome(page)
  const name = await uploadForReview(page, unique('sa'), 'S & A CONVENIENCE MARKET LLC')
  await expect(page.getByText('S & A Convenience Market LLC').first()).toBeVisible()
  await expect(page.getByText('Choose the company first')).toHaveCount(0)
  await saveAndOpen(page, name)
  await expect(page.getByTestId('statement-meta')).toContainText(SA)
  await expect(page.getByRole('alert', { name: 'Company hold' })).toHaveCount(0)

  // S & A's (simulated) company file has no names yet, so its own lists hold the rows: the default company's lists,
  // which do have them, were not used.
  const saveBar = page.getByRole('region', { name: 'Save bar' })
  await saveBar.getByRole('button', { name: 'Validate' }).click()
  await expect(page.getByRole('alert', { name: 'Validation problems' }).or(page.getByText(/unknown-payee|rows? needs? attention/)).first()).toBeVisible()
  await saveBar.getByRole('button', { name: 'Post to QuickBooks' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(/Post 2 rows to QuickBooks for S & A Convenience Market LLC\?/)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(errors).toEqual([])
})

test('a PDF naming the default company is matched to it and posts to its company file', async ({ page }) => {
  const errors = watchForErrors(page)
  expect(defaultCompany, 'a default company').toBeDefined()
  await signInToHome(page)
  const name = await uploadForReview(page, unique('dflt'), defaultCompany!.displayName.toUpperCase())
  // The default company's lists are seeded: the deposit's payee is one of its customers.
  await pickInCell(page, 0, 'payee', 'Bankcard')
  await saveAndOpen(page, name)
  await expect(page.getByTestId('statement-meta')).toContainText(defaultCompany!.displayName)

  const saveBar = page.getByRole('region', { name: 'Save bar' })
  await saveBar.getByRole('button', { name: 'Validate' }).click()
  await expect(saveBar.getByRole('button', { name: 'Validate' })).toBeEnabled()
  await saveBar.getByRole('button', { name: 'Post to QuickBooks' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(`for ${defaultCompany!.displayName}?`)
  await dialog.getByRole('button', { name: /^Post \d+ rows?$/ }).click()
  await expect(page.getByRole('status', { name: 'Post result' })).toContainText('Posted', { timeout: 30_000 })
  expect(errors).toEqual([])
})

test('a PDF naming no known company is saved on hold, then assigned a company and validated', async ({ page }) => {
  const errors = watchForErrors(page)
  await signInToHome(page)
  const name = await uploadForReview(page, unique('nomatch'), 'UNKNOWN TRADING CO')
  await expect(page.getByText(/No company matched the printed name/)).toBeVisible()
  await saveAndOpen(page, name)
  const hold = page.getByRole('alert', { name: 'Company hold' })
  await expect(hold).toContainText('Choose the company before validating or posting.')
  await expect(page.getByRole('button', { name: 'Validate' })).toHaveCount(0)

  await hold.getByRole('button', { name: 'Choose company' }).click()
  const dialog = page.getByRole('dialog', { name: 'Choose company' })
  await dialog.getByRole('combobox', { name: 'Company' }).selectOption({ label: SA })
  await dialog.getByRole('button', { name: 'Assign company' }).click()
  // Assigning clears validation (validation: null on the API): the page must still render (spec §7).
  await expect(page.getByTestId('statement-meta')).toContainText(SA)
  await expect(page.getByRole('alert', { name: 'Company hold' })).toHaveCount(0)
  const saveBar = page.getByRole('region', { name: 'Save bar' })
  await saveBar.getByRole('button', { name: 'Validate' }).click()
  await expect(saveBar.getByRole('button', { name: 'Post to QuickBooks' })).toBeEnabled({ timeout: 15_000 })
  expect(errors).toEqual([])
})
