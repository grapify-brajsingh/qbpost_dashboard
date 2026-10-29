import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import type { AuditAction, AuditEvent, DashboardSummary, Page } from '../schema'
import { api } from '../client'
import { ApiError } from '../problem'

/** The audit actions the Home page counts per period. */
export const THROUGHPUT_ACTIONS = ['received', 'posted', 'post-failed', 'discarded'] as const satisfies readonly AuditAction[]
export type ThroughputAction = (typeof THROUGHPUT_ACTIONS)[number]

export const TREND_PAGE_SIZE = 200
export const TREND_MAX_PAGES = 10

/** UTC instants, as the audit feed takes them. */
export interface InstantRange {
  from: string
  to: string
}

// Under ['audit']: every mutation that invalidates the audit feed refreshes these too.
export const homeKeys = {
  counts: (current: InstantRange, previous: InstantRange) => ['audit', 'home', 'counts', current, previous] as const,
  trend: (range: InstantRange) => ['audit', 'home', 'trend', range] as const,
  summary: (params: SummaryParams) => ['audit', 'home', 'summary', params] as const,
}

function auditUrl(actions: readonly string[], range: InstantRange, page: number, pageSize: number): string {
  const qs = new URLSearchParams()
  for (const a of actions) qs.append('action', a)
  qs.set('from', range.from)
  qs.set('to', range.to)
  if (page > 1) qs.set('page', String(page))
  qs.set('pageSize', String(pageSize))
  return `/audit-events?${qs.toString()}`
}

/** How many events of one action the feed holds in a range: the page's `total`, one row fetched. */
async function auditTotal(action: string, range: InstantRange, signal?: AbortSignal): Promise<number> {
  const r = await api.get<Page<AuditEvent>>(auditUrl([action], range, 1, 1), { signal })
  return r.data.total
}

export type ActionCounts = Record<ThroughputAction, number>

export interface PeriodCounts {
  current: ActionCounts
  previous: ActionCounts
}

async function countsFor(range: InstantRange, signal?: AbortSignal): Promise<ActionCounts> {
  const totals = await Promise.all(THROUGHPUT_ACTIONS.map((a) => auditTotal(a, range, signal)))
  return Object.fromEntries(THROUGHPUT_ACTIONS.map((a, i) => [a, totals[i]])) as ActionCounts
}

/** Exact counts per action for the period and the one before it. */
export function useAuditCounts(current: InstantRange, previous: InstantRange, opts: { enabled?: boolean } = {}) {
  return useQuery<PeriodCounts>({
    queryKey: homeKeys.counts(current, previous),
    enabled: opts.enabled,
    queryFn: async ({ signal }) => {
      const [c, p] = await Promise.all([countsFor(current, signal), countsFor(previous, signal)])
      return { current: c, previous: p }
    },
    placeholderData: keepPreviousData,
  })
}

export interface Trend {
  events: Pick<AuditEvent, 'atUtc' | 'action'>[]
  /** From the summary endpoint: counts per bucket, already in the browser's zone. Takes the place of `events`. */
  series?: DashboardSummary['series']
  /** More events matched than were fetched: the oldest buckets are undercounted. */
  truncated: boolean
  fetched: number
}

/** Received and posted events in the range, newest first, at most `TREND_MAX_PAGES` pages. */
export function useAuditTrend(range: InstantRange, opts: { enabled?: boolean } = {}) {
  return useQuery<Trend>({
    queryKey: homeKeys.trend(range),
    enabled: opts.enabled,
    queryFn: async ({ signal }) => {
      const events: Trend['events'] = []
      let total = 0
      for (let page = 1; page <= TREND_MAX_PAGES; page++) {
        const r = await api.get<Page<AuditEvent>>(auditUrl(['received', 'posted'], range, page, TREND_PAGE_SIZE), { signal })
        total = r.data.total
        for (const e of r.data.items) events.push({ atUtc: e.atUtc, action: e.action })
        if (r.data.items.length === 0 || events.length >= total) break
      }
      return { events, truncated: events.length < total, fetched: events.length }
    },
    placeholderData: keepPreviousData,
  })
}

// ---- R-11: GET /dashboard/summary ---------------------------------------------------------------------------------

export interface SummaryParams {
  current: InstantRange
  /** The period before; its `to` equals `current.from` (the summary's `to` is exclusive). */
  previous: InstantRange
  bucket: 'day' | 'week'
  /** IANA zone for the day buckets: the browser's. */
  tz: string
}

function summaryUrl(p: SummaryParams): string {
  const qs = new URLSearchParams({
    from: p.current.from,
    to: p.current.to,
    compareFrom: p.previous.from,
    compareTo: p.previous.to,
    bucket: p.bucket,
    tz: p.tz,
  })
  return `/dashboard/summary?${qs.toString()}`
}

/**
 * One call for the period figures and the chart. `null` means an older API without the endpoint (404): Home then
 * falls back to the audit feed. Any other failure is an error.
 */
const summaryOptions = (p: SummaryParams) =>
  queryOptions({
    queryKey: homeKeys.summary(p),
    queryFn: async ({ signal }): Promise<DashboardSummary | null> => {
      try {
        return (await api.get<DashboardSummary>(summaryUrl(p), { signal })).data
      } catch (e) {
        if (e instanceof ApiError && e.problem.status === 404) return null
        throw e
      }
    },
    placeholderData: keepPreviousData,
    retry: (count, e) => !(e instanceof ApiError && e.problem.status < 500) && count < 2,
  })

const COUNT_KEYS = { received: 'received', posted: 'posted', 'post-failed': 'postFailed', discarded: 'discarded' } as const

function toActionCounts(c: DashboardSummary['counts']): ActionCounts {
  return Object.fromEntries(THROUGHPUT_ACTIONS.map((a) => [a, c[COUNT_KEYS[a]]])) as ActionCounts
}

/** The period cells from the summary: same meaning as the audit totals (R-10.3). */
export const useSummaryCounts = (p: SummaryParams) =>
  useQuery({
    ...summaryOptions(p),
    select: (s): PeriodCounts | null =>
      s && {
        current: toActionCounts(s.counts),
        previous: toActionCounts(s.previous ?? { received: 0, posted: 0, postFailed: 0, discarded: 0 }),
      },
  })

/** The chart from the summary's series. */
export const useSummaryTrend = (p: SummaryParams) =>
  useQuery({
    ...summaryOptions(p),
    select: (s): Trend | null => s && { events: [], series: s.series, truncated: false, fetched: 0 },
  })

export type PostedFiguresData = Pick<DashboardSummary, 'posted' | 'timeToPost'>

/** Posted value and time to post: only the summary can give these. */
export const useSummaryFigures = (p: SummaryParams) =>
  useQuery({
    ...summaryOptions(p),
    select: (s): PostedFiguresData | null => s && { posted: s.posted, timeToPost: s.timeToPost },
  })
