import { expect, test, type APIRequestContext } from '@playwright/test'
import { DEFAULT_ROWS_FOR_DUPLICATE, ensureAdmin, seedStatement, signIn, signInToHome, unique, watchForErrors } from './support'

let adminToken = ''

test.beforeAll(async ({ request }) => {
  adminToken = await ensureAdmin(request)
})

test('discard a statement with a reason, see it under Discarded, then restore it', async ({ page, request }) => {
  const errors = watchForErrors(page)
  const s = await seedStatement(request)
  await signInToHome(page)
  await page.goto(`/statements/${s.id}`)
  await expect(page.getByRole('heading', { level: 1, name: s.subject })).toBeVisible()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Discard' }).click()
  await page.getByLabel('Reason').fill('Test statement pushed twice by n8n')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Discarded: Test statement pushed twice by n8n')).toBeVisible()

  await page.goto('/statements')
  await page.getByRole('tab', { name: /Discarded/ }).click()
  await page.getByPlaceholder(/Search reference/).fill(s.reference)
  await expect(page.getByRole('link', { name: s.subject })).toBeVisible()
  await page.getByRole('link', { name: s.subject }).click()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Restore' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Discarded:')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Post to QuickBooks' })).toBeVisible()

  await page.goto(`/audit?requestId=${s.id}`)
  await expect(page.getByRole('row').filter({ hasText: 'Discarded' }).first()).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Restored' }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('the same statement pushed twice: the second is flagged and the Post dialog asks for an explicit yes', async ({ page, request }) => {
  const rows = DEFAULT_ROWS_FOR_DUPLICATE()
  const reference = unique('twice')
  const first = await seedStatement(request, { reference, rows, subject: `First push ${reference}` })
  const second = await seedStatement(request, { reference, rows, subject: `Second push ${reference}` })
  expect(second.id).not.toBe(first.id)

  await signInToHome(page)
  await page.goto(`/statements/${second.id}`)
  await expect(page.getByRole('heading', { level: 1, name: second.subject })).toBeVisible()
  await expect(page.getByText(new RegExp(`duplicate of ${first.publicRef}`, 'i')).first()).toBeVisible()

  await page.getByRole('region', { name: 'Save bar' }).getByRole('button', { name: 'Post to QuickBooks' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(first.publicRef)
  await expect(dialog.getByRole('button', { name: /^Post \d+ rows?$/ })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: 'Yes, post anyway' }).check()
  await expect(dialog.getByRole('button', { name: /^Post \d+ rows?$/ })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
})

test('a repeated pushId returns the same statement instead of a second one', async ({ request }) => {
  const s = await seedStatement(request)
  const detail = await request.get(`/api/v2/saved-requests/${s.id}`, { headers: { Authorization: `Bearer ${adminToken}` } })
  const original = await request.get(`/api/v2/saved-requests/${s.id}/original`, { headers: { Authorization: `Bearer ${adminToken}` } })
  expect(detail.ok()).toBeTruthy()
  const replay = await request.post('/api/v2/saved-requests', {
    headers: { 'X-Api-Key': 'integration-api-key', 'Content-Type': 'application/json' },
    data: await original.text(),
  })
  expect(replay.status()).toBe(200)
  expect(((await replay.json()) as { id: number }).id).toBe(s.id)
})

test('the audit trail exports the filtered rows as CSV', async ({ page, request }) => {
  const s = await seedStatement(request)
  await signInToHome(page)
  await page.goto(`/audit?requestId=${s.id}`)
  await expect(page.getByRole('row').filter({ hasText: 'Received' }).first()).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('audit-events.csv')
  const text = await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8')
  expect(text.split('\n')[0].toLowerCase()).toContain('action')
  expect(text).toContain(s.reference)
})

test('Home counts a new statement in "To review" and in the received figure', async ({ page, request }) => {
  const errors = watchForErrors(page)
  const stats = async (r: APIRequestContext) =>
    ((await (await r.get('/api/v2/saved-requests/stats', { headers: { Authorization: `Bearer ${adminToken}` } })).json()) as {
      byStatus: { pending: number }
    }).byStatus.pending
  await seedStatement(request)
  const pending = await stats(request)
  const calls: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/v2/')) calls.push(new URL(r.url()).pathname + new URL(r.url()).search)
  })

  await signInToHome(page)
  const toReview = page.getByText('To review now').locator('..')
  await expect(toReview).toContainText(String(pending))
  await expect(page.getByText('Statement flow', { exact: true })).toBeVisible()
  await expect(page.getByText('Recent activity', { exact: true })).toBeVisible()

  // R-11: the period band, chart and posted figures come from one summary call, not 8 audit counts.
  await expect(page.getByTestId('posted-value')).toContainText('rows sent to QuickBooks')
  await expect(page.getByTestId('time-to-post')).toBeVisible()
  expect(calls.some((c) => c.startsWith('/api/v2/dashboard/summary?'))).toBe(true)
  expect(calls.filter((c) => c.startsWith('/api/v2/audit-events?') && c.includes('pageSize=1&')).length).toBe(0)
  const received = await page.getByRole('link', { name: /statements received in the last 30 days/ }).getAttribute('aria-label')
  expect(Number(received!.split(' ')[0])).toBeGreaterThanOrEqual(1)
  expect(errors).toEqual([])
})

test('a viewer can read statements but has no edit, post or upload controls', async ({ page, request, browser }) => {
  // Create the viewer through the API as an admin, then sign in once to set their own password.
  const email = `${unique('viewer')}@example.com`
  const created = await request.post('/api/v2/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { email, displayName: 'Rita Reader', role: 'viewer' },
  })
  expect(created.status()).toBe(201)
  const temporary = ((await created.json()) as { temporaryPassword: string }).temporaryPassword
  const password = 'Viewer-Integration-Pass-7'
  const login = await request.post('/api/v2/auth/login', { data: { email, password: temporary } })
  const token = ((await login.json()) as { accessToken: string }).accessToken
  const changed = await request.post('/api/v2/auth/change-password', {
    headers: { Authorization: `Bearer ${token}` },
    data: { currentPassword: temporary, newPassword: password },
  })
  expect(changed.ok()).toBeTruthy()

  const s = await seedStatement(request)
  const ctx = await browser.newContext()
  const viewer = await ctx.newPage()
  await signIn(viewer, email, password)
  await expect(viewer.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
  await viewer.goto(`/statements/${s.id}`)
  await expect(viewer.getByRole('heading', { level: 1, name: s.subject })).toBeVisible()
  await expect(viewer.getByRole('button', { name: 'Post to QuickBooks' })).toHaveCount(0)
  await expect(viewer.getByRole('button', { name: 'Add transaction' })).toHaveCount(0)
  await viewer.goto('/statements')
  await expect(viewer.getByRole('link', { name: 'Upload PDF' })).toHaveCount(0)
  await ctx.close()
  void page
})

test('a refused reference shows on the page, is fixed in the header, and the statement posts', async ({ page, request }) => {
  const errors = watchForErrors(page)
  const s = await seedStatement(request, { reference: unique('card 4410') })
  const fixed = s.reference.replace(' ', '-')

  await signInToHome(page)
  await page.goto(`/statements/${s.id}`)
  const problems = page.getByRole('alert', { name: 'Validation problems' })
  await expect(problems).toContainText("This statement can't be posted")
  await expect(problems).toContainText('may contain only letters')

  await page.getByRole('button', { name: 'Edit reference' }).click()
  await page.getByRole('textbox', { name: 'Reference' }).fill(fixed)
  await page.getByRole('textbox', { name: 'Reference' }).press('Enter')
  const saveBar = page.getByRole('region', { name: 'Save bar' })
  await saveBar.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('reference')).not.toHaveAttribute('data-dirty', 'true')
  await expect(page.getByTestId('reference')).toContainText(fixed)
  await expect(problems).toHaveCount(0)

  await saveBar.getByRole('button', { name: 'Post to QuickBooks' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Post \d+ rows?$/ }).click()
  await expect(page.getByRole('status', { name: 'Post result' })).toContainText('Posted', { timeout: 30_000 })
  expect(errors).toEqual([])
})
