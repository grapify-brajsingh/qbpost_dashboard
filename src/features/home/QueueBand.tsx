import type { ComponentType } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { CheckIcon, ChevronRightIcon, CopyIcon, Loader2Icon, SplitIcon, TriangleAlertIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { Page, RequestSummary, Stats } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { countFor } from '@/features/statements/list/statusTabs'
import { CardError } from './CardState'
import { receivedAt } from './homeMetrics'

type Tone = 'danger' | 'warning' | 'info'

const TONE: Record<Tone, string> = {
  danger: 'bg-destructive-soft text-destructive',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
}

interface QueueRow {
  label: string
  /** What the number means, read with it by screen readers. */
  noun: (n: number) => string
  hint: string
  value: number
  to: string
  tone: Tone
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}

function rowsFor(stats: Stats, isAdmin: boolean): QueueRow[] {
  const s = (n: number) => (n === 1 ? 'statement' : 'statements')
  return [
    {
      label: 'Has errors',
      noun: (n) => `${n} ${s(n)} with errors`,
      hint: 'Validation found problems to fix before posting',
      value: stats.hasErrors.pending,
      to: '/statements?tab=errors',
      tone: 'danger',
      icon: TriangleAlertIcon,
    },
    {
      label: 'Possible duplicates',
      noun: (n) => `${n} possible ${n === 1 ? 'duplicate' : 'duplicates'}`,
      hint: 'Pushed before, or matching another statement',
      value: stats.duplicate.pending,
      to: '/statements?duplicate=true',
      tone: 'warning',
      icon: CopyIcon,
    },
    isAdmin
      ? {
          label: 'Needs a decision',
          noun: (n) => `${n} ${s(n)} need a decision`,
          hint: 'Partial or unknown posts only an admin can resolve',
          value: stats.byStatus.partial + stats.byStatus.unknown,
          to: '/statements',
          tone: 'warning',
          icon: SplitIcon,
        }
      : {
          label: 'Posting now',
          noun: (n) => `${n} ${s(n)} posting now`,
          hint: 'Being sent to QuickBooks',
          value: stats.byStatus.posting,
          to: '/statements?tab=all',
          tone: 'info',
          icon: Loader2Icon,
        },
  ]
}

function Row({ row }: { row: QueueRow }) {
  const on = row.value > 0
  const Icon = on ? row.icon : CheckIcon
  return (
    <li>
      <Link
        to={row.to}
        aria-label={row.noun(row.value)}
        className="group flex items-center gap-3 rounded-md px-3 py-3 outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', on ? TONE[row.tone] : 'bg-muted text-muted-foreground')}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{row.label}</span>
          <span className="block text-xs text-muted-foreground">{on ? row.hint : 'None right now'}</span>
        </span>
        <span className={cn('num text-xl font-semibold', !on && 'text-muted-foreground')}>{row.value}</span>
        <ChevronRightIcon className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  )
}

/** Band A: the live queue. Current state, whatever period is chosen. */
export function QueueBand({
  stats,
  queue,
  isAdmin,
  now,
}: {
  stats: UseQueryResult<Stats>
  queue: UseQueryResult<Page<RequestSummary>>
  isAdmin: boolean
  now: Date
}) {
  const toReview = stats.data ? countFor('review', stats.data, isAdmin) : null
  const oldest = queue.data?.items[0]

  return (
    <section aria-labelledby="home-now">
      <h2 id="home-now" className="sr-only">
        Right now
      </h2>
      <Card className="gap-0 overflow-hidden py-0 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex flex-col justify-between gap-6 p-6 md:border-r">
          {stats.isError ? (
            <CardError error={stats.error} onRetry={() => void stats.refetch()} />
          ) : toReview === null ? (
            <div role="status" aria-label="Loading" className="grid gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-14 w-28" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-muted-foreground">To review now</p>
              <p className="mt-2 text-6xl leading-none font-semibold tracking-[-0.03em]" data-testid="to-review">
                {toReview}
              </p>
              <p className="rule-double mt-4 max-w-[34ch] pt-3 text-sm text-muted-foreground">
                {toReview === 0 ? (
                  'All clear. Nothing waiting.'
                ) : (
                  <>
                    {toReview === 1 ? 'Statement' : 'Statements'} waiting for a check against the PDF.
                    {oldest && (
                      <>
                        {' '}
                        The oldest arrived <time dateTime={receivedAt(oldest)}>{formatRelative(receivedAt(oldest), now)}</time>.
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
          )}
          <Button asChild className="justify-self-start self-start">
            <Link to="/statements">Review statements</Link>
          </Button>
        </div>
        <div className="border-t p-3 md:border-t-0">
          {stats.isError ? (
            <p className="p-3 text-sm text-muted-foreground">Counts are unavailable until the statistics load.</p>
          ) : !stats.data ? (
            <div role="status" aria-label="Loading" className="grid gap-5 p-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] divide-y">
              {rowsFor(stats.data, isAdmin).map((r) => (
                <Row key={r.label} row={r} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  )
}
