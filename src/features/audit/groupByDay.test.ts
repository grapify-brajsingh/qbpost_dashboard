import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '@/api/schema'
import { groupByDay } from './groupByDay'

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString()
const ev = (id: string, atUtc: string): AuditEvent => ({
  id, atUtc, actor: { id: 'u', name: 'A', kind: 'user' }, action: 'received',
  request: null, row: null, field: null, old: null, new: null, versionNumber: null, detail: null,
})

describe('groupByDay', () => {
  const now = new Date(2026, 9, 28, 16, 0)

  it('groups by local day with Today / Yesterday labels, newest first', () => {
    const groups = groupByDay(
      [ev('old', at(2026, 10, 20, 9)), ev('a', at(2026, 10, 28, 8)), ev('y', at(2026, 10, 27, 23, 30)), ev('b', at(2026, 10, 28, 14, 20))],
      now,
    )
    expect(groups.map((g) => g.label)).toEqual(['Today, 28 Oct', 'Yesterday, 27 Oct', 'Tue, 20 Oct'])
    expect(groups[0].items.map((e) => e.id)).toEqual(['b', 'a'])
    expect(groups[1].items.map((e) => e.id)).toEqual(['y'])
  })

  it('splits on local midnight, not UTC midnight', () => {
    const groups = groupByDay([ev('late', at(2026, 10, 27, 23, 59)), ev('early', at(2026, 10, 28, 0, 1))], now)
    expect(groups.map((g) => g.items[0].id)).toEqual(['early', 'late'])
  })

  it('returns nothing for no events and keeps an unreadable date from crashing', () => {
    expect(groupByDay([], now)).toEqual([])
    expect(groupByDay([ev('bad', 'nope')], now)[0].label).toBe('Unknown date')
  })
})
