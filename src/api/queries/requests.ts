import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Attempt,
  Page,
  Payload,
  RequestDetail,
  RequestEvent,
  RequestStatus,
  RequestSummary,
  Stats,
  Version,
  VersionSummary,
} from '../schema'
import { useDraftDirty } from '@/features/requests/transactions/draftDirtyStore'
import { api } from '../client'

export interface ListParams {
  status?: RequestStatus[]
  needsAttention?: boolean
  duplicate?: boolean
  q?: string
  receivedFrom?: string
  receivedTo?: string
  source?: string
  emailFrom?: string
  reference?: string
  minTotal?: number
  maxTotal?: number
  hasErrors?: boolean
  /** `received`, `created`, `updated`, `controlTotal`, `total`, `rows`; a leading `-` sorts descending. */
  sort?: string
  page?: number
  pageSize?: number
}

export const STATS_POLL_MS = 60_000
export const POSTING_POLL_MS = 3000

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
  if (params.emailFrom) qs.set('emailFrom', params.emailFrom)
  if (params.reference) qs.set('reference', params.reference)
  if (params.minTotal !== undefined) qs.set('minTotal', String(params.minTotal))
  if (params.maxTotal !== undefined) qs.set('maxTotal', String(params.maxTotal))
  if (params.hasErrors !== undefined) qs.set('hasErrors', String(params.hasErrors))
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

export interface RequestWithEtag {
  request: RequestDetail
  etag: string
}

/**
 * Polls every 3 s while posting, or always with `forcePoll` (a post is being watched: a failed reload must not end
 * the polling). Focus refetch is off while the user has unsaved edits.
 */
export function useRequest(id: string, opts: { forcePoll?: boolean } = {}) {
  const dirty = useDraftDirty(id)
  const force = opts.forcePoll === true
  return useQuery<RequestWithEtag>({
    queryKey: requestKeys.detail(id),
    queryFn: async ({ signal }) => {
      const r = await api.get<RequestDetail>(`/saved-requests/${id}`, { signal })
      return { request: r.data, etag: r.headers.get('ETag') ?? '' }
    },
    refetchOnWindowFocus: !dirty,
    refetchInterval: (q) => (force || q.state.data?.request.status === 'posting' ? POSTING_POLL_MS : false),
  })
}

/** Re-runs validation. The response is the full record: it replaces the detail cache (invalidates if no ETag came back). */
export function useValidate(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<RequestWithEtag> => {
      const r = await api.post<RequestDetail>(`/saved-requests/${id}/validate`)
      return { request: r.data, etag: r.headers.get('ETag') ?? '' }
    },
    onSuccess: (data) => {
      if (data.etag) qc.setQueryData(requestKeys.detail(id), data)
      else void qc.invalidateQueries({ queryKey: requestKeys.detail(id), exact: true })
    },
  })
}

export interface SaveVars {
  payload: Payload
  note?: string
  /** The ETag of what is on screen. The caller refuses to save without one. */
  etag: string
}

/** Discard, restore and resolve change status, so everything derived from the request is refetched. */
function useStatusMutation<V extends object | undefined>(id: string, path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: V) => api.post<RequestDetail>(`/saved-requests/${id}/${path}`, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: requestKeys.all }),
  })
}

export const useDiscard = (id: string) => useStatusMutation<{ reason: string }>(id, 'discard')
export const useRestore = (id: string) => useStatusMutation<undefined>(id, 'restore')
export const useResolve = (id: string) =>
  useStatusMutation<{ outcome: 'posted' | 'not-posted'; note: string }>(id, 'resolve')

/** `PUT /saved-requests/{id}` with If-Match. The returned record replaces the detail cache. */
export function useSaveRequest(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ payload, note, etag }: SaveVars): Promise<RequestWithEtag> => {
      const body = note ? { payload, note } : { payload }
      const r = await api.put<RequestDetail>(`/saved-requests/${id}`, body, { headers: { 'If-Match': etag } })
      return { request: r.data, etag: r.headers.get('ETag') ?? '' }
    },
    onSuccess: (data) => {
      if (data.etag) qc.setQueryData(requestKeys.detail(id), data)
      else void qc.invalidateQueries({ queryKey: requestKeys.detail(id), exact: true })
    },
  })
}

export const useVersions = (id: string) =>
  useQuery({
    queryKey: requestKeys.versions(id),
    queryFn: ({ signal }) => api.get<VersionSummary[]>(`/saved-requests/${id}/versions`, { signal }).then((r) => r.data),
  })

export const useVersion = (id: string, n: number | null) =>
  useQuery({
    queryKey: requestKeys.version(id, n ?? 0),
    queryFn: ({ signal }) => api.get<Version>(`/saved-requests/${id}/versions/${n}`, { signal }).then((r) => r.data),
    enabled: n !== null,
  })

/** The original n8n body as exact text (whitespace preserved); `enabled` defers the fetch until it is viewed. */
export const useOriginal = (id: string, enabled = true) =>
  useQuery({
    queryKey: requestKeys.original(id),
    queryFn: ({ signal }) => api.getText(`/saved-requests/${id}/original`, { signal }),
    enabled,
  })

export const useAttempts = (id: string) =>
  useQuery({
    queryKey: requestKeys.attempts(id),
    queryFn: ({ signal }) => api.get<Attempt[]>(`/saved-requests/${id}/attempts`, { signal }).then((r) => r.data),
  })

export const useAttempt = (id: string, attemptId: number, enabled = true) =>
  useQuery({
    queryKey: requestKeys.attempt(id, attemptId),
    queryFn: ({ signal }) => api.get<Attempt>(`/saved-requests/${id}/attempts/${attemptId}`, { signal }).then((r) => r.data),
    enabled,
  })

export const useEvents = (id: string) =>
  useQuery({
    queryKey: requestKeys.events(id),
    queryFn: ({ signal }) => api.get<RequestEvent[]>(`/saved-requests/${id}/events`, { signal }).then((r) => r.data),
  })
