import { expect, type APIRequestContext, type Page } from '@playwright/test'

// Values from docker-compose.integration.yml. Throwaway credentials for the local stack only.
export const ADMIN_EMAIL = 'admin@example.com'
const BOOTSTRAP_PASSWORD = 'Integration-Test-Pass-1'
export const ADMIN_PASSWORD = process.env.INTEGRATION_ADMIN_PASSWORD ?? 'Integration-Test-Pass-2'
export const N8N_KEY = 'integration-api-key'

interface TokenBody {
  accessToken: string
}

/** The bootstrap admin must change their password once; do it through the API so every test can sign in. */
export async function ensureAdmin(request: APIRequestContext): Promise<string> {
  const login = await request.post('/api/v2/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  if (login.ok()) return ((await login.json()) as TokenBody).accessToken
  const first = await request.post('/api/v2/auth/login', { data: { email: ADMIN_EMAIL, password: BOOTSTRAP_PASSWORD } })
  expect(first.ok(), 'bootstrap admin can sign in').toBeTruthy()
  const token = ((await first.json()) as TokenBody).accessToken
  const change = await request.post('/api/v2/auth/change-password', {
    headers: { Authorization: `Bearer ${token}` },
    data: { currentPassword: BOOTSTRAP_PASSWORD, newPassword: ADMIN_PASSWORD },
  })
  expect(change.ok(), 'bootstrap password changed').toBeTruthy()
  return ((await change.json()) as TokenBody).accessToken
}

export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export interface SeedRow {
  kind: string
  date: string
  amount: number
  account?: string
  lineAccount?: string
  payee?: string
  memo?: string
}

export interface Seeded {
  id: number
  publicRef: string
  pushId: string
  reference: string
  subject: string
}

/** Three rows whose amounts differ per call, so the API's duplicate detector never links two test statements. */
export function defaultRows(): SeedRow[] {
  const cents = Math.floor(Math.random() * 9000) + 1000
  const base = cents / 100
  const money = (n: number) => Math.round(n * 100) / 100
  return [
    { kind: 'Deposit', date: '2026-08-01', amount: money(1000 + base), account: 'Chase - 4410', lineAccount: 'Merchant Card Deposits', payee: 'Bankcard', memo: 'BANKCARD SETTLEMENT' },
    { kind: 'Check', date: '2026-08-03', amount: money(60 + base), account: 'Chase - 4410', lineAccount: 'Bank Service Charges', payee: 'Chase', memo: 'SERVICE FEE' },
    { kind: 'Check', date: '2026-08-05', amount: money(250 + base), account: 'Chase - 4410', lineAccount: 'Repairs and Maintenance', payee: 'ABC Plumbing', memo: 'PLUMBING' },
  ]
}

/** Rows for two pushes of the same statement: the same rows each call that receives the result. */
export const DEFAULT_ROWS_FOR_DUPLICATE = defaultRows

/** Saves a statement exactly as the n8n HTTP node does: API key, `email` and `pushId` metadata. */
export async function seedStatement(
  request: APIRequestContext,
  opts: { reference?: string; rows?: SeedRow[]; controlTotal?: number | null; subject?: string } = {},
): Promise<Seeded> {
  const reference = opts.reference ?? unique('chase')
  const subject = opts.subject ?? `Chase statement ${reference}`
  const rows = opts.rows ?? defaultRows()
  const transactions = rows.map((r, i) => ({ externalId: `row-${i + 1}`, ...r }))
  const controlTotal =
    opts.controlTotal === undefined ? Math.round(rows.reduce((sum, r) => sum + r.amount * 100, 0)) / 100 : opts.controlTotal
  const pushId = crypto.randomUUID()
  const res = await request.post('/api/v2/saved-requests', {
    headers: { 'X-Api-Key': N8N_KEY },
    data: {
      reference,
      controlTotal,
      pushId,
      email: {
        subject,
        receivedUtc: new Date(Date.now() - 3600_000).toISOString(),
        from: 'alerts@chase.com',
        messageId: `<${pushId}@mail.chase.com>`,
      },
      transactions,
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  const body = (await res.json()) as { id: number; publicRef: string }
  return { id: body.id, publicRef: body.publicRef, pushId, reference, subject }
}

export async function signIn(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

export async function signInToHome(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await signIn(page, email, password)
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
}

/** Collects page errors and API 5xx answers, which the UI might otherwise only show as a toast. */
export function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })
  return errors
}
