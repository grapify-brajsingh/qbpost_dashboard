import { CheckCircle2Icon, CircleOffIcon, CirclePauseIcon, CircleXIcon, HistoryIcon, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { LIST_SYNCS_PAGE_SIZE, useQbListSyncs } from '@/api/queries/lists'
import { ApiError } from '@/api/problem'
import type { QbListSync, QbListSyncRun } from '@/api/schema'
import { DataPanel, EmptyState, Pager, TableSkeleton } from '@/components/DataPanel'
import { ClearFilters, FilterChip } from '@/components/filters'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { parsePage } from '@/lib/pageParam'
import { countsText, durationText, outcomeView, RESULTS, STARTED_BY, startedByLabel, syncFiltersFrom } from './qbListsView'

type StartedBy = (typeof STARTED_BY)[number]
type Result = (typeof RESULTS)[number]

const STARTED_BY_OPTIONS = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'manual', label: 'Manual' },
  { value: 'imported', label: 'Imported' },
] as const
const RESULT_OPTIONS = [
  { value: 'ok', label: 'Synced' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'failed', label: 'Failed' },
] as const
const ICONS: Record<QbListSync['outcome'], LucideIcon> = { ok: CheckCircle2Icon, skipped: CirclePauseIcon, failed: CircleXIcon }

/** Every recorded list sync attempt, newest first (R-17), with who started it and what came of it. */
export function SyncHistory({
  by,
  result,
  onFilter,
}: {
  by?: StartedBy
  result?: Result
  onFilter: (patch: { by?: StartedBy; result?: Result }) => void
}) {
  const [search, setSearch] = useSearchParams()
  const page = parsePage(search.get('page'))
  const syncs = useQbListSyncs(syncFiltersFrom({ by, result }, page))
  const filtered = by !== undefined || result !== undefined

  const setPage = (n: number) =>
    setSearch((prev) => {
      const next = new URLSearchParams(prev)
      if (n <= 1) next.delete('page')
      else next.set('page', String(n))
      return next
    })

  // An API from before M15 has no history route; the name tabs work without it.
  if (syncs.error instanceof ApiError && syncs.error.problem.status === 404) {
    return (
      <DataPanel>
        <EmptyState icon={CircleOffIcon} title="Sync history needs a newer API." description="The names and Sync now still work." />
      </DataPanel>
    )
  }

  const total = syncs.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / (syncs.data?.pageSize ?? LIST_SYNCS_PAGE_SIZE)))

  return (
    <div className="grid gap-4">
      <div role="search" aria-label="Sync history filters" className="flex flex-wrap items-center gap-2">
        <FilterChip label="Started by" value={by} options={STARTED_BY_OPTIONS} onChange={(v) => onFilter({ by: v as StartedBy | undefined })} />
        <FilterChip label="Result" value={result} options={RESULT_OPTIONS} onChange={(v) => onFilter({ result: v as Result | undefined })} />
        <ClearFilters onClear={() => onFilter({ by: undefined, result: undefined })} disabled={!filtered} />
      </div>

      {syncs.isError ? (
        <ProblemAlert error={syncs.error} />
      ) : (
        <DataPanel>
          {!syncs.data ? (
            <TableSkeleton columns={6} rows={6} />
          ) : syncs.data.items.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title={filtered ? 'No syncs match these filters' : 'No syncs yet'}
              description={filtered ? 'Clear the filters above to see every attempt.' : 'Each automatic sync and each Sync now appears here.'}
            />
          ) : (
            <HistoryTable runs={syncs.data.items} />
          )}
        </DataPanel>
      )}

      {syncs.data && total > 0 && <Pager page={page} shown={syncs.data.page} pages={pages} total={total} onPage={setPage} />}
    </div>
  )
}

function HistoryTable({ runs }: { runs: readonly QbListSyncRun[] }) {
  return (
    <Table aria-label="Sync history" className="min-w-[860px]">
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Started by</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Names</TableHead>
          <TableHead>Took</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => {
          const view = outcomeView(r.outcome)
          const Icon = ICONS[r.outcome]
          return (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums">
                <Timestamp utc={r.startedUtc} />
              </TableCell>
              <TableCell>{startedByLabel(r)}</TableCell>
              <TableCell>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Badge variant={view.tone}>
                    <Icon aria-hidden />
                    {view.label}
                  </Badge>
                  {r.current && <Badge variant="brand">In use</Badge>}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{countsText(r.counts)}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{durationText(r.startedUtc, r.finishedUtc)}</TableCell>
              <TableCell className="max-w-[40ch] text-xs whitespace-normal text-muted-foreground">{r.message}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
