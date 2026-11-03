import { describe, expect, test } from 'vitest'
import type { Finding, Txn } from '@/api/schema'
import { dropResolvedFindings, findingsByRow, readErrorCells, tableShape } from './findings'

const rows: Txn[] = [{ externalId: 'a' }, { externalId: 'b' }, { externalId: 'c' }]

describe('findingsByRow', () => {
  test('maps by index', () => {
    const f: Finding[] = [
      { index: 1, reason: 'x' },
      { index: 1, reason: 'y' },
      { index: 2, reason: 'z' },
    ]
    const m = findingsByRow(rows, f)
    expect(m.get(1)?.map((x) => x.reason)).toEqual(['x', 'y'])
    expect(m.get(2)).toHaveLength(1)
    expect(m.has(0)).toBe(false)
  })

  test('prefers the externalId match when the index disagrees', () => {
    const m = findingsByRow(rows, [{ index: 0, externalId: 'c', reason: 'x' }])
    expect(m.has(0)).toBe(false)
    expect(m.get(2)).toHaveLength(1)
  })

  test('keeps the index when the externalId matches no row', () => {
    expect(findingsByRow(rows, [{ index: 1, externalId: 'zzz', reason: 'x' }]).get(1)).toHaveLength(1)
  })

  test('drops out-of-range findings into the -1 bucket', () => {
    const m = findingsByRow(rows, [
      { index: 9, reason: 'x' },
      { index: -4, reason: 'y' },
    ])
    expect(m.get(-1)?.map((x) => x.reason)).toEqual(['x', 'y'])
  })
})

describe('dropResolvedFindings', () => {
  const lists = { accounts: ['Chase', 'Rent'], vendors: ['Acme'], customers: ['Tenant'], syncedUtc: null }

  test('drops an unknown-payee finding once the vendor is in the lists', () => {
    const r: Txn[] = [{ kind: 'Check', payee: 'Acme' }]
    expect(dropResolvedFindings(r, [{ index: 0, reason: 'unknown-payee' }], lists)).toEqual([])
  })

  test('looks a deposit payee up among the customers', () => {
    const r: Txn[] = [{ kind: 'Deposit', payee: 'Acme' }, { kind: 'Deposit', payee: 'Tenant' }]
    const f: Finding[] = [{ index: 0, reason: 'unknown-payee' }, { index: 1, reason: 'unknown-payee' }]
    expect(dropResolvedFindings(r, f, lists)).toEqual([f[0]])
  })

  test('matches names exactly, like the "not in QuickBooks" flag', () => {
    const r: Txn[] = [{ kind: 'Check', payee: 'acme' }]
    const f: Finding[] = [{ index: 0, reason: 'unknown-payee' }]
    expect(dropResolvedFindings(r, f, lists)).toEqual(f)
  })

  test('drops unknown-account only when both account fields are in the lists', () => {
    const r: Txn[] = [{ account: 'Chase', lineAccount: 'Rent' }, { account: 'Chase', lineAccount: 'Nope' }, { account: 'Chase' }]
    const f: Finding[] = [0, 1, 2].map((index) => ({ index, reason: 'unknown-account' }))
    expect(dropResolvedFindings(r, f, lists)).toEqual([f[1]])
  })

  test('finds the row by externalId, as findingsByRow does', () => {
    const r: Txn[] = [{ externalId: 'a', kind: 'Check', payee: 'Nope' }, { externalId: 'b', kind: 'Check', payee: 'Acme' }]
    expect(dropResolvedFindings(r, [{ index: 0, externalId: 'b', reason: 'unknown-payee' }], lists)).toEqual([])
  })

  test('keeps other reasons, findings with no row, and everything when the lists have not loaded', () => {
    const r: Txn[] = [{ kind: 'Check', payee: 'Acme' }]
    const other: Finding[] = [{ index: 0, reason: 'no-account-rule' }, { index: 9, reason: 'unknown-payee' }]
    expect(dropResolvedFindings(r, other, lists)).toEqual(other)
    const f: Finding[] = [{ index: 0, reason: 'unknown-payee' }]
    expect(dropResolvedFindings(r, f, undefined)).toEqual(f)
  })
})

test('readErrorCells parses transaction field paths', () => {
  const m = readErrorCells([
    '$.transactions[3].kind',
    '$.transactions[3].amount',
    '$.transactions[5].date',
    '$.transactions',
    'junk',
  ])
  expect([...(m.get(3) ?? [])]).toEqual(['kind', 'amount'])
  expect([...(m.get(5) ?? [])]).toEqual(['date'])
  expect(m.size).toBe(2)
})

describe('tableShape', () => {
  test('raw when transactions is missing, not an array, or has a non-object', () => {
    expect(tableShape({})).toBe('raw')
    expect(tableShape({ transactions: 'x' })).toBe('raw')
    expect(tableShape({ transactions: [{}, 3] })).toBe('raw')
    expect(tableShape({ transactions: [null] })).toBe('raw')
    expect(tableShape({ transactions: [[]] })).toBe('raw')
  })
  test('table otherwise', () => {
    expect(tableShape({ transactions: [{}] })).toBe('table')
    expect(tableShape({ transactions: [] })).toBe('table')
  })
})
