import { expect, test, type Browser, type Page } from '@playwright/test'
import { makeStatementPdf } from '../e2e-integration/pdf'

// A realistic first week on a fresh stack, done through the dashboard as real people would. Run once on an empty
// database (docker compose ... down -v && up -d). Only the n8n pushes use the API directly, because that is n8n's job.
//
//   admin   admin@example.com            (bootstrap, changes its password on first sign-in)
//   Asha    asha.kapoor@tropicana.example  editor: the accountant who reviews and posts
//   Ravi    ravi.menon@tropicana.example   viewer: the owner, read-only

test.describe.configure({ mode: 'serial' })

const BOOTSTRAP = 'Integration-Test-Pass-1'
const ADMIN = { email: 'admin@example.com', password: 'Integration-Test-Pass-2' }
const ASHA = { email: 'asha.kapoor@tropicana.example', name: 'Asha Kapoor', role: 'editor', password: 'Asha-Tropicana-2026' }
const RAVI = { email: 'ravi.menon@tropicana.example', name: 'Ravi Menon', role: 'viewer', password: 'Ravi-Tropicana-2026' }
const N8N_KEY = 'integration-api-key'
const SHOTS = 'test-results/demo'

const temporary: Record<string, string> = {}
const errors: string[] = []

function watch(page: Page) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function firstSignIn(page: Page, email: string, temp: string, password: string) {
  await signIn(page, email, temp)
  await expect(page).toHaveURL(/change-password/)
  await page.getByLabel('Current password').fill(temp)
  await page.getByLabel('New password', { exact: true }).fill(password)
  await page.getByLabel('Confirm new password').fill(password)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
}

async function asUser(browser: Browser, who: { email: string; password: string }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  watch(page)
  await signIn(page, who.email, who.password)
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
  return { ctx, page }
}

/** Picks a QuickBooks name in a table cell; reopens the picker if the lists had not arrived yet. */
async function pick(page: Page, row: number, field: string, option: string) {
  await expect(async () => {
    await page.keyboard.press('Escape')
    await page.locator(`tr[data-row="${row}"] td[data-field="${field}"]`).click()
    // Type to narrow the list, as a person does, then choose the exact name.
    await page.keyboard.type(option)
    await page.getByRole('option', { name: option, exact: true }).click({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
}

const cents = (rows: { amount: number }[]) => Math.round(rows.reduce((n, r) => n + r.amount * 100, 0)) / 100

// ---- the data ------------------------------------------------------------------------------------------------------

interface Row {
  kind: 'Deposit' | 'Check'
  date: string
  amount: number
  memo: string
  payee: string
  lineAccount: string
  checkNo?: string
}

const CHASE = 'Chase Business Checking 4410'
const WELLS = 'Wells Fargo Operating 7731'

const CHASE_AUG: Row[] = [
  { kind: 'Deposit', date: '2026-08-01', amount: 2450.0, memo: 'MOBILE DEPOSIT UNIT 4 RENT AUG', payee: 'Unit 4 Tenant - J. Rivera', lineAccount: 'Rental Income' },
  { kind: 'Deposit', date: '2026-08-01', amount: 2275.0, memo: 'ZELLE FROM M CHEN AUG RENT', payee: 'Unit 7 Tenant - M. Chen', lineAccount: 'Rental Income' },
  { kind: 'Deposit', date: '2026-08-03', amount: 3100.0, memo: 'ACH CREDIT PALM COURT RENTALS', payee: 'Palm Court Rentals LLC', lineAccount: 'Rental Income' },
  { kind: 'Check', date: '2026-08-05', amount: 412.68, memo: 'FPL DIRECT DEBIT 08/05', payee: 'Florida Power & Light', lineAccount: 'Utilities' },
  { kind: 'Check', date: '2026-08-09', amount: 1185.0, memo: 'CHECK 1042 ABC PLUMBING', payee: 'ABC Plumbing', lineAccount: 'Repairs and Maintenance', checkNo: '1042' },
  { kind: 'Check', date: '2026-08-12', amount: 5000.0, memo: 'ONLINE TRANSFER TO WELLS FARGO 7731', payee: 'Wells Fargo', lineAccount: 'Transfer Clearing' },
  { kind: 'Check', date: '2026-08-15', amount: 236.4, memo: 'GREENLINE LANDSCAPING INV 8812', payee: 'Greenline Landscaping', lineAccount: 'Landscaping' },
  { kind: 'Check', date: '2026-08-31', amount: 15.0, memo: 'MONTHLY SERVICE FEE', payee: 'Chase Bank', lineAccount: 'Bank Service Charges' },
]

const WELLS_AUG: Row[] = [
  { kind: 'Deposit', date: '2026-08-12', amount: 5000.0, memo: 'ONLINE TRANSFER FROM CHASE 4410', payee: 'Chase Bank', lineAccount: 'Transfer Clearing' },
  { kind: 'Check', date: '2026-08-14', amount: 3812.55, memo: 'ADP PAYROLL 081426', payee: 'ADP Payroll', lineAccount: 'Payroll Expenses' },
  { kind: 'Check', date: '2026-08-18', amount: 642.1, memo: 'STATE FARM INS PREM', payee: 'State Farm Insurance', lineAccount: 'Insurance' },
  // Not a QuickBooks vendor: the statement shows "has errors" until someone fixes the payee.
  { kind: 'Check', date: '2026-08-21', amount: 189.0, memo: 'ACME POOL SVC 0821', payee: 'Acme Pool Service', lineAccount: 'Repairs and Maintenance' },
  { kind: 'Check', date: '2026-08-28', amount: 97.32, memo: 'COMCAST BUSINESS 8/28', payee: 'Comcast Business', lineAccount: 'Utilities' },
]

/** What the PDF prints. The model (here the stand-in) reads date, kind, amount, memo and the account line. */
const CHASE_SEP: Row[] = [
  { kind: 'Deposit', date: '2026-09-01', amount: 2450.0, memo: 'MOBILE DEPOSIT UNIT 4 RENT SEP', payee: 'Unit 4 Tenant - J. Rivera', lineAccount: 'Rental Income' },
  { kind: 'Deposit', date: '2026-09-02', amount: 2275.0, memo: 'ZELLE FROM M CHEN SEP RENT', payee: 'Unit 7 Tenant - M. Chen', lineAccount: 'Rental Income' },
  { kind: 'Deposit', date: '2026-09-03', amount: 3100.0, memo: 'ACH CREDIT PALM COURT RENTALS', payee: 'Palm Court Rentals LLC', lineAccount: 'Rental Income' },
  { kind: 'Deposit', date: '2026-09-08', amount: 75.0, memo: 'MOBILE DEPOSIT LATE FEE UNIT 12', payee: 'Unit 12 Tenant - S. Patel', lineAccount: 'Late Fee Income' },
  { kind: 'Check', date: '2026-09-05', amount: 398.21, memo: 'FPL DIRECT DEBIT 09/05', payee: 'Florida Power & Light', lineAccount: 'Utilities' },
  { kind: 'Check', date: '2026-09-10', amount: 142.86, memo: 'CITY WATER DEPT AUTOPAY', payee: 'City Water Department', lineAccount: 'Utilities' },
  { kind: 'Check', date: '2026-09-15', amount: 236.4, memo: 'GREENLINE LANDSCAPING INV 8907', payee: 'Greenline Landscaping', lineAccount: 'Landscaping' },
  { kind: 'Check', date: '2026-09-19', amount: 87.49, memo: 'HOME DEPOT 6311 REPAIR PARTS', payee: 'Home Depot', lineAccount: 'Repairs and Maintenance' },
  { kind: 'Check', date: '2026-09-30', amount: 15.0, memo: 'MONTHLY SERVICE FEE', payee: 'Chase Bank', lineAccount: 'Bank Service Charges' },
]

const WELLS_SEP: Row[] = [
  { kind: 'Check', date: '2026-09-14', amount: 3812.55, memo: 'ADP PAYROLL 091426', payee: 'ADP Payroll', lineAccount: 'Payroll Expenses' },
  { kind: 'Check', date: '2026-09-18', amount: 642.1, memo: 'STATE FARM INS PREM', payee: 'State Farm Insurance', lineAccount: 'Insurance' },
  { kind: 'Check', date: '2026-09-26', amount: 54.18, memo: 'STAPLES 0412 OFFICE', payee: 'Staples', lineAccount: 'Office Supplies' },
]

function statementPdf(bank: string, account: string, period: string, reference: string, rows: Row[]) {
  return makeStatementPdf([
    `${bank} - Business Account Statement`,
    'Tropicana Properties LLC, 1450 Ocean Drive, Miami FL',
    `Statement period: ${period}`,
    `REFERENCE: ${reference}`,
    `ACCOUNT: ${account}`,
    'Date        Type  Amount     Description',
    ...rows.map((r) => `${r.date} ${r.kind === 'Deposit' ? 'DEP' : 'CHK'} ${r.amount.toFixed(2)} ${r.memo}`),
    `Total of listed transactions: ${cents(rows).toFixed(2)}`,
  ])
}

// ---- 1. the admin sets up the team -----------------------------------------------------------------------------

test('admin: first sign-in, then creates Asha (editor) and Ravi (viewer)', async ({ page }) => {
  watch(page)
  await firstSignIn(page, ADMIN.email, BOOTSTRAP, ADMIN.password)
  await shot(page, '01-admin-home-empty')

  await page.getByRole('link', { name: 'Users', exact: true }).first().click()
  for (const u of [ASHA, RAVI]) {
    await page.getByRole('button', { name: 'New user' }).click()
    await page.getByLabel('Email').fill(u.email)
    await page.getByLabel('Display name').fill(u.name)
    await page.getByRole('radio', { name: u.role }).click()
    await page.getByRole('button', { name: 'Create user' }).click()
    temporary[u.email] = (await page.getByRole('dialog').locator('code').innerText()).trim()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('row').filter({ hasText: u.email })).toBeVisible()
  }
  await shot(page, '02-users-created')
})

// ---- 2. n8n pushes August --------------------------------------------------------------------------------------

test('n8n: pushes the August statements (one pushed twice by mistake)', async ({ request }) => {
  const push = async (reference: string, subject: string, account: string, rows: Row[], receivedUtc: string) => {
    const pushId = crypto.randomUUID()
    const res = await request.post('/api/v2/saved-requests', {
      headers: { 'X-Api-Key': N8N_KEY },
      data: {
        reference,
        controlTotal: cents(rows),
        pushId,
        email: { subject, receivedUtc, from: 'statements@bank-alerts.example', messageId: `<${pushId}@bank-alerts.example>` },
        transactions: rows.map((r, i) => ({ externalId: `row-${i + 1}`, account, ...r })),
      },
    })
    expect(res.status(), await res.text()).toBe(201)
  }
  await push('chase-4410-2026-08', 'Chase Business Checking ...4410 - August 2026 statement', CHASE, CHASE_AUG, '2026-09-02T07:14:09Z')
  await push('wells-7731-2026-08', 'Wells Fargo Operating ...7731 - August 2026 statement', WELLS, WELLS_AUG, '2026-09-03T06:41:52Z')
  // n8n ran twice on the same email: a second push of the Chase statement.
  await push('chase-4410-2026-08', 'Chase Business Checking ...4410 - August 2026 statement', CHASE, CHASE_AUG, '2026-09-02T07:14:09Z')
})

// ---- 3. Asha works the queue -------------------------------------------------------------------------------------

test('Asha: first sign-in, reviews Chase August, switches off the transfer, saves, validates and posts', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  watch(page)
  await firstSignIn(page, ASHA.email, temporary[ASHA.email], ASHA.password)
  await shot(page, '03-asha-home-queue')

  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await shot(page, '04-statements-to-review')
  // The older of the two Chase pushes.
  await page.goto('/statements/1')
  await expect(page.getByRole('heading', { level: 1, name: /Chase Business Checking/ })).toBeVisible()

  // ABC Plumbing is filed in QuickBooks as "ABC Plumbing LLC".
  await pick(page, 4, 'payee', 'ABC Plumbing LLC')
  // The transfer to Wells Fargo is recorded from the Wells side: don't post it here.
  await page.getByRole('switch', { name: 'Post row 6' }).click()
  const bar = page.getByRole('region', { name: 'Save bar' })
  await bar.getByPlaceholder(/What did you fix/).fill('Payee to QuickBooks name; transfer to Wells not posted from Chase')
  await bar.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('tr[data-row="4"] td[data-field="payee"]')).not.toHaveAttribute('data-dirty', 'true')
  await bar.getByRole('button', { name: 'Validate' }).click()
  await expect(bar.getByRole('button', { name: 'Validate' })).toBeEnabled()
  await shot(page, '05-chase-aug-reviewed')

  await bar.getByRole('button', { name: 'Post to QuickBooks' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Post 7 rows to QuickBooks?')
  // The other push of the same reference is still pending: Asha confirms she means this one.
  const anyway = dialog.getByRole('checkbox', { name: 'Yes, post anyway' })
  if (await anyway.isVisible()) await anyway.check()
  await dialog.getByRole('button', { name: 'Post 7 rows' }).click()
  await expect(page.getByRole('status', { name: 'Post result' })).toContainText('Posted', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Results' }).click()
  await expect(page.getByRole('dialog').getByRole('columnheader', { name: 'TxnID' })).toBeVisible()
  await shot(page, '06-chase-aug-posted-results')
  await page.keyboard.press('Escape')

  // The second push is the same statement: discard it with a reason.
  await page.goto('/statements/3')
  await expect(page.getByText(/duplicate of SR-000001/i).first()).toBeVisible()
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Discard' }).click()
  await page.getByLabel('Reason').fill('Duplicate n8n push of SR-000001 (same email), already posted')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/^Discarded:/)).toBeVisible()
  await shot(page, '07-duplicate-discarded')
  await ctx.close()
})

test('Asha: uploads the September Chase PDF, fills what the model left empty, saves, validates and posts', async ({ browser }) => {
  const { ctx, page } = await asUser(browser, ASHA)
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await page.getByRole('link', { name: 'Upload PDF' }).click()
  const name = 'chase-business-checking-4410-2026-09.pdf'
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: statementPdf('JPMorgan Chase Bank', CHASE, 'Sep 1 - Sep 30, 2026', 'chase-4410-2026-09', CHASE_SEP),
  })
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('textbox', { name: 'Reference' })).toHaveValue('chase-4410-2026-09')
  await shot(page, '08-upload-read')

  // The model read the account line; payee and line account are left for the accountant (no defaults).
  for (const [i, r] of CHASE_SEP.entries()) {
    await pick(page, i, 'payee', r.payee)
    await pick(page, i, 'lineAccount', r.lineAccount)
  }
  await page.getByRole('button', { name: 'Edit control total' }).click()
  await page.getByRole('textbox', { name: 'Control total' }).fill(cents(CHASE_SEP).toFixed(2))
  await page.getByRole('textbox', { name: 'Control total' }).press('Enter')
  await shot(page, '09-upload-reviewed')
  await page.getByRole('button', { name: 'Save statement' }).click()
  await expect(page).toHaveURL(/\/statements\/\d+$/)
  await expect(page.getByTestId('statement-meta').getByText('Uploaded')).toBeVisible()

  const bar = page.getByRole('region', { name: 'Save bar' })
  await bar.getByRole('button', { name: 'Validate' }).click()
  await expect(bar.getByRole('button', { name: 'Validate' })).toBeEnabled()
  await bar.getByRole('button', { name: 'Post to QuickBooks' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Post \d+ rows$/ }).click()
  await expect(page.getByRole('status', { name: 'Post result' })).toContainText('Posted', { timeout: 30_000 })
  await shot(page, '10-chase-sep-posted')
  await ctx.close()
})

test('Asha: uploads the September Wells Fargo PDF and saves it for later review', async ({ browser }) => {
  const { ctx, page } = await asUser(browser, ASHA)
  await page.goto('/statements/upload')
  const name = 'wells-fargo-operating-7731-2026-09.pdf'
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: statementPdf('Wells Fargo Bank', WELLS, 'Sep 1 - Sep 30, 2026', 'wells-7731-2026-09', WELLS_SEP),
  })
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible({ timeout: 30_000 })
  for (const [i, r] of WELLS_SEP.entries()) await pick(page, i, 'payee', r.payee)
  await page.getByRole('button', { name: 'Edit control total' }).click()
  await page.getByRole('textbox', { name: 'Control total' }).fill(cents(WELLS_SEP).toFixed(2))
  await page.getByRole('textbox', { name: 'Control total' }).press('Enter')
  await page.getByRole('button', { name: 'Save statement' }).click()
  await expect(page).toHaveURL(/\/statements\/\d+$/)
  await shot(page, '11-wells-sep-saved-pending')
  await ctx.close()
})

// ---- 4. Ravi reads; the admin looks at the whole picture -------------------------------------------------------

test('Ravi (viewer): first sign-in, can read statements and the audit trail, cannot change anything', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  watch(page)
  await firstSignIn(page, RAVI.email, temporary[RAVI.email], RAVI.password)
  await page.goto('/statements/1')
  await expect(page.getByRole('heading', { level: 1, name: /Chase Business Checking/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Post to QuickBooks' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add transaction' })).toHaveCount(0)
  await page.goto('/statements')
  await expect(page.getByRole('link', { name: 'Upload PDF' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
  await shot(page, '12-ravi-statements-readonly')
  await ctx.close()
})

test('admin: Home, Statements, Audit trail and Users show the week', async ({ browser }) => {
  const { ctx, page } = await asUser(browser, ADMIN)
  await expect(page.getByTestId('posted-value')).toContainText('rows sent to QuickBooks')
  // Everything happened minutes ago: 3 n8n pushes + 2 uploads received, Chase August and September posted.
  await expect(page.getByRole('link', { name: /^5 statements received in the last 30 days/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^2 successful posts/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^1 statements discarded/ })).toBeVisible()
  await expect(page.getByTestId('posted-value')).toContainText('16 rows sent to QuickBooks')
  await shot(page, '13-admin-home')
  await page.goto('/statements?tab=all')
  await expect(page.getByRole('link', { name: /Wells Fargo Operating .*August/ })).toBeVisible()
  await shot(page, '14-statements-all')
  await page.goto('/statements?tab=errors')
  await expect(page.getByRole('link', { name: /Wells Fargo Operating .*August/ })).toBeVisible()
  await page.goto('/audit')
  await expect(page.getByRole('row').filter({ hasText: 'ABC Plumbing LLC' }).first()).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Flagged as a possible duplicate of SR-000001' })).toBeVisible()
  await shot(page, '15-audit-trail')
  await page.goto('/users')
  await shot(page, '16-users')
  await ctx.close()
  expect(errors).toEqual([])
})
