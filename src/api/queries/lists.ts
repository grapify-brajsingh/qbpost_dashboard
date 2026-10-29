import { useQuery } from '@tanstack/react-query'
import type { QbLists, QbListsResponse } from '../schema'
import { api } from '../client'

export const listKeys = {
  qb: ['quickbooks', 'lists'] as const,
}

/** The pickers only need names; the API's account objects also carry the QuickBooks type. */
export function toQbLists(r: QbListsResponse): QbLists {
  return { ...r, accounts: r.accounts.map((a) => a.name) }
}

/** QuickBooks accounts, vendors and customers for the name comboboxes. */
export function useQbLists(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: listKeys.qb,
    queryFn: ({ signal }) => api.get<QbListsResponse>('/quickbooks/lists', { signal }).then((r) => toQbLists(r.data)),
    staleTime: 5 * 60_000,
    enabled: opts.enabled,
  })
}
