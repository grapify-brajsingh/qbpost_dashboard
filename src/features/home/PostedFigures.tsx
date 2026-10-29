import type { UseQueryResult } from '@tanstack/react-query'
import type { PostedFiguresData } from '@/api/queries/home'
import { Card } from '@/components/ui/card'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { formatMinutes } from './homeMetrics'

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

/**
 * Posted value and time to post (spec §11), straight from `GET /dashboard/summary`. Shown only when the API has the
 * summary; an older API leaves Home without this row. A failure is already shown by the period band above, which reads
 * the same call, so this row simply stays away.
 */
export function PostedFigures({ figures, periodLabel }: { figures: UseQueryResult<PostedFiguresData | null>; periodLabel: string }) {
  const f = figures.data
  if (!f) return null
  const { posted, timeToPost } = f

  return (
    <Card
      className={cn('grid gap-0 overflow-hidden py-0 sm:grid-cols-2 transition-opacity duration-150', figures.isPlaceholderData && 'opacity-60')}
      aria-busy={figures.isFetching}
    >
      <div className="grid content-start gap-1 p-5" data-testid="posted-value">
        <span className="text-sm text-muted-foreground">Posted value</span>
        <span className="text-3xl leading-tight font-semibold tracking-[-0.02em] tabular-nums">{formatMoney(posted.amount)}</span>
        <span className="text-xs text-muted-foreground">
          {plural(posted.rows, 'row')} sent to QuickBooks
          {posted.previousAmount !== null && ` · ${formatMoney(posted.previousAmount)} in the previous ${periodLabel}`}
        </span>
      </div>
      <div className="grid content-start gap-1 border-t p-5 sm:border-t-0 sm:border-l" data-testid="time-to-post">
        <span className="text-sm text-muted-foreground">Time to post</span>
        {timeToPost ? (
          <>
            <span className="text-3xl leading-tight font-semibold tracking-[-0.02em]">{formatMinutes(timeToPost.medianMinutes)}</span>
            <span className="text-xs text-muted-foreground">
              Median from arrival to posted · 90% within {formatMinutes(timeToPost.p90Minutes)} ·{' '}
              {plural(timeToPost.statements, 'statement')}
            </span>
          </>
        ) : (
          <span className="pt-1 text-sm text-muted-foreground">No statements posted in this period</span>
        )}
      </div>
    </Card>
  )
}
