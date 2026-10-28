import { useQuery } from '@tanstack/react-query'
import type { QbLists } from '../schema'
import { api } from '../client'

export const listKeys = {
  qb: ['quickbooks', 'lists'] as const,
}

/** QuickBooks accounts, vendors and customers for the name comboboxes. */
export function useQbLists(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: listKeys.qb,
    queryFn: ({ signal }) => api.get<QbLists>('/quickbooks/lists', { signal }).then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: opts.enabled,
  })
}
