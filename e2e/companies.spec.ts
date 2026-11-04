import { expect, test, type Page } from '@playwright/test'

// Multi-company: an upload whose printed name matches nothing is saved on hold, then assigned a company.
// The mock API gives an unmatched PDF no company. With more than one company to choose from, the name cells stay
// locked ("Choose the company first") until a company is chosen. Saving does not need them (spec §6); the rows without
// an account are removed here only so the statement validates cleanly once the company is set.
const PASSWORD = 'correct horse battery'
const PDF = { name: 'chase-sep-2026.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% e2e statement\n') }

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email').fill('asha@example.com')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
}

async function deleteRow(page: Page, n: number) {
  await page.getByRole('button', { name: `Delete row ${n}` }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete row' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

test('upload an unmatched PDF, save on hold, choose the company, validate', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Statements', exact: true }).first().click()
  await page.getByRole('link', { name: 'Upload PDF' }).click()
  await page.locator('input[type="file"]').setInputFiles(PDF)
  await expect(page.getByRole('heading', { level: 2, name: PDF.name })).toBeVisible()
  await expect(page.getByText('No business name was found on the statement')).toBeVisible()

  await expect(page.getByText('Choose the company first').first()).toBeVisible()
  await expect(page.locator('tr[data-row="2"] td[data-field="account"]')).toHaveAttribute('title', 'Choose the company first')
  await deleteRow(page, 3)
  await deleteRow(page, 10)
  await page.getByRole('button', { name: 'Edit control total' }).click()
  await page.getByRole('textbox', { name: 'Control total' }).fill('6249.02')
  await page.getByRole('textbox', { name: 'Control total' }).press('Enter')
  await page.getByRole('button', { name: 'Save statement' }).click()

  await expect(page).toHaveURL(/\/statements\/\d+$/)
  const hold = page.getByRole('alert', { name: 'Company hold' })
  await expect(hold).toContainText('Choose the company before validating or posting.')
  await expect(page.getByRole('button', { name: 'Validate' })).toHaveCount(0)

  await hold.getByRole('button', { name: 'Choose company' }).click()
  const dialog = page.getByRole('dialog', { name: 'Choose company' })
  await dialog.getByRole('combobox', { name: 'Company' }).selectOption({ label: '18 · Takoma Park Grocery Store Inc' })
  await dialog.getByRole('button', { name: 'Assign company' }).click()

  await expect(page.getByTestId('statement-meta')).toContainText('18 · Takoma Park Grocery Store Inc')
  const validate = page.getByRole('button', { name: 'Validate' })
  await expect(validate).toBeVisible()
  await validate.click()
  await expect(validate).toBeEnabled()
})

test('Companies and Statements do not scroll sideways at 375 px', async ({ page }) => {
  // A reload would reset the in-page mock API (and the session), so navigate inside the app.
  await signIn(page)
  await page.setViewportSize({ width: 375, height: 800 })
  for (const [link, heading] of [
    ['Companies', 'Companies'],
    ['Statements', 'Statements'],
  ] as const) {
    // The sidebar collapses at this width; open it if the link is not directly visible.
    const nav = page.getByRole('link', { name: link, exact: true }).first()
    if (!(await nav.isVisible())) await page.getByRole('button', { name: /menu|sidebar/i }).first().click()
    await nav.click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }
})

test('a statement with no company does not scroll sideways at 375 px and shows the hold banner', async ({ page }) => {
  await signIn(page)
  await page.setViewportSize({ width: 375, height: 800 })
  // A reload would reset the in-page mock API, so move inside the app: push the route and let the router follow it.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/statements/14')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveURL(/\/statements\/14$/)
  const hold = page.getByRole('alert', { name: 'Company hold' })
  await expect(hold).toBeVisible()
  await expect(hold).toContainText('Choose the company before validating or posting.')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
