import { http, HttpResponse } from 'msw'
import type { Page, QbListSync, QbListSyncRun, QbListsSyncResponse } from '@/api/schema'
import { mockControl, mockDb } from '../db'
import { API, authenticate, nowUtc, problem } from './common'

const KEPT = ' The lists from the last good sync are still used.'
const SYNC_INTERVAL_MS = 30 * 60_000

/** The lists as the API sends them: each account is `{ name, type }` (null for a name the fixtures give no type). */
function listsBody() {
  const { lists, accountTypes } = mockDb
  return { ...lists, accounts: lists.accounts.map((name) => ({ name, type: accountTypes[name] ?? null })) }
}

const TRIGGERS = ['schedule', 'dashboard', 'api', 'import'] as const
const OUTCOMES = ['ok', 'failed', 'skipped'] as const
const SYNC_PARAMS = new Set(['trigger', 'outcome', 'page', 'pageSize'])

/** Records an attempt as `lastSync` and at the top of the history (R-17); an ok one becomes the lists in use. */
function record(attempt: QbListSync) {
  const { lists, listSyncs } = mockDb
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
function qbProblem(status: number, type: string, title: string, detail: string): Response {
  return HttpResponse.json({ type, title, status, detail }, { status, headers: { 'Content-Type': 'application/problem+json' } })
}

/** Records a sync attempt that did not replace the lists (the real API stores skipped and failed attempts too). */
function recordAttempt(startedUtc: string, outcome: 'skipped' | 'failed', reason: string, message: string, user: { id: string; displayName: string }) {
  const attempt: QbListSync = {
    trigger: 'dashboard',
    outcome,
    reason,
    startedUtc,
    finishedUtc: nowUtc(),
    requestedBy: { id: user.id, displayName: user.displayName },
    message,
  }
  record(attempt)
}

export const supportHandlers = [
  http.get(`${API}/quickbooks/lists`, ({ request }) => {
    const auth = authenticate(request, 'lists:read', { ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    return HttpResponse.json(listsBody())
  }),

  // R-17: every recorded attempt, newest first; viewers too.
  http.get(`${API}/quickbooks/lists/syncs`, ({ request }) => {
    const auth = authenticate(request, 'lists:read', { ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    const q = new URL(request.url).searchParams
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
    const rows = mockDb.listSyncs.filter(
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
    const started = nowUtc()
    if (mockControl.syncDelayMs > 0) await mockControl.sleep(mockControl.syncDelayMs)

    if (mockControl.qbNotOpen) {
      recordAttempt(started, 'skipped', 'quickbooks-not-open', 'QuickBooks was not open, so nothing was synced.' + KEPT, user)
      return qbProblem(409, 'quickbooks-not-open', "QuickBooks isn't open", 'Open QuickBooks on the company file, then sync again.')
    }
    if (mockControl.qbDown) {
      recordAttempt(started, 'failed', 'quickbooks-unavailable', 'QuickBooks could not be reached.' + KEPT, user)
      return qbProblem(
        503,
        'quickbooks-unavailable',
        'QuickBooks is not available',
        'QuickBooks could not be reached. The lists from the last good sync are still used; try again in a moment.',
      )
    }

    // Names "added in QuickBooks" since the last sync join the lists.
    const added = mockControl.qbAdded
    const lists = mockDb.lists
    lists.accounts = [...lists.accounts, ...added.accounts.filter((n) => !lists.accounts.includes(n))]
    lists.vendors = [...lists.vendors, ...added.vendors.filter((n) => !lists.vendors.includes(n))]
    lists.customers = [...lists.customers, ...added.customers.filter((n) => !lists.customers.includes(n))]
    mockControl.qbAdded = { accounts: [], vendors: [], customers: [] }

    const finished = nowUtc()
    lists.syncedUtc = finished
    record({
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
      ...listsBody(),
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
