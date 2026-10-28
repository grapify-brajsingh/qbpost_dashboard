// Pure definitions of the Statements status tabs: which list parameters each sends and which stats count it shows.
import type { ListParams } from '@/api/queries/requests'
import type { Stats } from '@/api/schema'

export type StatusTab = 'review' | 'errors' | 'posted' | 'discarded' | 'all'

export const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: 'review', label: 'To review' },
  { id: 'errors', label: 'Has errors' },
  { id: 'posted', label: 'Posted' },
  { id: 'discarded', label: 'Discarded' },
  { id: 'all', label: 'All' },
]

export const STATUS_TAB_IDS = STATUS_TABS.map((t) => t.id)

/** Partial and unknown pushes need an admin's attention, so only admins see them in To review. */
export function paramsFor(tab: StatusTab, isAdmin: boolean): ListParams {
  switch (tab) {
    case 'review':
      return { status: isAdmin ? ['pending', 'partial', 'unknown'] : ['pending'], sort: '-received' }
    case 'errors':
      return { status: ['pending'], hasErrors: true, sort: '-received' }
    case 'posted':
      return { status: ['posted'], sort: '-received' }
    case 'discarded':
      return { status: ['discarded'], sort: '-received' }
    case 'all':
      return { sort: '-received' }
  }
}

export function countFor(tab: StatusTab, stats: Stats, isAdmin: boolean): number {
  const s = stats.byStatus
  switch (tab) {
    case 'review':
      return s.pending + (isAdmin ? s.partial + s.unknown : 0)
    case 'errors':
      return stats.hasErrors.pending
    case 'posted':
      return s.posted
    case 'discarded':
      return s.discarded
    case 'all':
      return Object.values(s).reduce((a, b) => a + b, 0)
  }
}

export const SORT_VALUES = ['received', '-received', 'total', '-total', 'rows', '-rows'] as const
export type SortValue = (typeof SORT_VALUES)[number]
export const DEFAULT_SORT: SortValue = '-received'

export type SortKey = 'received' | 'total' | 'rows'

/** First click sorts descending, the next ascending, then back to descending. */
export function nextSort(current: SortValue, key: SortKey): SortValue {
  return current === `-${key}` ? key : (`-${key}` as SortValue)
}

