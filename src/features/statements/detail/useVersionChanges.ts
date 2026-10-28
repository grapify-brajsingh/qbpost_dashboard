import { useEffect } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { requestKeys } from '@/api/queries/requests'
import type { Version, VersionSummary } from '@/api/schema'

/**
 * Every saved version after version 1, with its change list, once all have loaded (undefined until then).
 * Fetched only while `enabled` (the Edited filter, or a `?row=` that isn't on screen).
 */
export function useVersionChanges(id: string, currentVersion: number, enabled: boolean): Version[] | undefined {
  const list = useQuery({
    queryKey: requestKeys.versions(id),
    queryFn: ({ signal }) => api.get<VersionSummary[]>(`/saved-requests/${id}/versions`, { signal }).then((r) => r.data),
    enabled,
  })
  const latest = list.data ? Math.max(0, ...list.data.map((v) => v.number)) : null
  // A save made a version the cached list doesn't have yet.
  const { refetch } = list
  useEffect(() => {
    if (enabled && latest !== null && latest < currentVersion) void refetch()
  }, [enabled, latest, currentVersion, refetch])

  const numbers = (list.data ?? []).map((v) => v.number).filter((n) => n > 1)
  return useQueries({
    queries: numbers.map((n) => ({
      queryKey: requestKeys.version(id, n),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<Version>(`/saved-requests/${id}/versions/${n}`, { signal }).then((r) => r.data),
      enabled,
      staleTime: Infinity, // a saved version never changes
    })),
    combine: (results) => (list.data && results.every((r) => r.data !== undefined) ? results.map((r) => r.data as Version) : undefined),
  })
}
