import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { AuditAction, AuditEvent, Page } from '../schema'
import { api } from '../client'

export interface AuditParams {
  from?: string
  to?: string
  actor?: string
  requestId?: number
  reference?: string
  pushId?: string
  action?: AuditAction[]
  q?: string
  page?: number
  pageSize?: number
}

function auditQuery(params: AuditParams): string {
  const qs = new URLSearchParams()
  for (const k of ['from', 'to', 'actor', 'reference', 'pushId', 'q'] as const) {
    if (params[k]) qs.set(k, params[k])
  }
  if (params.requestId !== undefined) qs.set('requestId', String(params.requestId))
  for (const a of params.action ?? []) qs.append('action', a)
  if (params.page && params.page > 1) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  return qs.toString()
}

export function useAuditEvents(params: AuditParams) {
  return useQuery<Page<AuditEvent>>({
    queryKey: ['audit', params],
    queryFn: ({ signal }) => api.get<Page<AuditEvent>>(`/audit-events?${auditQuery(params)}`, { signal }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })
}

/** API path (relative to the client's base) of the CSV of everything the filters match (page and pageSize do not apply). */
export function auditCsvPath(params: AuditParams): string {
  const { page: _page, pageSize: _pageSize, ...filters } = params
  void _page
  void _pageSize
  return `/audit-events.csv?${auditQuery(filters)}`
}

/** Same as `auditCsvPath`, as the absolute URL a browser would open. */
export function auditCsvHref(params: AuditParams): string {
  return `/api/v1${auditCsvPath(params)}`
}
