import { describe, expect, it } from 'vitest'
import type { QbListSyncRun } from '@/api/schema'
import {
  accountTypeLabel,
  countsText,
  durationText,
  filterNames,
  outcomeView,
  startedByLabel,
  syncFiltersFrom,
} from './qbListsView'

const run = (patch: Partial<QbListSyncRun>): QbListSyncRun => ({
  id: 1,
  trigger: 'schedule',
  outcome: 'ok',
  reason: null,
  startedUtc: '2026-10-30T09:00:00Z',
  finishedUtc: '2026-10-30T09:00:05Z',
  requestedBy: null,
  message: 'The lists were synced from QuickBooks.',
  counts: null,
  current: false,
  ...patch,
})

describe('accountTypeLabel', () => {
  it('turns the QuickBooks AccountType into words', () => {
    expect(accountTypeLabel('Bank')).toBe('Bank')
    expect(accountTypeLabel('OtherCurrentAsset')).toBe('Other current asset')
    expect(accountTypeLabel('CreditCard')).toBe('Credit card')
    expect(accountTypeLabel('CostOfGoodsSold')).toBe('Cost of goods sold')
  })

  it('shows a dash for an unknown type', () => {
    expect(accountTypeLabel(null)).toBe('—')
    expect(accountTypeLabel('')).toBe('—')
  })
})

describe('filterNames', () => {
  const names = ['metro Electric', 'ABC Plumbing', 'Ãcme Pools', 'Utilities:Electric']

  it('sorts by name, ignoring case', () => {
    expect(filterNames(names, '', (n) => n)).toEqual(['ABC Plumbing', 'Ãcme Pools', 'metro Electric', 'Utilities:Electric'])
  })

  it('keeps names containing the search, ignoring case and outer spaces', () => {
    expect(filterNames(names, '  electric ', (n) => n)).toEqual(['metro Electric', 'Utilities:Electric'])
    expect(filterNames(names, 'zzz', (n) => n)).toEqual([])
  })

  it('works on objects through the name getter', () => {
    const accounts = [{ name: 'b', type: null }, { name: 'A', type: 'Bank' }]
    expect(filterNames(accounts, '', (a) => a.name).map((a) => a.name)).toEqual(['A', 'b'])
  })
})

describe('startedByLabel', () => {
  it('names who or what started an attempt', () => {
    expect(startedByLabel(run({ trigger: 'schedule' }))).toBe('Automatic')
    expect(startedByLabel(run({ trigger: 'dashboard', requestedBy: { id: 'u1', displayName: 'Asha Kapoor' } }))).toBe('Asha Kapoor')
    expect(startedByLabel(run({ trigger: 'dashboard', requestedBy: null }))).toBe('Sync now')
    expect(startedByLabel(run({ trigger: 'api' }))).toBe('API')
    expect(startedByLabel(run({ trigger: 'import' }))).toBe('Imported from file')
  })
})

describe('outcomeView', () => {
  it('gives each result a word and a tone (never colour alone)', () => {
    expect(outcomeView('ok')).toMatchObject({ label: 'Synced', tone: 'success' })
    expect(outcomeView('skipped')).toMatchObject({ label: 'Skipped', tone: 'warning' })
    expect(outcomeView('failed')).toMatchObject({ label: 'Failed', tone: 'danger' })
  })
})

describe('durationText', () => {
  it('reads seconds with one decimal under 10 s, whole seconds under a minute, then minutes and seconds', () => {
    expect(durationText('2026-10-30T09:00:00.000Z', '2026-10-30T09:00:00.400Z')).toBe('0.4 s')
    expect(durationText('2026-10-30T09:00:00Z', '2026-10-30T09:00:00Z')).toBe('0 s')
    expect(durationText('2026-10-30T09:00:00Z', '2026-10-30T09:00:12.6Z')).toBe('13 s')
    expect(durationText('2026-10-30T09:00:00Z', '2026-10-30T09:01:52Z')).toBe('1 min 52 s')
    expect(durationText('2026-10-30T09:00:00Z', '2026-10-30T09:02:00Z')).toBe('2 min')
  })

  it('never shows a negative time', () => {
    expect(durationText('2026-10-30T09:00:05Z', '2026-10-30T09:00:00Z')).toBe('0 s')
  })
})

describe('countsText', () => {
  it('reads the three sizes, singular where it is one, and a dash without counts', () => {
    expect(countsText({ accounts: 19, vendors: 15, customers: 6 })).toBe('19 accounts · 15 vendors · 6 customers')
    expect(countsText({ accounts: 1, vendors: 1, customers: 0 })).toBe('1 account · 1 vendor · 0 customers')
    expect(countsText(null)).toBe('—')
  })
})

describe('syncFiltersFrom', () => {
  it('maps the page filters to the API query', () => {
    expect(syncFiltersFrom({}, 1)).toEqual({ trigger: [], outcome: [], page: 1 })
    expect(syncFiltersFrom({ by: 'automatic' }, 2)).toEqual({ trigger: ['schedule'], outcome: [], page: 2 })
    expect(syncFiltersFrom({ by: 'manual', result: 'failed' }, 1)).toEqual({ trigger: ['dashboard', 'api'], outcome: ['failed'], page: 1 })
    expect(syncFiltersFrom({ by: 'imported', result: 'ok' }, 1)).toEqual({ trigger: ['import'], outcome: ['ok'], page: 1 })
  })
})
