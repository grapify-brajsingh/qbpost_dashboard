import { describe, expect, test } from 'vitest'
import { formatRelative, formatTimestamp } from './dates'

const pad = (n: number) => String(n).padStart(2, '0')

describe('dates', () => {
  test('formats local yyyy-MM-dd HH:mm', () => {
    const iso = '2026-10-27T10:05:00Z'
    const d = new Date(iso)
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    expect(formatTimestamp(iso)).toBe(expected)
    expect(formatTimestamp(iso)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
  test('relative time', () =>
    expect(formatRelative('2026-10-27T10:00:00Z', new Date('2026-10-27T10:02:00Z'))).toBe('2 minutes ago'))
  test('relative hours and days', () => {
    expect(formatRelative('2026-10-27T07:00:00Z', new Date('2026-10-27T10:00:00Z'))).toBe('3 hours ago')
    expect(formatRelative('2026-10-25T10:00:00Z', new Date('2026-10-27T10:00:00Z'))).toBe('2 days ago')
  })
  test('invalid input does not throw', () => {
    for (const bad of ['garbage', '']) {
      expect(formatTimestamp(bad)).toBe('—')
      expect(formatRelative(bad)).toBe('')
    }
  })
})
