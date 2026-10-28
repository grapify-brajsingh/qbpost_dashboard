import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { AuditAction, AuditEvent, Page } from '../schema'
import { api } from '../client'

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
export function useAuditCounts(current: InstantRange, previous: InstantRange) {
  return useQuery<PeriodCounts>({
    queryKey: homeKeys.counts(current, previous),
    queryFn: async ({ signal }) => {
      const [c, p] = await Promise.all([countsFor(current, signal), countsFor(previous, signal)])
      return { current: c, previous: p }
    },
    placeholderData: keepPreviousData,
  })
}

export interface Trend {
  events: Pick<AuditEvent, 'atUtc' | 'action'>[]
  /** More events matched than were fetched: the oldest buckets are undercounted. */
  truncated: boolean
  fetched: number
}

/** Received and posted events in the range, newest first, at most `TREND_MAX_PAGES` pages. */
export function useAuditTrend(range: InstantRange) {
  return useQuery<Trend>({
    queryKey: homeKeys.trend(range),
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
