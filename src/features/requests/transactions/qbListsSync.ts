import { ApiError, problemCode, retryAfterSeconds } from '@/api/problem'
import type { QbLists, QbListsSyncResponse } from '@/api/schema'
import { formatTimestamp } from '@/lib/dates'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local "14:30" for an ISO instant; empty when it does not parse. */
export function clockTime(utcIso: string): string {
  const d = new Date(utcIso)
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "just now", "12 min ago", "3 h ago", "2 d ago". Future instants (clock skew) read as "just now". */
export function ageText(utcIso: string, now: number): string {
  const t = Date.parse(utcIso)
  if (Number.isNaN(t)) return ''
  const min = Math.floor(Math.max(0, now - t) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`
  return `${Math.floor(min / (24 * 60))} d ago`
}

/** "14:30" for the same local day as `now`, else the full "2026-10-30 14:30", so old lists never read as today's. */
function whenText(utcIso: string, now: number): string {
  return new Date(utcIso).toDateString() === new Date(now).toDateString() ? clockTime(utcIso) : formatTimestamp(utcIso)
}

export interface ListsStatusView {
  text: string
  /** For the live region: `text` without anything that ages, so a screen reader hears changes, not minutes. */
  announcement: string
  /** Warning style: never synced, or the newest attempt failed. A skip (QuickBooks closed) is routine, not a warning. */
  warn: boolean
  /** Tooltip lines (counts, the failed attempt's message, the next automatic sync). */
  details: string[]
}

/** Spec 3.1: the status line for lists that loaded. `now` is epoch ms. */
export function listsStatus(lists: QbLists, now: number): ListsStatusView {
  const details: string[] = []
  const c = lists.counts
  if (c) details.push(`${c.accounts} accounts · ${c.vendors} vendors · ${c.customers} customers`)
  if (lists.syncedUtc) details.push(`Lists from ${formatTimestamp(lists.syncedUtc)}`)
  const last = lists.lastSync
  if (last && last.outcome !== 'ok') details.push(`${last.message} Attempted at ${whenText(last.finishedUtc, now)}.`)
  if (lists.nextSyncUtc) details.push(`Next automatic sync at ${clockTime(lists.nextSyncUtc)}`)

  if (!lists.syncedUtc) {
    const text = 'QuickBooks lists never synced'
    return { text, announcement: text, warn: true, details }
  }
  if (last && last.outcome !== 'ok') {
    const text = `Lists from ${whenText(lists.syncedUtc, now)} · last sync ${last.outcome}`
    return { text, announcement: text, warn: last.outcome === 'failed', details }
  }
  return { text: `Lists synced ${ageText(lists.syncedUtc, now)}`, announcement: 'QuickBooks lists synced', warn: false, details }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Spec 3.2: the toast for a 200. The answer can belong to a run someone else started (the schedule, another editor),
 * so it never says "you synced"; it names who ran it when that was not the signed-in user.
 */
export function syncSuccessText(body: QbListsSyncResponse, meId: string | undefined): string {
  const c = body.counts
  const counts = `${plural(c.accounts, 'account', 'accounts')}, ${plural(c.vendors, 'vendor', 'vendors')}, ${plural(c.customers, 'customer', 'customers')}`
  const last = body.lastSync
  let by = ''
  if (last?.trigger === 'schedule') by = ' by the automatic sync'
  else if (last?.requestedBy && last.requestedBy.id !== meId) by = ` by ${last.requestedBy.displayName}`
  return `QuickBooks lists synced${by}: ${counts}`
}

export interface SyncFailure {
  level: 'warning' | 'error'
  text: string
  /** The attempt is still running on the server: re-read the lists again shortly. */
  stillRunning?: boolean
}

/** Spec 3.2: the toast for a failed Sync now. The problem's `title` and `detail` are fixed, safe text. */
export function syncFailure(error: unknown): SyncFailure {
  if (!(error instanceof ApiError)) return { level: 'error', text: 'Could not reach the server. Try again.' }
  const p = error.problem
  const code = problemCode(p)
  if (code === 'quickbooks-not-open') {
    return { level: 'warning', text: "QuickBooks isn't open. Open the company file in QuickBooks, then sync again." }
  }
  if (p.status === 429) {
    const wait = retryAfterSeconds(error.headers)
    return { level: 'warning', text: `Too many syncs; try again in ${wait ? plural(wait, 'second', 'seconds') : 'a minute'}.` }
  }
  if (p.status === 504 || code === 'sync-timeout') {
    return { level: 'warning', text: 'The sync is still running in QuickBooks; the status will update when it finishes.', stillRunning: true }
  }
  return { level: 'error', text: p.detail ? `${p.title}. ${p.detail}` : p.title }
}
