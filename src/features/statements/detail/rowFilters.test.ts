import type { Txn, Version } from '@/api/schema'
import { deletedInVersion, editedInVersions, filterRows, isFiltering, type DisplayRow, type FilterContext } from './rowFilters'

const txns: Txn[] = [
  { externalId: 'a', kind: 'Check', date: '2026-08-01', payee: 'ABC Plumbing LLC', memo: 'INV 1', account: 'Chase Checking', amount: 10 },
  { externalId: 'b', kind: 'Deposit', date: '2026-08-05', payee: 'Unit 4 Tenant', memo: 'rent', account: 'Savings', post: false, amount: 20 },
  { externalId: 'c', kind: 'CcCharge', date: '2026-08-09', payee: 'Metro Electric Co', memo: 'power', lineAccount: 'Utilities', amount: 30 },
  { externalId: 'd', kind: 'Cheque', date: '2026-08-12', payee: 'Staples', post: true, amount: 40 },
]
const rows: DisplayRow[] = txns.map((row, i) => ({ key: String(i), index: i, row, added: false, deleted: false }))
const empty: FilterContext = { findings: new Set(), dirtyKeys: new Set(), editedInVersions: new Set() }
const keys = (r: DisplayRow[]) => r.map((x) => x.key)

describe('filterRows', () => {
  test('no filter keeps every row, in order', () => {
    expect(keys(filterRows(rows, {}, empty))).toEqual(['0', '1', '2', '3'])
  })

  test('search looks at payee, memo, account and line account, ignoring case', () => {
    expect(keys(filterRows(rows, { q: 'abc' }, empty))).toEqual(['0'])
    expect(keys(filterRows(rows, { q: 'RENT' }, empty))).toEqual(['1'])
    expect(keys(filterRows(rows, { q: 'savings' }, empty))).toEqual(['1'])
    expect(keys(filterRows(rows, { q: 'utilities' }, empty))).toEqual(['2'])
    expect(keys(filterRows(rows, { q: '  ' }, empty))).toEqual(['0', '1', '2', '3'])
  })

  test('post / skip: a missing post means post', () => {
    expect(keys(filterRows(rows, { post: 'post' }, empty))).toEqual(['0', '2', '3'])
    expect(keys(filterRows(rows, { post: 'skip' }, empty))).toEqual(['1'])
  })

  test('kind list and date range (inclusive)', () => {
    expect(keys(filterRows(rows, { kind: ['Check', 'Deposit'] }, empty))).toEqual(['0', '1'])
    expect(keys(filterRows(rows, { from: '2026-08-05', to: '2026-08-09' }, empty))).toEqual(['1', '2'])
    expect(keys(filterRows(rows, { from: '2026-08-10' }, empty))).toEqual(['3'])
  })

  test('problem and edited use the context; edited is unsaved OR changed in an earlier version', () => {
    const ctx: FilterContext = { findings: new Set(['2']), dirtyKeys: new Set(['0']), editedInVersions: new Set(['3']) }
    expect(keys(filterRows(rows, { problem: true }, ctx))).toEqual(['2'])
    expect(keys(filterRows(rows, { edited: true }, ctx))).toEqual(['0', '3'])
    expect(keys(filterRows(rows, { edited: true, problem: true }, ctx))).toEqual([])
  })

  test('isFiltering', () => {
    expect(isFiltering({})).toBe(false)
    expect(isFiltering({ kind: [] })).toBe(false)
    expect(isFiltering({ problem: true })).toBe(true)
  })
})

const version = (number: number, payload: Txn[], changes: Version['changes']): Version => ({
  number,
  created: { utc: '2026-10-27T08:00:00Z', by: { id: 'u', name: 'U' } },
  note: null,
  changeCount: changes.length,
  payload: { transactions: payload },
  changes,
})

describe('version helpers', () => {
  const v2rows: Txn[] = [{ externalId: 'c' }, { externalId: 'a' }, { externalId: 'x' }]
  const versions = [
    version(1, txns, [{ op: 'replace', path: '$.transactions[0].payee', old: 'A', new: 'B' }]),
    version(2, v2rows, [
      { op: 'replace', path: '$.transactions[1].payee', old: 'ABC', new: 'ABC Plumbing LLC' },
      { op: 'add', path: '$.transactions[0]', new: { externalId: 'c' } },
      { op: 'remove', path: '$.transactions[1]', old: { externalId: 'b' } },
      { op: 'replace', path: '$.controlTotal', old: 1, new: 2 },
    ]),
    version(3, v2rows, [{ op: 'remove', path: '$.transactions[2]', old: { externalId: 'x' } }]),
  ]

  test('editedInVersions maps change paths to current rows by externalId, ignoring version 1 and removals', () => {
    expect([...editedInVersions(versions, txns)].sort()).toEqual(['0', '2'])
  })

  test('deletedInVersion names the version that removed the row', () => {
    expect(deletedInVersion(versions, 'b')).toBe(2)
    expect(deletedInVersion(versions, 'x')).toBe(3)
    expect(deletedInVersion(versions, 'zzz')).toBeNull()
  })
})
