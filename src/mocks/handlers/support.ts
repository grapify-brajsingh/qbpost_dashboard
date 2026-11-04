import { http, HttpResponse } from 'msw'
import type { Page, QbListSync, QbListSyncRun, QbListsSyncResponse } from '@/api/schema'
import { mockControl, mockDb } from '../db'
import { findCompany, isReady } from './companies'
import { listsFor } from './requestHelpers'
import { API, authenticate, nowUtc, problem } from './common'

const KEPT = ' The lists from the last good sync are still used.'
const SYNC_INTERVAL_MS = 30 * 60_000

/** The lists as the API sends them: each account is `{ name, type }` (null for a name the fixtures give no type). */
function listsBody(store: ReturnType<typeof listsFor>) {
  const { lists, accountTypes } = store
  return { ...lists, accounts: lists.accounts.map((name) => ({ name, type: accountTypes[name] ?? null })) }
}

const TRIGGERS = ['schedule', 'dashboard', 'api', 'import'] as const
const OUTCOMES = ['ok', 'failed', 'skipped'] as const
const SYNC_PARAMS = new Set(['trigger', 'outcome', 'page', 'pageSize', 'company'])

/** Records an attempt as `lastSync` and at the top of the history (R-17); an ok one becomes the lists in use. */
function record(store: ReturnType<typeof listsFor>, attempt: QbListSync) {
  const { lists, listSyncs } = store
  lists.lastSync = attempt
  const ok = attempt.outcome === 'ok'
  if (ok) for (const r of listSyncs) r.current = false
  listSyncs.unshift({
    ...attempt,
    id: Math.max(0, ...listSyncs.map((r) => r.id)) + 1,
    counts: ok ? { accounts: lists.accounts.length, vendors: lists.vendors.length, customers: lists.customers.length } : null,
    current: ok,
  })
}

/** A comma-separated set of known values; undefined when a value is unknown. */
function parseSet<T extends string>(raw: string | null, known: readonly T[]): T[] | undefined {
  if (raw === null) return []
  const values = raw.split(',').map((v) => v.trim().toLowerCase())
  return values.every((v): v is T => (known as readonly string[]).includes(v)) ? (values as T[]) : undefined
}

function invalidQuery(detail: string): Response {
  return HttpResponse.json(
    { type: 'invalid-request', title: 'Invalid query', status: 400, detail },
    { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

/**
 * R-16 problem: the code is the bare string in `type` (not a URL), as the real API sends it, and `detail` is fixed
 * text that is safe to show.
 */
function qbProblem(status: number, type: string, title: string, detail: string, extensions: Record<string, unknown> = {}): Response {
  return HttpResponse.json({ type, title, status, detail, ...extensions }, { status, headers: { 'Content-Type': 'application/problem+json' } })
}

/** Records a sync attempt that did not replace the lists (the real API stores skipped and failed attempts too). */
function recordAttempt(store: ReturnType<typeof listsFor>, startedUtc: string, outcome: 'skipped' | 'failed', reason: string, message: string, user: { id: string; displayName: string }) {
  const attempt: QbListSync = {
    trigger: 'dashboard',
    outcome,
    reason,
    startedUtc,
    finishedUtc: nowUtc(),
    requestedBy: { id: user.id, displayName: user.displayName },
    message,
  }
  record(store, attempt)
}

/**
 * The `company` query value: the company's store (absent means the default company). Not a positive whole number, or an
 * id no company has, is 400 invalid-request (M17 5.3); the history answers an empty page for the latter, before this.
 */
function storeOf(request: Request): { store: ReturnType<typeof listsFor>; id: number | null } | { error: Response } {
  const raw = new URL(request.url).searchParams.get('company')
  if (raw === null) return { store: listsFor(null), id: null }
  const id = Number(raw)
  if (!/^[1-9]\d*$/.test(raw)) return { error: invalidQuery('company must be a company id (a positive integer).') }
  if (!findCompany(id)) return { error: invalidQuery(`There is no company ${id}.`) }
  return { store: listsFor(id), id }
}

export const supportHandlers = [
  http.get(`${API}/quickbooks/lists`, ({ request }) => {
    const auth = authenticate(request, 'lists:read', { ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    const s = storeOf(request)
    if ('error' in s) return s.error
    return HttpResponse.json(listsBody(s.store))
  }),

  // R-17: every recorded attempt, newest first; viewers too.
  http.get(`${API}/quickbooks/lists/syncs`, ({ request }) => {
    const auth = authenticate(request, 'lists:read', { ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    const q = new URL(request.url).searchParams
    // A well-formed id no company has is an empty page, as an unknown filter value is (M17 5.3).
    const asked = q.get('company')
    if (asked !== null && /^[1-9]\d*$/.test(asked) && !findCompany(Number(asked))) {
      return HttpResponse.json({ items: [], page: Number(q.get('page') ?? '1') || 1, pageSize: Number(q.get('pageSize') ?? '25') || 25, total: 0 })
    }
    const s = storeOf(request)
    if ('error' in s) return s.error
    const unknown = [...q.keys()].find((k) => !SYNC_PARAMS.has(k))
    if (unknown) return invalidQuery(`Unknown query parameter '${unknown}'.`)
    const trigger = parseSet(q.get('trigger'), TRIGGERS)
    const outcome = parseSet(q.get('outcome'), OUTCOMES)
    if (!trigger) return invalidQuery('trigger must be schedule, dashboard, api or import.')
    if (!outcome) return invalidQuery('outcome must be ok, failed or skipped.')
    const page = Number(q.get('page') ?? '1')
    const pageSize = Number(q.get('pageSize') ?? '25')
    if (!Number.isInteger(page) || page < 1) return invalidQuery('page must be 1 or more.')
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return invalidQuery('pageSize must be 1 to 100.')
    const rows = s.store.listSyncs.filter(
      (r) => (!trigger.length || trigger.includes(r.trigger)) && (!outcome.length || outcome.includes(r.outcome)),
    )
    const body: Page<QbListSyncRun> = { items: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length }
    return HttpResponse.json(body)
  }),

  // R-16 "Sync now": editors and admins; the real API waits up to 120 s for QuickBooks.
  http.post(`${API}/quickbooks/lists/sync`, async ({ request }) => {
    const auth = authenticate(request, 'requests:edit', { ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    const { user } = auth
    const s = storeOf(request)
    if ('error' in s) return s.error
    const { store } = s
    const company = s.id === null ? undefined : findCompany(s.id)
    if (company && !isReady(company)) {
      return problem(409, 'company-not-ready', 'Company not ready', 'Approve the company file before syncing its lists.', { state: company.state, access: company.access })
    }
    const started = nowUtc()
    if (mockControl.syncDelayMs > 0) await mockControl.sleep(mockControl.syncDelayMs)

    if (mockControl.qbNotOpen) {
      recordAttempt(store, started, 'skipped', 'quickbooks-not-open', 'QuickBooks was not open, so nothing was synced.' + KEPT, user)
      return qbProblem(409, 'quickbooks-not-open', "QuickBooks isn't open", 'Open QuickBooks on the company file, then sync again.')
    }
    // M17 4.7 (SyncProblem): the company's file refused. Recorded as a skipped attempt and never retried.
    const target = company ?? mockDb.companies.find((c) => c.isDefault)
    const needed = target?.fileName ?? null
    const open = mockControl.companyOpenElsewhere
    if (open !== null && open !== needed) {
      recordAttempt(store, started, 'skipped', 'company-file-open-elsewhere', `QuickBooks has ${open} open, so nothing was synced.` + KEPT, user)
      return qbProblem(409, 'company-file-open-elsewhere', 'Another company file is open', `QuickBooks has ${open} open, so ${needed} could not be opened. Nothing was sent.`, {
        openFile: open,
        neededFile: needed,
      })
    }
    if (mockControl.companyFileUnavailable) {
      recordAttempt(store, started, 'skipped', 'company-file-unavailable', `QuickBooks could not open ${needed}, so nothing was synced.` + KEPT, user)
      return qbProblem(503, 'company-file-unavailable', 'Company file unavailable', `QuickBooks could not open ${needed}. Nothing was sent and it was not retried.`, {
        neededFile: needed,
      })
    }
    if (mockControl.qbDown) {
      recordAttempt(store, started, 'failed', 'quickbooks-unavailable', 'QuickBooks could not be reached.' + KEPT, user)
      return qbProblem(
        503,
        'quickbooks-unavailable',
        'QuickBooks is not available',
        'QuickBooks could not be reached. The lists from the last good sync are still used; try again in a moment.',
      )
    }

    // Names "added in QuickBooks" since the last sync join the lists.
    const added = mockControl.qbAdded
    const lists = store.lists
    lists.accounts = [...lists.accounts, ...added.accounts.filter((n) => !lists.accounts.includes(n))]
    lists.vendors = [...lists.vendors, ...added.vendors.filter((n) => !lists.vendors.includes(n))]
    lists.customers = [...lists.customers, ...added.customers.filter((n) => !lists.customers.includes(n))]
    mockControl.qbAdded = { accounts: [], vendors: [], customers: [] }

    const finished = nowUtc()
    lists.syncedUtc = finished
    record(store, {
      trigger: 'dashboard',
      outcome: 'ok',
      reason: null,
      startedUtc: started,
      finishedUtc: finished,
      requestedBy: { id: user.id, displayName: user.displayName },
      message: 'The lists were synced from QuickBooks.',
    })
    lists.nextSyncUtc = new Date(Date.parse(finished) + SYNC_INTERVAL_MS).toISOString()
    const body: QbListsSyncResponse = {
      ...listsBody(store),
      counts: { accounts: lists.accounts.length, vendors: lists.vendors.length, customers: lists.customers.length },
    }
    return HttpResponse.json(body)
  }),

  http.get(`${API}/health/database`, ({ request }) => {
    const auth = authenticate(request, 'requests:read', { ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    if (mockControl.databaseDown) {
      return problem(503, 'database-unavailable', 'Database unavailable', 'The database is not reachable.', {}, {
        'Retry-After': '30',
      })
    }
    return HttpResponse.json({ status: 'ok', checkedUtc: nowUtc() })
  }),
]
