import { describe, expect, test } from 'vitest'
import { formatCents, formatMoney, parseAmountInput, sumCents, toCents } from './money'

describe('money', () => {
  test('sums 200 rows of 0.1 exactly', () => expect(sumCents(Array(200).fill(0.1))).toBe(2000))
  test('sums mixed amounts to the cent', () => expect(sumCents([184.32, 62.1, 1250, 0.3, 0.2])).toBe(149692))
  test('ignores non-numbers in a broken payload', () => expect(sumCents([1.5, '2', null, undefined])).toBe(150))
  test('toCents rounds', () => expect(toCents(184.32)).toBe(18432))
  test('formats', () => {
    expect(formatMoney(4820.17)).toBe('4,820.17')
    expect(formatMoney(-5)).toBe('-5.00')
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney(1250.5)).toBe('1,250.50')
  })
  test('formatCents', () => expect(formatCents(149692)).toBe('1,496.92'))
  test('parses amount input', () => {
    expect(parseAmountInput('1,250.5')).toBe(1250.5)
    expect(parseAmountInput('184.321')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('-12')).toBe(-12)
    expect(parseAmountInput('1.2.3')).toBeNull()
    expect(parseAmountInput('')).toBeNull()
  })
})
