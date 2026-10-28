import { useQuery } from '@tanstack/react-query'
import { api } from '../client'

export const HEALTH_POLL_MS = 60_000

export function useDatabaseHealth() {
  return useQuery({
    queryKey: ['health', 'database'],
    queryFn: () => api.get<{ status: string; checkedUtc: string }>('/health/database').then((r) => r.data),
    refetchInterval: HEALTH_POLL_MS,
    retry: false,
  })
}
