import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CompaniesResponse, Company, CompanyPatch, CompanyScanResult } from '../schema'
import { api } from '../client'
import { ApiError } from '../problem'

export const companyKeys = { all: ['companies'] as const }

/**
 * `GET /companies`. `null` means an API without multi-company (404): pages then show no company selectors.
 * A 4xx is an answer, not a blip, so it is never retried.
 */
export function useCompanies() {
  return useQuery<CompaniesResponse | null>({
    queryKey: companyKeys.all,
    queryFn: async ({ signal }) => {
      try {
        return (await api.get<CompaniesResponse>('/companies', { signal })).data
      } catch (e) {
        if (e instanceof ApiError && e.problem.status === 404) return null
        throw e
      }
    },
    staleTime: 30_000,
    retry: (count, e) => !(e instanceof ApiError && e.problem.status < 500) && count < 1,
  })
}

/** Every company change also lands in the audit feed. */
function useRefreshAfter() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: companyKeys.all })
    void qc.invalidateQueries({ queryKey: ['audit'] })
  }
}

/** `POST /companies/scan`: re-reads the company folders under the configured root. */
export function useScanCompanies() {
  const refresh = useRefreshAfter()
  return useMutation({
    mutationKey: [...companyKeys.all, 'scan'],
    mutationFn: () => api.post<CompanyScanResult>('/companies/scan').then((r) => r.data),
    onSettled: refresh,
  })
}

/** `POST /companies/{id}/check`: opens the file in QuickBooks to see whether access is approved. Never retried. */
export function useCheckCompany() {
  const refresh = useRefreshAfter()
  return useMutation({
    retry: false,
    mutationFn: ({ id }: { id: number }) => api.post<Company>(`/companies/${id}/check`).then((r) => r.data),
    onSettled: refresh,
  })
}

/** `PATCH /companies/{id}` with `If-Match: "<rowVersion>"`. */
export function useUpdateCompany() {
  const refresh = useRefreshAfter()
  return useMutation({
    mutationFn: ({ id, rowVersion, patch }: { id: number; rowVersion: number; patch: CompanyPatch }) =>
      api.patch<Company>(`/companies/${id}`, patch, { headers: { 'If-Match': `"${rowVersion}"` } }).then((r) => r.data),
    onSettled: refresh,
  })
}
