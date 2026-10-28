import type { Stats } from '@/api/schema'
import { countFor, paramsFor } from './statusTabs'

const STATS: Stats = {
  byStatus: { pending: 7, posting: 1, posted: 4, partial: 1, unknown: 1, discarded: 2 },
  needsAttention: { pending: 2, all: 3 },
  duplicate: { pending: 1, all: 1 },
  hasErrors: { pending: 2, all: 3 },
}

describe('status tabs', () => {
  it('review adds partial and unknown for admins only', () => {
    expect(paramsFor('review', true)).toEqual({ status: ['pending', 'partial', 'unknown'], sort: '-received' })
    expect(paramsFor('review', false)).toEqual({ status: ['pending'], sort: '-received' })
  })

  it('other tabs', () => {
    expect(paramsFor('errors', false)).toEqual({ status: ['pending'], hasErrors: true, sort: '-received' })
    expect(paramsFor('posted', true)).toEqual({ status: ['posted'], sort: '-received' })
    expect(paramsFor('discarded', true)).toEqual({ status: ['discarded'], sort: '-received' })
    expect(paramsFor('all', true)).toEqual({ sort: '-received' })
  })

  it('counts come from stats; errors uses hasErrors.pending', () => {
    expect(countFor('review', STATS, true)).toBe(9)
    expect(countFor('review', STATS, false)).toBe(7)
    expect(countFor('errors', STATS, true)).toBe(2)
    expect(countFor('posted', STATS, true)).toBe(4)
    expect(countFor('discarded', STATS, true)).toBe(2)
    expect(countFor('all', STATS, true)).toBe(16)
  })
})
