import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { STATS_POLL_MS, useRequestsList, useStats } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { NewArrivalsPill } from './NewArrivalsPill'
import { countFor, isQueueTab, QUEUE_PRESETS, type ListParams, type QueueTab } from './queue'
import { QueueTabs } from './QueueTabs'
import { RequestsFilters } from './RequestsFilters'
import { RequestsTable } from './RequestsTable'

const DEBOUNCE_MS = 300

export function RequestsPage() {
  const [search, setSearch] = useSearchParams()
  const tabParam = search.get('tab')
  const tab: QueueTab = isQueueTab(tabParam) ? tabParam : 'todo'
  const q = search.get('q') ?? ''
  const receivedFrom = search.get('receivedFrom') ?? ''
  const receivedTo = search.get('receivedTo') ?? ''
  const source = search.get('source') ?? ''
  const pageNo = Math.max(1, Number(search.get('page')) || 1)

  /** Writes URL state; anything but the page itself resets the page to 1. */
  const update = (patch: Record<string, string>, opts: { replace?: boolean; keepPage?: boolean } = {}) => {
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!opts.keepPage) next.delete('page')
        for (const [k, v] of Object.entries(patch)) {
          if (v === '' || (k === 'tab' && v === 'todo') || (k === 'page' && v === '1')) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: opts.replace },
    )
  }

  // The search box is local state, written to the URL 300 ms after the last keystroke.
  const [qInput, setQInput] = useState(q)
  useEffect(() => setQInput(q), [q])
  useEffect(() => {
    if (qInput === q) return
    const t = setTimeout(() => update({ q: qInput.trim() }, { replace: true }), DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a keystroke should (re)start the timer
  }, [qInput])

  const params: ListParams = {
    ...QUEUE_PRESETS[tab],
    q: q || undefined,
    receivedFrom: receivedFrom || undefined,
    receivedTo: receivedTo || undefined,
    source: source || undefined,
    page: pageNo,
  }
  const list = useRequestsList(params)
  const stats = useStats({ refetchInterval: STATS_POLL_MS })

  // New arrivals: compare the polled To-do count with the count when the list was last loaded.
  const todoNow = stats.data ? countFor('todo', stats.data) : null
  const [baseline, setBaseline] = useState<number | null>(null)
  const settled = list.isSuccess && !list.isPlaceholderData && !stats.isFetching
  useEffect(() => {
    if (todoNow === null) return
    // Set once the list and stats have loaded; follow the count down when requests leave the queue.
    if (baseline === null ? settled : todoNow < baseline) setBaseline(todoNow)
  }, [todoNow, baseline, settled])
  const newCount = todoNow !== null && baseline !== null ? Math.max(0, todoNow - baseline) : 0
  const showNew = async () => {
    const [, fresh] = await Promise.all([list.refetch(), stats.refetch()])
    if (fresh.data) setBaseline(countFor('todo', fresh.data))
  }

  const total = list.data?.total ?? 0
  const pageSize = list.data?.pageSize ?? 25
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const filtered = Boolean(q || receivedFrom || receivedTo || source)

  return (
    <div className="grid gap-4 p-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">Requests</h1>
        {newCount > 0 && <NewArrivalsPill count={newCount} onShow={() => void showNew()} />}
      </div>
      <QueueTabs value={tab} stats={stats.data} onChange={(t) => update({ tab: t })} />
      <RequestsFilters
        values={{ q: qInput, receivedFrom, receivedTo, source }}
        onQChange={setQInput}
        onChange={(patch) => update(patch)}
      />
      {list.isError ? (
        <ProblemAlert error={list.error} />
      ) : !list.data ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : list.data.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          {tab === 'todo' && !filtered ? 'All clear. Nothing waiting.' : 'No requests match.'}
        </p>
      ) : (
        <RequestsTable items={list.data.items} />
      )}
      {list.data && total > 0 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {list.data.page} of {pages} · {total} total
          </span>
          <Button variant="outline" size="sm" disabled={pageNo <= 1} onClick={() => update({ page: String(pageNo - 1) }, { keepPage: true })}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={pageNo >= pages} onClick={() => update({ page: String(pageNo + 1) }, { keepPage: true })}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
