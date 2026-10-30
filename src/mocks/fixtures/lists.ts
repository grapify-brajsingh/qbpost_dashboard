import type { QbListSyncRun, QbLists } from '@/api/schema'

export const QB_LISTS: QbLists = {
  accounts: [
    'Chase Checking 4521',
    'Chase Visa 8890',
    'Operating Savings 1177',
    'Repairs and Maintenance',
    'Utilities',
    'Office Supplies',
    'Insurance',
    'Professional Fees',
    'Rental Income',
    'Bank Service Charges',
  ],
  vendors: [
    'ABC Plumbing LLC',
    'Metro Electric Co',
    'Staples Business',
    'Allied Insurance',
    'Harbor Property Services',
    'Northside Cleaning',
    'Greenline Landscaping',
    'Summit Legal Group',
    'Rural Utilities',
    'City Water Department',
  ],
  customers: ['Unit 4 Tenant', 'Unit 7 Tenant', 'Unit 12 Tenant', 'Kiosk Rental'],
  syncedUtc: '2026-10-27T05:00:00Z',
}

/** QuickBooks `AccountType` per fixture account, as the real API sends it with each account. */
export const ACCOUNT_TYPES: Record<string, string> = {
  'Chase Checking 4521': 'Bank',
  'Chase Visa 8890': 'CreditCard',
  'Operating Savings 1177': 'Bank',
  'Repairs and Maintenance': 'Expense',
  Utilities: 'Expense',
  'Office Supplies': 'Expense',
  Insurance: 'Expense',
  'Professional Fees': 'Expense',
  'Rental Income': 'Income',
  'Bank Service Charges': 'Expense',
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const SYNCED = 'The lists were synced from QuickBooks.'
const KEPT = ' The lists from the last good sync are still used.'

/**
 * The lists as the fake API starts: the last sync was an automatic one 12 minutes ago and the next is due in 18
 * (the real API syncs every 30 minutes). Built at reset so "12 min ago" stays true whenever the app starts.
 */
export function buildQbLists(now = Date.now()): QbLists {
  const synced = new Date(now - 12 * MINUTE).toISOString()
  return {
    ...structuredClone(QB_LISTS),
    syncedUtc: synced,
    lastSync: {
      trigger: 'schedule',
      outcome: 'ok',
      reason: null,
      startedUtc: new Date(now - 12 * MINUTE - 4000).toISOString(),
      finishedUtc: synced,
      requestedBy: null,
      message: 'The lists were synced from QuickBooks.',
    },
    nextSyncUtc: new Date(now + 18 * MINUTE).toISOString(),
  }
}

/**
 * The sync history as the fake API starts (R-17), newest first: the automatic sync 12 minutes ago that produced
 * `buildQbLists` (in use), a skipped one while QuickBooks was closed, a busy failure, Eli's Sync now that morning, and
 * the import of `qb-lists.json` when the server was upgraded.
 */
export function buildListSyncs(lists: QbLists, now = Date.now()): QbListSyncRun[] {
  const counts = { accounts: lists.accounts.length, vendors: lists.vendors.length, customers: lists.customers.length }
  const at = (ago: number, seconds: number) => ({
    startedUtc: new Date(now - ago - seconds * 1000).toISOString(),
    finishedUtc: new Date(now - ago).toISOString(),
  })
  const eli = { id: 'u-editor', displayName: 'Eli Editor' }
  return [
    { id: 6, ...structuredClone(lists.lastSync!), counts, current: true },
    { id: 5, trigger: 'schedule', outcome: 'skipped', reason: 'quickbooks-not-open', ...at(42 * MINUTE, 0), requestedBy: null, message: 'QuickBooks was not open, so nothing was synced.' + KEPT, counts: null, current: false },
    { id: 4, trigger: 'schedule', outcome: 'failed', reason: 'quickbooks-busy', ...at(72 * MINUTE, 118), requestedBy: null, message: 'QuickBooks did not answer in time.' + KEPT, counts: null, current: false },
    { id: 3, trigger: 'dashboard', outcome: 'ok', reason: null, ...at(3 * HOUR, 6), requestedBy: eli, message: SYNCED, counts: { ...counts, vendors: counts.vendors - 1 }, current: false },
    { id: 2, trigger: 'schedule', outcome: 'ok', reason: null, ...at(5 * HOUR, 5), requestedBy: null, message: SYNCED, counts: { ...counts, vendors: counts.vendors - 1 }, current: false },
    { id: 1, trigger: 'import', outcome: 'ok', reason: null, ...at(26 * HOUR, 0), requestedBy: null, message: 'The lists were imported from qb-lists.json.', counts: { ...counts, vendors: counts.vendors - 2 }, current: false },
  ]
}
