import { lazy, Suspense, useMemo, useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { RotateCwIcon } from 'lucide-react'
import { format } from 'date-fns'
import { useAuditEvents } from '@/api/queries/audit'
import { useAuditCounts, useAuditTrend, useSummaryCounts, useSummaryFigures, useSummaryTrend, type SummaryParams } from '@/api/queries/home'
import { requestKeys, STATS_POLL_MS, useRequestsList, useStats } from '@/api/queries/requests'
import { hasScope, useSession } from '@/auth/useSession'
import { formatDate, useUrlFilters } from '@/components/filters'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { paramsFor } from '@/features/statements/list/statusTabs'
import { CardSkeleton } from './CardState'
import { DEFAULT_PERIOD, firstName, greeting, PERIOD_VALUES, periodRange } from './homeMetrics'
import { PostedFigures } from './PostedFigures'
import { QueueBand } from './QueueBand'
import { RecentActivity } from './RecentActivity'
import { StatusBreakdown } from './StatusBreakdown'
import { ThroughputBand } from './ThroughputBand'
import { WaitingCard } from './WaitingCard'

// The charts library is only needed for this one card: load it after the page's figures are on screen.
const FlowChart = lazy(() => import('./FlowChart').then((m) => ({ default: m.FlowChart })))

// Module level: useUrlFilters memoises on the spec's identity.
const VIEW_SPEC = { period: { kind: 'enum', values: PERIOD_VALUES } } as const

/** The server's largest page: the queue's oldest 100 are enough for its ages and its oldest five. */
const QUEUE_PAGE_SIZE = 100
const RECENT_COUNT = 8
/** The browser's IANA zone, so the summary's day buckets are the accountant's days. */
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function HomePage() {
  const { me } = useSession()
  const isAdmin = hasScope(me, 'users:manage')
  const qc = useQueryClient()
  const view = useUrlFilters(VIEW_SPEC)
  const period = view.values.period ?? DEFAULT_PERIOD
  const days = Number(period)
  const periodLabel = `${days} days`

  // "Now" moves on Refresh only, so query keys and relative times stay put between renders.
  const [now, setNow] = useState(() => new Date())
  const range = useMemo(() => periodRange(days, now), [days, now])
  const current = useMemo(() => ({ from: range.from.toISOString(), to: range.to.toISOString() }), [range])
  const previous = useMemo(() => ({ from: range.prevFrom.toISOString(), to: range.prevTo.toISOString() }), [range])

  const stats = useStats({ refetchInterval: STATS_POLL_MS })
  const queue = useRequestsList({ status: paramsFor('review', isAdmin).status, sort: 'received', pageSize: QUEUE_PAGE_SIZE })
  // R-11 first: one call for the period band, the chart and the posted figures. The summary's `to` is exclusive, so
  // the previous period ends exactly where this one starts. Only a 404 (an older API) falls back to the audit feed.
  const summaryParams = useMemo<SummaryParams>(
    () => ({ current, previous: { from: previous.from, to: current.from }, bucket: days > 31 ? 'week' : 'day', tz: TIME_ZONE }),
    [current, previous, days],
  )
  const summaryCounts = useSummaryCounts(summaryParams)
  const summaryTrend = useSummaryTrend(summaryParams)
  const figures = useSummaryFigures(summaryParams)
  const olderApi = summaryCounts.isSuccess && summaryCounts.data === null
  const auditCounts = useAuditCounts(current, previous, { enabled: olderApi })
  const auditTrend = useAuditTrend(current, { enabled: olderApi })
  const counts = olderApi ? auditCounts : summaryCounts
  const trend = olderApi ? auditTrend : summaryTrend
  const recent = useAuditEvents({ pageSize: RECENT_COUNT })

  const fetching = useIsFetching({ queryKey: requestKeys.all }) + useIsFetching({ queryKey: ['audit'] }) > 0
  const refresh = () => {
    setNow(new Date())
    void qc.invalidateQueries({ queryKey: requestKeys.all })
    void qc.invalidateQueries({ queryKey: ['audit'] })
  }

  const name = firstName(me?.displayName ?? '')

  return (
    <div className="page">
      <PageHeader
        title={name ? `${greeting(now)}, ${name}` : greeting(now)}
        description={
          <>
            What's waiting for you, and how the last {periodLabel} went.
            {stats.dataUpdatedAt > 0 && (
              <span className="whitespace-nowrap"> Counts updated {format(stats.dataUpdatedAt, 'HH:mm')}.</span>
            )}
          </>
        }
        actions={
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={period}
              aria-label="Period"
              onValueChange={(v) => v && view.set({ period: v === DEFAULT_PERIOD ? undefined : (v as typeof period) })}
            >
              {PERIOD_VALUES.map((p) => (
                <ToggleGroupItem key={p} value={p} className="px-3">
                  {p} days
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="Refresh" onClick={refresh}>
                  <RotateCwIcon className={cn(fetching && 'animate-spin')} aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </>
        }
      />

      <QueueBand stats={stats} queue={queue} isAdmin={isAdmin} now={now} />

      <ThroughputBand counts={counts} from={formatDate(range.from)} to={formatDate(range.to)} periodLabel={periodLabel} />
      <PostedFigures figures={figures} periodLabel={periodLabel} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Suspense
          fallback={
            <Card className="lg:col-span-2">
              <CardContent>
                <CardSkeleton lines={8} className="h-80 content-center" />
              </CardContent>
            </Card>
          }
        >
          <FlowChart trend={trend} range={range} periodLabel={periodLabel} />
        </Suspense>
        <StatusBreakdown stats={stats} isAdmin={isAdmin} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <WaitingCard queue={queue} now={now} />
        <RecentActivity events={recent} now={now} />
      </div>
    </div>
  )
}
