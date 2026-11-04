import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Page, QbListSyncFilters, QbListSyncRun, QbLists, QbListsResponse, QbListsSyncResponse } from '../schema'
import { api } from '../client'

/** Rows per page on the Lists page's Sync history (R-17). */
export const LIST_SYNCS_PAGE_SIZE = 25

/** After a 504 the sync keeps running on the server: re-read the lists this long after the 504, until it shows up. */
const RECHECK_AFTER_MS = [15_000, 45_000, 90_000, 150_000]

export const listKeys = {
  all: ['quickbooks', 'lists'] as const,
  /** The lists as the API sends them, per company (`undefined` = the API's default company, no `company=` sent). */
  qb: (company?: number) => ['quickbooks', 'lists', 'names', company ?? 'default'] as const,
  sync: (company?: number) => ['quickbooks', 'lists', 'sync', company ?? 'default'] as const,
  syncsAll: ['quickbooks', 'lists', 'syncs'] as const,
  syncs: (company: number | undefined, f: QbListSyncFilters) => ['quickbooks', 'lists', 'syncs', company ?? 'default', f] as const,
}

const companyQuery = (company?: number) => (company === undefined ? '' : `?company=${company}`)

const fetchQbLists = (company: number | undefined) => ({ signal }: { signal: AbortSignal }) =>
  api.get<QbListsResponse>(`/quickbooks/lists${companyQuery(company)}`, { signal }).then((r) => r.data)

/**
 * The pickers only need names (the API's account objects also carry the QuickBooks type); the status line reads
 * `lastSync`, `nextSyncUtc` and the sizes, which are counted here so a GET and a sync answer look the same.
 */
export function toQbLists(r: QbListsResponse): QbLists {
  return {
    ...r,
    accounts: r.accounts.map((a) => a.name),
    counts: { accounts: r.accounts.length, vendors: r.vendors.length, customers: r.customers.length },
  }
}

/** QuickBooks accounts, vendors and customers for the name comboboxes. */
export function useQbLists(company?: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: listKeys.qb(company),
    queryFn: fetchQbLists(company),
    select: toQbLists,
    staleTime: 5 * 60_000,
    enabled: opts.enabled,
  })
}

/** The same query with each account's QuickBooks type, for the Lists page. */
export function useQbListsDetail(company?: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: listKeys.qb(company),
    queryFn: fetchQbLists(company),
    staleTime: 5 * 60_000,
    enabled: opts.enabled,
  })
}

/** `GET /quickbooks/lists/syncs` (R-17): one page of sync attempts, newest first. */
export function useQbListSyncs(company: number | undefined, f: QbListSyncFilters) {
  return useQuery<Page<QbListSyncRun>>({
    queryKey: listKeys.syncs(company, f),
    queryFn: ({ signal }) => {
      const p = new URLSearchParams()
      if (company !== undefined) p.set('company', String(company))
      if (f.trigger.length) p.set('trigger', f.trigger.join(','))
      if (f.outcome.length) p.set('outcome', f.outcome.join(','))
      p.set('page', String(f.page))
      p.set('pageSize', String(LIST_SYNCS_PAGE_SIZE))
      return api.get<Page<QbListSyncRun>>(`/quickbooks/lists/syncs?${p}`, { signal }).then((r) => r.data)
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

const lastFinished = (qc: QueryClient, company?: number) => qc.getQueryData<QbListsResponse>(listKeys.qb(company))?.lastSync?.finishedUtc

/** Pending re-reads per client. They live here, not in a component, so leaving the page does not lose them. */
const rechecks = new WeakMap<QueryClient, ReturnType<typeof setTimeout>[]>()

export function stopQbListRechecks(qc: QueryClient) {
  rechecks.get(qc)?.forEach(clearTimeout)
  rechecks.delete(qc)
}

/**
 * Re-reads the lists on the schedule until an attempt newer than the cached one appears. Call it after the failed
 * sync's own re-read: the running sync cannot be in that read, so it is a safe baseline. A sign-out clears the cache,
 * which leaves a late timer nothing to read.
 */
export function startQbListRechecks(qc: QueryClient, company?: number) {
  stopQbListRechecks(qc)
  const since = lastFinished(qc, company)
  const ids = RECHECK_AFTER_MS.map((ms) =>
    setTimeout(() => {
      void qc.invalidateQueries({ queryKey: listKeys.syncsAll })
      void qc.refetchQueries({ queryKey: listKeys.qb(company), exact: true }).then(() => {
        const finished = lastFinished(qc, company)
        // A newer set may have replaced this one; only this set's own callback may stop it.
        if (rechecks.get(qc) === ids && finished && (!since || Date.parse(finished) > Date.parse(since))) stopQbListRechecks(qc)
      })
    }, ms),
  )
  rechecks.set(qc, ids)
}

/**
 * `POST /quickbooks/lists/sync` (R-16, "Sync now"). A 200 carries the fresh lists, so they replace the cache and the
 * "not in QuickBooks" flags update at once. Any outcome is a new recorded attempt, so the history is re-read, and a
 * failure re-reads the lists to show it (awaited, so the caller sees that read). No client timeout: the API waits up
 * to 120 s for QuickBooks and answers 504 itself.
 */
export function useSyncQbLists(company?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: listKeys.sync(company),
    mutationFn: () => api.post<QbListsSyncResponse>(`/quickbooks/lists/sync${companyQuery(company)}`).then((r) => r.data),
    onSuccess: async (body) => {
      stopQbListRechecks(qc)
      // A GET that started before the sync finished must not replace its answer.
      await qc.cancelQueries({ queryKey: listKeys.qb(company), exact: true })
      qc.setQueryData<QbListsResponse>(listKeys.qb(company), body)
    },
    onError: () => qc.refetchQueries({ queryKey: listKeys.qb(company), exact: true }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: listKeys.syncsAll })
    },
  })
}
