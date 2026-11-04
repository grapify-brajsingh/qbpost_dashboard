import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/problem'
import type { QbListSync, QbListsSyncResponse } from '@/api/schema'
import { ageText, companyFileMessage, listsStatus, syncFailure, syncSuccessText } from './qbListsSync'

describe('companyFileMessage', () => {
  it('names both files when the open one is known', () =>
    expect(companyFileMessage({ openFile: 'A.qbw', neededFile: 'B.qbw' }, 'check')).toBe(
      'QuickBooks has A.qbw open — close it or open B.qbw, then check again.',
    ))
  it('reads well without openFile', () =>
    expect(companyFileMessage({ neededFile: 'Takoma Park Grocery Store Inc.qbw' }, 'check')).toBe(
      'Another company file is open in QuickBooks — close it or open Takoma Park Grocery Store Inc.qbw, then check again.',
    ))
  it('takes the verb for posting', () => expect(companyFileMessage({ neededFile: 'B.qbw' }, 'post')).toMatch(/then post again\.$/))
  it('takes the verb for syncing', () => expect(companyFileMessage({ neededFile: 'B.qbw' }, 'sync')).toMatch(/then sync again\.$/))
  it('copes with no file names at all', () => expect(companyFileMessage({}, 'post')).toContain('open the right company file'))
})

const NOW = new Date(2026, 9, 29, 12, 0).getTime() // local noon, so the day tests do not depend on the time zone
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

describe('ageText', () => {
  it.each([
    [0, 'just now'],
    [1, '1 min ago'],
    [59, '59 min ago'],
    [60, '1 h ago'],
    [23 * 60, '23 h ago'],
    [48 * 60, '2 d ago'],
  ])('reads %i minutes as %s', (min, text) => expect(ageText(ago(min), NOW)).toBe(text))

  it('reads a future instant as just now', () => expect(ageText(ago(-5), NOW)).toBe('just now'))
})

const lastSync = (o: Partial<QbListSync> = {}): QbListSync => ({
  trigger: 'schedule',
  outcome: 'ok',
  reason: null,
  startedUtc: ago(12),
  finishedUtc: ago(12),
  requestedBy: null,
  message: 'The lists were synced from QuickBooks.',
  ...o,
})
const base = { accounts: [], vendors: [], customers: [], counts: { accounts: 71, vendors: 282, customers: 6 } }

describe('listsStatus', () => {
  it('says never synced when syncedUtc is null', () => {
    expect(listsStatus({ ...base, syncedUtc: null }, NOW)).toMatchObject({ text: 'QuickBooks lists never synced', warn: true })
  })

  it('shows the age and counts for a fresh sync', () => {
    const v = listsStatus({ ...base, syncedUtc: ago(12), lastSync: lastSync(), nextSyncUtc: ago(-18) }, NOW)
    expect(v).toMatchObject({ text: 'Lists synced 12 min ago', warn: false })
    expect(v.details[0]).toBe('71 accounts · 282 vendors · 6 customers')
    expect(v.details[v.details.length - 1]).toMatch(/^Next automatic sync at \d\d:\d\d$/)
  })

  it('warns "last sync failed" with the message when the newest attempt failed', () => {
    const v = listsStatus({ ...base, syncedUtc: ago(90), lastSync: lastSync({ outcome: 'failed', message: 'QuickBooks was busy.' }) }, NOW)
    expect(v.warn).toBe(true)
    expect(v.text).toMatch(/^Lists from \d\d:\d\d · last sync failed$/)
    expect(v.details.join(' ')).toContain('QuickBooks was busy.')
  })

  it('says "last sync skipped" without a warning, and keeps the message, when the newest attempt was skipped', () => {
    const v = listsStatus(
      { ...base, syncedUtc: ago(90), lastSync: lastSync({ outcome: 'skipped', message: 'QuickBooks was not open, so nothing was synced.' }) },
      NOW,
    )
    expect(v.warn).toBe(false)
    expect(v.text).toMatch(/^Lists from \d\d:\d\d · last sync skipped$/)
    expect(v.details.join(' ')).toContain('QuickBooks was not open, so nothing was synced.')
  })

  it('dates lists from an earlier day, and the attempt in the tooltip', () => {
    const v = listsStatus(
      { ...base, syncedUtc: ago(3 * 24 * 60), lastSync: lastSync({ outcome: 'skipped', finishedUtc: ago(2 * 24 * 60) }) },
      NOW,
    )
    expect(v.text).toMatch(/^Lists from 2026-10-26 \d\d:\d\d · last sync skipped$/)
    expect(v.details.join(' ')).toMatch(/Attempted at 2026-10-27 \d\d:\d\d\./)
  })

  it('announces a fresh sync without its age, and any other status as it reads', () => {
    expect(listsStatus({ ...base, syncedUtc: ago(12), lastSync: lastSync() }, NOW).announcement).toBe('QuickBooks lists synced')
    const failed = listsStatus({ ...base, syncedUtc: ago(90), lastSync: lastSync({ outcome: 'failed' }) }, NOW)
    expect(failed.announcement).toBe(failed.text)
    expect(listsStatus({ ...base, syncedUtc: null }, NOW).announcement).toBe('QuickBooks lists never synced')
  })

  it('omits the next-sync line when the schedule is off', () => {
    const v = listsStatus({ ...base, syncedUtc: ago(1), lastSync: lastSync(), nextSyncUtc: null }, NOW)
    expect(v.details.join(' ')).not.toContain('Next automatic')
  })
})

const synced = (last: QbListSync | null): QbListsSyncResponse => ({
  syncedUtc: ago(0),
  accounts: [],
  vendors: [],
  customers: [],
  lastSync: last,
  nextSyncUtc: null,
  counts: { accounts: 71, vendors: 282, customers: 1 },
})

describe('syncSuccessText', () => {
  it("lists the counts for the signed-in user's own sync", () => {
    const body = synced(lastSync({ trigger: 'dashboard', requestedBy: { id: 'u1', displayName: 'Asha' } }))
    expect(syncSuccessText(body, 'u1')).toBe('QuickBooks lists synced: 71 accounts, 282 vendors, 1 customer')
  })

  it('names another editor whose run this press joined', () => {
    const body = synced(lastSync({ trigger: 'dashboard', requestedBy: { id: 'u2', displayName: 'Ben' } }))
    expect(syncSuccessText(body, 'u1')).toContain('synced by Ben:')
  })

  it('says the automatic sync ran when a scheduled run was joined', () => {
    expect(syncSuccessText(synced(lastSync()), 'u1')).toContain('synced by the automatic sync:')
  })
})

const problem = (status: number, type: string, title: string) => new ApiError({ type, title, status }, new Headers())

describe('syncFailure', () => {
  it('warns for 409 quickbooks-not-open', () => {
    expect(syncFailure(problem(409, 'quickbooks-not-open', "QuickBooks isn't open"))).toEqual({
      level: 'warning',
      text: "QuickBooks isn't open. Open the company file in QuickBooks, then sync again.",
    })
  })

  it('treats a 409 with another type as a generic error, not as "not open"', () => {
    expect(syncFailure(problem(409, 'something-else', 'Conflict'))).toEqual({ level: 'error', text: 'Conflict' })
  })

  it('warns for 429', () => {
    expect(syncFailure(problem(429, 'x', 'Too Many Requests')).text).toBe('Too many syncs; try again in a minute.')
  })

  it('says the sync is still running for 504 sync-timeout', () => {
    expect(syncFailure(problem(504, 'sync-timeout', 'The sync is still running'))).toMatchObject({
      level: 'warning',
      text: expect.stringContaining('still running'),
      stillRunning: true,
    })
  })

  it.each([
    [503, 'quickbooks-unavailable', 'QuickBooks is not available'],
    [503, 'quickbooks-busy', 'QuickBooks is not available'],
    [502, 'qb-status', 'QuickBooks refused the request'],
    [503, 'api-stopping', 'The API is stopping'],
    [500, 'about:blank', 'Internal Server Error'],
    [403, 'forbidden', 'Forbidden'],
  ])('shows the problem title as an error for %i %s', (status, type, title) => {
    expect(syncFailure(problem(status, type, title))).toEqual({ level: 'error', text: title })
  })

  it('company-not-ready is a warning pointing at Companies', () => {
    expect(syncFailure(problem(409, 'company-not-ready', 'Company not ready'))).toEqual({
      level: 'warning',
      text: "This company isn't ready in QuickBooks yet. Check its access on the Companies page.",
    })
  })

  it('names both files for 409 company-file-open-elsewhere, asking to sync again', () => {
    const e = new ApiError(
      { type: 'company-file-open-elsewhere', title: 'Another company file is open', status: 409, openFile: 'A.qbw', neededFile: 'B.qbw' },
      new Headers(),
    )
    expect(syncFailure(e)).toEqual({ level: 'error', text: 'QuickBooks has A.qbw open — close it or open B.qbw, then sync again.' })
  })

  it('names the file for 503 company-file-unavailable, and never marks it as still running', () => {
    const e = new ApiError({ type: 'company-file-unavailable', title: 'Company file unavailable', status: 503, neededFile: 'B.qbw' }, new Headers())
    expect(syncFailure(e)).toEqual({ level: 'error', text: "QuickBooks couldn't open B.qbw. Check that QuickBooks can open it, then sync again." })
    const bare = new ApiError({ type: 'company-file-unavailable', title: 'Company file unavailable', status: 503 }, new Headers())
    expect(syncFailure(bare).text).toContain("couldn't open the company file")
  })

  it('falls back to a plain message for a network error', () => {
    expect(syncFailure(new TypeError('fetch failed')).level).toBe('error')
  })
})
