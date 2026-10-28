import { formatCents, toCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { PostStats } from '@/features/requests/transactions/draft'

interface Props {
  /** Sum of every non-deleted row, including don't-post rows, in cents. */
  allCents: number
  controlTotal: unknown
  postStats: PostStats
}

/** Sum of all rows against the control total. Never filtered; the control total is shown, never changed. */
export function ReconciliationMeter({ allCents, controlTotal, postStats }: Props) {
  const ct = typeof controlTotal === 'number' && Number.isFinite(controlTotal) ? toCents(controlTotal) : null
  const diff = ct === null ? null : allCents - ct
  const width = ct === null || ct <= 0 ? 0 : Math.max(0, Math.min(100, (allCents / ct) * 100))
  const skipped = postStats.skipped > 0 ? ` (${postStats.skipped} marked don't post, ${formatCents(postStats.skippedCents)})` : ''

  let label: string
  if (diff === null) label = 'No control total'
  else if (diff === 0) label = 'Matches to the cent'
  else if (diff < 0) label = `Short by ${formatCents(-diff)}`
  else label = `Over by ${formatCents(diff)}`

  return (
    <section
      aria-label="Reconciliation"
      className="grid items-center gap-5 rounded-[10px] border bg-card px-[18px] py-4 md:grid-cols-[auto_1fr_auto]"
    >
      <div className="text-xs text-muted-foreground">
        Sum of all rows
        <div data-testid="meter-sum" className="text-[22px] font-semibold tracking-tight text-foreground tabular-nums">
          {formatCents(allCents)}
        </div>
      </div>
      <div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            data-testid="meter-bar"
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-cyan-400 transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="mt-[7px] flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground tabular-nums">
          <span>{`${postStats.posting} of ${postStats.total} rows will post${skipped}`}</span>
          <span>{ct === null ? 'No control total' : `Control total ${formatCents(ct)}, never changed by the app`}</span>
        </div>
      </div>
      <div
        data-testid="meter-delta"
        className={cn(
          'rounded-lg px-2.5 py-1.5 text-[13px] font-semibold tabular-nums',
          diff === 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
        )}
      >
        {label}
      </div>
    </section>
  )
}
