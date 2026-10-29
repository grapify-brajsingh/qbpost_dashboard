import { http, HttpResponse } from 'msw'
import { addDays, eachDayOfInterval, eachWeekOfInterval, format, startOfDay, startOfWeek } from 'date-fns'
import type { DashboardSummary } from '@/api/schema'
import { deriveAuditEvents } from '../audit'
import { mockDb } from '../db'
import { API, authenticate, problem } from './common'

// R-11 `GET /dashboard/summary`, from the same derived audit feed the Audit trail reads, so the counts equal the audit
// totals (R-10.3). `from` inclusive, `to` exclusive, as the real API (dashboard-api-m12 §4). Buckets use the runtime's
// zone: the mock serves one browser, whose zone is the `tz` the dashboard sends.

const COUNTED = { received: 'received', posted: 'posted', 'post-failed': 'postFailed', discarded: 'discarded' } as const
type Counts = DashboardSummary['counts']

const zero = (): Counts => ({ received: 0, posted: 0, postFailed: 0, discarded: 0 })

interface PostedRowLike {
  amount?: unknown
}

/** Nearest-rank percentile of sorted whole minutes, as the API computes it. */
function nearestRank(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}

function inRange(at: string, from: number, to: number): boolean {
  const t = Date.parse(at)
  return t >= from && t < to
}

function countsIn(from: number, to: number, role: Parameters<typeof deriveAuditEvents>[0]): Counts {
  const c = zero()
  for (const e of deriveAuditEvents(role)) {
    const key = COUNTED[e.action as keyof typeof COUNTED]
    if (key && inRange(e.atUtc, from, to)) c[key]++
  }
  return c
}

/** Rows and money that reached QuickBooks: the posted rows of attempts that finished posted or partial in the range. */
function postedIn(from: number, to: number): { rows: number; amount: number } {
  let rows = 0
  let cents = 0
  for (const r of mockDb.requests) {
    for (const a of r.attempts) {
      if ((a.outcome !== 'posted' && a.outcome !== 'partial') || !a.finishedUtc || !inRange(a.finishedUtc, from, to)) continue
      const posted = ((a.result as { posted?: PostedRowLike[] } | undefined)?.posted ?? []).filter((p) => typeof p.amount === 'number')
      rows += posted.length
      cents += posted.reduce((n, p) => n + Math.round((p.amount as number) * 100), 0)
    }
  }
  return { rows, amount: cents / 100 }
}

function timeToPostIn(from: number, to: number): DashboardSummary['timeToPost'] {
  const minutes: number[] = []
  for (const r of mockDb.requests) {
    const first = r.attempts.filter((a) => a.outcome === 'posted' && a.finishedUtc).sort((a, b) => a.id - b.id)[0]
    if (!first?.finishedUtc || !inRange(first.finishedUtc, from, to)) continue
    const start = Date.parse(r.email?.receivedUtc ?? r.created.utc)
    const wait = Math.floor((Date.parse(first.finishedUtc) - start) / 60_000)
    if (wait >= 0) minutes.push(wait)
  }
  if (minutes.length === 0) return null
  minutes.sort((a, b) => a - b)
  return { medianMinutes: nearestRank(minutes, 50), p90Minutes: nearestRank(minutes, 90), statements: minutes.length }
}

export const dashboardHandlers = [
  http.get(`${API}/dashboard/summary`, ({ request }) => {
    const auth = authenticate(request, 'requests:read')
    if ('error' in auth) return auth.error
    const q = new URL(request.url).searchParams
    const from = Date.parse(q.get('from') ?? '')
    const to = Date.parse(q.get('to') ?? '')
    const cFrom = q.get('compareFrom') === null ? null : Date.parse(q.get('compareFrom')!)
    const cTo = q.get('compareTo') === null ? null : Date.parse(q.get('compareTo')!)
    const bucket = q.get('bucket') ?? 'day'
    const invalid = (detail: string) => problem(400, 'invalid-request', 'Invalid query', detail)
    if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return invalid('from and to are instants with to after from.')
    if ((cFrom === null) !== (cTo === null) || (cFrom !== null && (Number.isNaN(cFrom) || Number.isNaN(cTo!) || cTo! <= cFrom))) {
      return invalid('compareFrom and compareTo come together, with compareTo after compareFrom.')
    }
    if (bucket !== 'day' && bucket !== 'week') return invalid('bucket is day or week.')

    const role = auth.user.role
    const events = deriveAuditEvents(role)
    const last = new Date(to - 1)
    const starts =
      bucket === 'week'
        ? eachWeekOfInterval({ start: new Date(from), end: last }, { weekStartsOn: 1 })
        : eachDayOfInterval({ start: new Date(from), end: last })
    const series = starts.map((start) => {
      const s = Math.max(start.getTime(), from)
      const e = Math.min(addDays(start, bucket === 'week' ? 7 : 1).getTime(), to)
      const c = zero()
      for (const ev of events) {
        const key = COUNTED[ev.action as keyof typeof COUNTED]
        if (key && key !== 'discarded' && inRange(ev.atUtc, s, e)) c[key]++
      }
      return { start: format(bucket === 'week' ? startOfWeek(start, { weekStartsOn: 1 }) : startOfDay(start), 'yyyy-MM-dd'), received: c.received, posted: c.posted, postFailed: c.postFailed }
    })

    const now = postedIn(from, to)
    const before = cFrom === null ? null : postedIn(cFrom, cTo!)
    const body: DashboardSummary = {
      range: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), tz: q.get('tz') ?? 'UTC', bucket },
      counts: countsIn(from, to, role),
      previous: cFrom === null ? null : countsIn(cFrom, cTo!, role),
      posted: { rows: now.rows, amount: now.amount, previousRows: before?.rows ?? null, previousAmount: before?.amount ?? null },
      timeToPost: timeToPostIn(from, to),
      series,
    }
    return HttpResponse.json(body)
  }),
]
