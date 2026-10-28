import type { UseQueryResult } from '@tanstack/react-query'
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { PeriodCounts, ThroughputAction } from '@/api/queries/home'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CardError } from './CardState'
import { auditHref, delta, successRate } from './homeMetrics'

/** Whether a rise is good news: received is neither. */
type Polarity = 'up-good' | 'up-bad' | 'neutral'

const CELLS: { action: ThroughputAction; label: string; unit: string; polarity: Polarity }[] = [
  { action: 'received', label: 'Received', unit: 'statements received', polarity: 'neutral' },
  { action: 'posted', label: 'Posted', unit: 'successful posts', polarity: 'up-good' },
  { action: 'post-failed', label: 'Post failures', unit: 'failed post attempts', polarity: 'up-bad' },
  { action: 'discarded', label: 'Discarded', unit: 'statements discarded', polarity: 'up-bad' },
]

function Delta({ current, previous, polarity, periodLabel }: { current: number; previous: number; polarity: Polarity; periodLabel: string }) {
  const d = delta(current, previous)
  if (d.text === null) {
    return <span className="text-muted-foreground">None in the previous {periodLabel}</span>
  }
  const good = polarity === 'neutral' || d.diff === 0 ? null : (d.diff > 0) === (polarity === 'up-good')
  const Icon = d.diff > 0 ? TrendingUpIcon : d.diff < 0 ? TrendingDownIcon : MinusIcon
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex items-center gap-1 font-medium', good === true ? 'text-success' : good === false ? 'text-destructive' : 'text-foreground')}>
        <Icon className="size-3.5" aria-hidden />
        {d.text}
      </span>
      <span className="text-muted-foreground">vs previous {periodLabel}</span>
    </span>
  )
}

/** Band B: what moved during the chosen period, from the audit feed, with the period before it. */
export function ThroughputBand({
  counts,
  from,
  to,
  periodLabel,
}: {
  counts: UseQueryResult<PeriodCounts>
  /** Local `yyyy-MM-dd` days, for the audit trail links. */
  from: string
  to: string
  /** "30 days" */
  periodLabel: string
}) {
  const c = counts.data
  const rate = c ? successRate(c.current.posted, c.current['post-failed']) : null

  return (
    <section aria-labelledby="home-period" className="grid gap-3">
      <h2 id="home-period" className="text-base font-semibold tracking-[-0.01em]">
        Last {periodLabel}
      </h2>
      {counts.isError ? (
        <Card className="px-6">
          <CardError error={counts.error} onRetry={() => void counts.refetch()} />
        </Card>
      ) : (
        <Card
          className={cn(
            'grid gap-0 overflow-hidden py-0 sm:grid-cols-2 lg:grid-cols-4 transition-opacity duration-150',
            counts.isPlaceholderData && 'opacity-60',
          )}
          aria-busy={counts.isFetching}
        >
          {CELLS.map((cell, i) => (
            <Link
              key={cell.action}
              to={auditHref(cell.action, from, to)}
              aria-label={c ? `${c.current[cell.action]} ${cell.unit} in the last ${periodLabel}. Open in the audit trail.` : undefined}
              className={cn(
                'grid content-start gap-1 p-5 outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/40',
                // One rule between neighbours at every width: a column (phone), 2 × 2, then one row.
                i > 0 && 'border-t',
                i === 1 && 'sm:border-t-0 sm:border-l',
                i === 3 && 'sm:border-l',
                i >= 2 && 'lg:border-t-0',
                i === 2 && 'lg:border-l',
              )}
            >
              <span className="text-sm text-muted-foreground">{cell.label}</span>
              {c ? (
                <>
                  <span className="text-3xl leading-tight font-semibold tracking-[-0.02em]">{c.current[cell.action].toLocaleString('en-US')}</span>
                  <span className="text-xs">
                    <Delta current={c.current[cell.action]} previous={c.previous[cell.action]} polarity={cell.polarity} periodLabel={periodLabel} />
                  </span>
                  {cell.action === 'post-failed' && rate !== null && (
                    <span className="text-xs text-muted-foreground">{rate}% of post attempts succeeded</span>
                  )}
                </>
              ) : (
                <span role="status" aria-label="Loading" className="grid gap-2 pt-1">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-32" />
                </span>
              )}
            </Link>
          ))}
        </Card>
      )}
    </section>
  )
}
