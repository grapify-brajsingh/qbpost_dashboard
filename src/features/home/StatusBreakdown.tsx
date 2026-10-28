import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { RequestStatus, Stats } from '@/api/schema'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CardError, CardSkeleton } from './CardState'
import { statusHref } from './homeMetrics'

/** Workflow order: waiting, in flight, needs a decision, done. */
const ORDER: RequestStatus[] = ['pending', 'posting', 'partial', 'unknown', 'posted', 'discarded']

/** The meter repeats the badge's tone; the badge's word carries the meaning. */
const FILL: Record<RequestStatus, string> = {
  pending: 'bg-muted-foreground/55',
  posting: 'bg-info',
  partial: 'bg-warning',
  unknown: 'bg-warning',
  posted: 'bg-success',
  discarded: 'bg-muted-foreground/30',
}

/** C2: every statement by status, now. A labelled meter per status rather than a donut: the counts are far apart. */
export function StatusBreakdown({ stats, isAdmin }: { stats: UseQueryResult<Stats>; isAdmin: boolean }) {
  const by = stats.data?.byStatus
  const max = by ? Math.max(1, ...ORDER.map((s) => by[s])) : 1
  const total = by ? ORDER.reduce((n, s) => n + by[s], 0) : 0

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>All statements</CardTitle>
        <CardDescription>Where every statement stands now.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {stats.isError ? (
          <CardError error={stats.error} onRetry={() => void stats.refetch()} />
        ) : !by ? (
          <CardSkeleton lines={6} />
        ) : (
          <ul className="-mx-2 grid gap-0.5">
            {ORDER.map((s) => (
              <li key={s}>
                <Link
                  to={statusHref(s, isAdmin)}
                  aria-label={`${by[s]} ${s}`}
                  className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-2 outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <StatusBadge status={s} />
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn('block h-full rounded-full', FILL[s])}
                      style={{ width: by[s] === 0 ? 0 : `max(${(by[s] / max) * 100}%, 4px)` }}
                    />
                  </span>
                  <span className={cn('num text-right text-sm font-medium', by[s] === 0 && 'text-muted-foreground')}>{by[s]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {by && (
        <CardFooter className="border-t text-sm text-muted-foreground">
          <span>
            <span className="num font-medium text-foreground">{total.toLocaleString('en-US')}</span> statements in all
          </span>
        </CardFooter>
      )}
    </Card>
  )
}
