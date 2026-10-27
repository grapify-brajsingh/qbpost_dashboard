import { describe, expect, test } from 'vitest'
import type { Finding, Txn } from '@/api/schema'
import { findingsByRow, readErrorCells, tableShape } from './findings'

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
