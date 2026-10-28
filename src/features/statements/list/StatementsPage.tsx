import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { STATS_POLL_MS, useRequestsList, useStats, type ListParams } from '@/api/queries/requests'
import { useSession, hasScope } from '@/auth/useSession'
import { useUrlFilters } from '@/components/filters'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { NewArrivalsPill } from '@/features/requests/list/NewArrivalsPill'
import { lastSeen } from './lastSeen'
import { StatementsTable, type SheetTab } from './StatementsTable'
import { StatementsToolbar, StatusTabs } from './StatementsToolbar'
import { countFor, DEFAULT_SORT, paramsFor, SORT_VALUES, STATUS_TAB_IDS, type SortValue, type StatusTab } from './statusTabs'

// Defined at module level: useUrlFilters memoises on the spec's identity.
const FILTER_SPEC = {
  q: { kind: 'text' },
  receivedFrom: { kind: 'date' },
  receivedTo: { kind: 'date' },
  reference: { kind: 'text' },
  emailFrom: { kind: 'text' },
  minTotal: { kind: 'number' },
  maxTotal: { kind: 'number' },
  duplicate: { kind: 'bool' },
} as const

/** Which tab and order, kept apart from the chips so "Clear filters" leaves them alone. */
const VIEW_SPEC = {
  tab: { kind: 'enum', values: STATUS_TAB_IDS },
  sort: { kind: 'enum', values: SORT_VALUES },
} as const

const noSheet = () => {}

export function StatementsPage({ onOpenSheet = noSheet }: { onOpenSheet?: (id: number, tab: SheetTab) => void }) {
  const { me } = useSession()
  const isAdmin = hasScope(me, 'users:manage')
  const filters = useUrlFilters(FILTER_SPEC)
  const view = useUrlFilters(VIEW_SPEC)
  const [search, setSearch] = useSearchParams()

  const tab: StatusTab = view.values.tab ?? 'review'
  const sort: SortValue = view.values.sort ?? DEFAULT_SORT
  const f = filters.values
  const pageNo = Math.max(1, Math.floor(Number(search.get('page'))) || 1)

  const params: ListParams = {
    ...paramsFor(tab, isAdmin),
    sort,
    q: f.q,
    receivedFrom: f.receivedFrom,
    receivedTo: f.receivedTo,
    reference: f.reference,
    emailFrom: f.emailFrom,
    minTotal: f.minTotal,
    maxTotal: f.maxTotal,
    duplicate: f.duplicate,
    page: pageNo,
  }
  const list = useRequestsList(params)
  const stats = useStats({ refetchInterval: STATS_POLL_MS })

  // Rows received since the user last left this page get the new dot; leaving marks "now".
  const [seenAt] = useState(() => lastSeen.read())
  useEffect(() => () => lastSeen.markNow(), [])

  // New arrivals: compare the polled To review count with the count when the list was last loaded.
  const reviewNow = stats.data ? countFor('review', stats.data, isAdmin) : null
  const [baseline, setBaseline] = useState<number | null>(null)
  const settled = list.isSuccess && !list.isPlaceholderData && !stats.isFetching
  useEffect(() => {
    if (reviewNow === null) return
    // Set once the list and stats have loaded; follow the count down when statements leave the queue.
    if (baseline === null ? settled : reviewNow < baseline) setBaseline(reviewNow)
  }, [reviewNow, baseline, settled])
  const newCount = reviewNow !== null && baseline !== null ? Math.max(0, reviewNow - baseline) : 0
  const showNew = async () => {
    const [, fresh] = await Promise.all([list.refetch(), stats.refetch()])
    if (fresh.data) setBaseline(countFor('review', fresh.data, isAdmin))
  }

  const setPage = (n: number) =>
    setSearch((prev) => {
      const next = new URLSearchParams(prev)
      if (n <= 1) next.delete('page')
      else next.set('page', String(n))
      return next
    })

  const total = list.data?.total ?? 0
  const pageSize = list.data?.pageSize ?? 25

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="grid gap-4 p-6">
      <div className="flex items-center gap-4">
        <h1 className="text-[22px] font-semibold">Statements</h1>
        {newCount > 0 && <NewArrivalsPill count={newCount} onShow={() => void showNew()} />}
      </div>
      <StatusTabs value={tab} stats={stats.data} isAdmin={isAdmin} onChange={(t) => view.set({ tab: t === 'review' ? undefined : t })} />
      <StatementsToolbar
        filters={f}
        onSet={(patch) => filters.set(patch)}
        onClear={filters.clear}
        activeCount={filters.activeCount}
      />
      {list.isError ? (
        <ProblemAlert error={list.error} />
      ) : !list.data ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : list.data.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          {tab === 'review' && filters.activeCount === 0 ? 'All clear. Nothing waiting.' : 'No statements match.'}
        </p>
      ) : (
        <StatementsTable
          items={list.data.items}
          sort={sort}
          onSort={(next) => view.set({ sort: next === DEFAULT_SORT ? undefined : next })}
          lastSeen={seenAt}
          onOpenSheet={onOpenSheet}
        />
      )}
      {list.data && total > 0 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {list.data.page} of {pages} · {total} total
          </span>
          <Button variant="outline" size="sm" disabled={pageNo <= 1} onClick={() => setPage(pageNo - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={pageNo >= pages} onClick={() => setPage(pageNo + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
