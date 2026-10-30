// Pure figures behind the Home page: periods, chart buckets, queue ages, deltas and links. No React, no fetching.
import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  format,
  min,
  startOfDay,
  startOfMinute,
  subDays,
} from 'date-fns'
import type { DashboardSummary, RequestStatus, RequestSummary } from '@/api/schema'
import { formatDate } from '@/components/filters/useUrlFilters'

export const PERIOD_VALUES = ['7', '30', '90'] as const
export type PeriodValue = (typeof PERIOD_VALUES)[number]
export const DEFAULT_PERIOD: PeriodValue = '30'

export interface PeriodRange {
  days: number
  /** Local midnight `days - 1` days ago. */
  from: Date
  /** Now, rounded down to the minute so query keys stay stable between renders. */
  to: Date
  prevFrom: Date
  /** The instant before `from`: the audit feed's `to` is inclusive. */
  prevTo: Date
}

export function periodRange(days: number, now: Date): PeriodRange {
  const from = startOfDay(subDays(now, days - 1))
  return { days, from, to: startOfMinute(now), prevFrom: subDays(from, days), prevTo: new Date(from.getTime() - 1) }
}

export interface TrendEvent {
  atUtc: string
  action: string
}

export interface FlowBucket {
  /** First and last local day of the bucket (`yyyy-MM-dd`), for the audit drill-down. */
  from: string
  to: string
  /** Axis label. */
  label: string
  tooltipLabel: string
  received: number
  posted: number
}

type BucketFrame = FlowBucket & { start: Date; end: Date }

/**
 * The instant the period ends for the API: the end of the minute `to` was rounded down from. `to` stays rounded down
 * for labels and buckets; without this, events from the last seconds (everything just done) would not count.
 */
export const queryEnd = (range: PeriodRange): Date => addMinutes(range.to, 1)

/** Daily buckets up to 31 days, else weeks starting Monday (clamped to the period). Empty buckets are kept. */
function bucketFrame(range: PeriodRange): BucketFrame[] {
  const lastDay = startOfDay(range.to)
  const weekly = range.days > 31
  const starts = weekly
    ? eachWeekOfInterval({ start: range.from, end: lastDay }, { weekStartsOn: 1 }).map((d) => (d < range.from ? range.from : d))
    : eachDayOfInterval({ start: range.from, end: lastDay })
  return starts.map((start): BucketFrame => {
    const end = weekly ? min([addDays(start, 6 - ((start.getDay() + 6) % 7)), lastDay]) : start
    return {
      start,
      end,
      from: formatDate(start),
      to: formatDate(end),
      label: format(start, 'd MMM'),
      tooltipLabel: weekly ? `Week of ${format(start, 'd MMM')}` : format(start, 'EEE d MMM'),
      received: 0,
      posted: 0,
    }
  })
}

const withoutFrame = (b: BucketFrame): FlowBucket => ({
  from: b.from,
  to: b.to,
  label: b.label,
  tooltipLabel: b.tooltipLabel,
  received: b.received,
  posted: b.posted,
})

/** Received and posted audit events counted into the period's buckets (the audit-feed path). */
export function bucketEvents(events: readonly TrendEvent[], range: PeriodRange): FlowBucket[] {
  const buckets = bucketFrame(range)
  for (const e of events) {
    const day = startOfDay(new Date(e.atUtc))
    if (Number.isNaN(day.getTime())) continue
    const b = buckets.find((x) => day >= x.start && day <= x.end)
    if (!b) continue
    if (e.action === 'received') b.received++
    else if (e.action === 'posted') b.posted++
  }
  return buckets.map(withoutFrame)
}

/**
 * The summary's series (R-11) placed in the same buckets. Its `start` is a local date in the browser's zone; a weekly
 * entry starts on a Monday that can fall before the period, so it lands in the clamped first week.
 */
export function bucketSeries(series: DashboardSummary['series'], range: PeriodRange): FlowBucket[] {
  const buckets = bucketFrame(range)
  for (const e of series) {
    const [y, m, d] = e.start.split('-').map(Number)
    const day = new Date(y, m - 1, d)
    const at = day < range.from ? startOfDay(range.from) : day
    const b = buckets.find((x) => at >= x.start && at <= x.end)
    if (!b) continue
    b.received += e.received
    b.posted += e.posted
  }
  return buckets.map(withoutFrame)
}

/** A wait in minutes for people: "45 min", "21 h", "3 d", "2 d 2 h" (whole units, rounded down). */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'under 1 min'
  if (minutes < 60) return `${Math.floor(minutes)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h`
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`
}

/** One sentence for screen readers: the totals and the busiest bucket. */
export function trendSummary(buckets: readonly FlowBucket[], periodLabel: string): string {
  const received = buckets.reduce((n, b) => n + b.received, 0)
  const posted = buckets.reduce((n, b) => n + b.posted, 0)
  const head = `Received ${received} and posted ${posted} statements in the ${periodLabel}.`
  if (received === 0) return head
  const busiest = buckets.reduce((a, b) => (b.received > a.received ? b : a))
  return `${head} Busiest: ${busiest.tooltipLabel}, ${busiest.received} received.`
}

/** When the statement arrived: the email's received time, else when it was saved. */
export const receivedAt = (r: Pick<RequestSummary, 'email' | 'created'>): string => r.email?.receivedUtc ?? r.created.utc

export interface AgeBucket {
  label: string
  count: number
  /** Statements list filters (local dates) that select this bucket. */
  receivedFrom?: string
  receivedTo: string
}

const AGES: { label: string; min: number; max: number | null }[] = [
  { label: 'Today', min: 0, max: 0 },
  { label: '1–2 days', min: 1, max: 2 },
  { label: '3–6 days', min: 3, max: 6 },
  { label: '7+ days', min: 7, max: null },
]

export function ageInDays(r: Pick<RequestSummary, 'email' | 'created'>, now: Date): number {
  return Math.max(0, differenceInCalendarDays(now, new Date(receivedAt(r))))
}

export function ageBuckets(items: readonly Pick<RequestSummary, 'email' | 'created'>[], now: Date): AgeBucket[] {
  const ages = items.map((r) => ageInDays(r, now))
  return AGES.map((a) => ({
    label: a.label,
    count: ages.filter((d) => d >= a.min && (a.max === null || d <= a.max)).length,
    receivedFrom: a.max === null ? undefined : formatDate(subDays(now, a.max)),
    receivedTo: formatDate(subDays(now, a.min)),
  }))
}

/** Signed difference with the previous period. `text` is null when the previous period had nothing to compare with. */
export function delta(current: number, previous: number): { diff: number; text: string | null } {
  const diff = current - previous
  if (previous === 0) return { diff, text: null }
  return { diff, text: diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : 'No change' }
}

/** Share of finished post attempts that posted, as a whole percentage; null when there were none. */
export function successRate(posted: number, failed: number): number | null {
  const total = posted + failed
  return total === 0 ? null : Math.round((posted / total) * 100)
}

export function greeting(now: Date): string {
  const h = now.getHours()
  return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening'
}

export const firstName = (displayName: string): string => displayName.trim().split(/\s+/)[0] ?? ''

export function auditHref(action: string, from: string, to: string): string {
  return `/audit?${new URLSearchParams({ action, from, to }).toString()}`
}

/**
 * The Statements tab that lists a status. Admins' To review tab already holds partial and unknown; everyone else
 * finds those (and posting) under All.
 */
export function statusHref(status: RequestStatus, isAdmin: boolean): string {
  switch (status) {
    case 'pending':
      return '/statements'
    case 'posted':
    case 'discarded':
      return `/statements?tab=${status}`
    case 'partial':
    case 'unknown':
      return isAdmin ? '/statements' : '/statements?tab=all'
    case 'posting':
      return '/statements?tab=all'
  }
}
