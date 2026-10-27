import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Page, RequestSummary, Stats } from '../schema'
import { api } from '../client'
import type { ListParams } from '@/features/requests/list/queue'

export const STATS_POLL_MS = 60_000

export const requestKeys = {
  all: ['requests'] as const,
  list: (params: ListParams) => [...requestKeys.all, 'list', params] as const,
  stats: () => [...requestKeys.all, 'stats'] as const,
  detail: (id: number | string) => [...requestKeys.all, 'detail', String(id)] as const,
  versions: (id: number | string) => [...requestKeys.detail(id), 'versions'] as const,
  version: (id: number | string, n: number) => [...requestKeys.detail(id), 'versions', n] as const,
  attempts: (id: number | string) => [...requestKeys.detail(id), 'attempts'] as const,
  attempt: (id: number | string, a: number) => [...requestKeys.detail(id), 'attempts', a] as const,
  events: (id: number | string) => [...requestKeys.detail(id), 'events'] as const,
  original: (id: number | string) => [...requestKeys.detail(id), 'original'] as const,
}

/** Status is a repeated `status=` parameter. */
export function listQuery(params: ListParams): string {
  const qs = new URLSearchParams()
  for (const s of params.status ?? []) qs.append('status', s)
  if (params.needsAttention !== undefined) qs.set('needsAttention', String(params.needsAttention))
  if (params.duplicate !== undefined) qs.set('duplicate', String(params.duplicate))
  if (params.q) qs.set('q', params.q)
  if (params.receivedFrom) qs.set('receivedFrom', params.receivedFrom)
  if (params.receivedTo) qs.set('receivedTo', params.receivedTo)
  if (params.source) qs.set('source', params.source)
  if (params.sort) qs.set('sort', params.sort)
  if (params.page && params.page > 1) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  return qs.toString()
}

/** Rows never change on their own: no interval and no refetch on focus. The new-arrivals pill refetches. */
export function useRequestsList(params: ListParams) {
  return useQuery<Page<RequestSummary>>({
    queryKey: requestKeys.list(params),
    queryFn: ({ signal }) =>
      api.get<Page<RequestSummary>>(`/saved-requests?${listQuery(params)}`, { signal }).then((r) => r.data),
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
}

export function useStats(opts: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: requestKeys.stats(),
    queryFn: ({ signal }) => api.get<Stats>('/saved-requests/stats', { signal }).then((r) => r.data),
    refetchInterval: opts.refetchInterval,
  })
}
