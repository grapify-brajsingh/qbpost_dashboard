// Pure definitions of the queue tabs: which list parameters each tab sends and which stats count it shows.
import type { RequestStatus, Stats } from '@/api/schema'

export type QueueTab = 'todo' | 'attention' | 'duplicates' | 'posting' | 'posted' | 'discarded' | 'all'

export interface ListParams {
  status?: RequestStatus[]
  needsAttention?: boolean
  duplicate?: boolean
  q?: string
  receivedFrom?: string
  receivedTo?: string
  source?: string
  sort?: string
  page?: number
  pageSize?: number
}

export const QUEUE_TABS: { id: QueueTab; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'duplicates', label: 'Possible duplicates' },
  { id: 'posting', label: 'Posting' },
  { id: 'posted', label: 'Posted' },
  { id: 'discarded', label: 'Discarded' },
  { id: 'all', label: 'All' },
]

export const QUEUE_PRESETS: Record<QueueTab, ListParams> = {
  todo: { status: ['pending', 'partial', 'unknown'], sort: 'received' },
  attention: { status: ['pending'], needsAttention: true, sort: 'received' },
  duplicates: { status: ['pending'], duplicate: true, sort: 'received' },
  posting: { status: ['posting'], sort: '-updated' },
  posted: { status: ['posted'], sort: '-updated' },
  discarded: { status: ['discarded'], sort: '-updated' },
  all: { sort: '-received' },
}

export function isQueueTab(v: string | null): v is QueueTab {
  return QUEUE_TABS.some((t) => t.id === v)
}

export function countFor(tab: QueueTab, stats: Stats): number {
  const s = stats.byStatus
  switch (tab) {
    case 'todo':
      return s.pending + s.partial + s.unknown
    case 'attention':
      return stats.needsAttention.pending
    case 'duplicates':
      return stats.duplicate.pending
    case 'posting':
      return s.posting
    case 'posted':
      return s.posted
    case 'discarded':
      return s.discarded
    case 'all':
      return Object.values(s).reduce((a, b) => a + b, 0)
  }
}
