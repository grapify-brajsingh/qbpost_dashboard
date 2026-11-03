import { useMemo } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { ActivityIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { Trend } from '@/api/queries/home'
import { TREND_MAX_PAGES, TREND_PAGE_SIZE } from '@/api/queries/home'
import { EmptyState } from '@/components/DataPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { prefersReducedMotion } from '@/lib/motion'
import { CardError, CardSkeleton } from './CardState'
import { auditHref, bucketEvents, bucketSeries, trendSummary, type FlowBucket, type PeriodRange } from './homeMetrics'

const config = {
  received: { label: 'Received', color: 'var(--chart-1)' },
  posted: { label: 'Posted', color: 'var(--chart-2)' },
} satisfies ChartConfig

type Series = keyof typeof config

/**
 * C1: received against posted, per day (or week), from the summary's series (R-11) or, on an older API, the audit
 * feed. A column opens those events in the audit trail.
 */
export function FlowChart({ trend, range, periodLabel }: { trend: UseQueryResult<Trend | null>; range: PeriodRange; periodLabel: string }) {
  const navigate = useNavigate()
  const data = trend.data
  const buckets = useMemo(
    () => (!data ? [] : data.series ? bucketSeries(data.series, range) : bucketEvents(data.events, range)),
    [data, range],
  )
  const weekly = range.days > 31
  const empty = buckets.every((b) => b.received === 0 && b.posted === 0)
  const animate = !prefersReducedMotion()

  const open = (series: Series) => (bar: { payload?: unknown }) => {
    const b = bar.payload as FlowBucket | undefined
    if (b) void navigate(auditHref(series, b.from, b.to))
  }

  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader>
        <CardTitle>Statement flow</CardTitle>
        <CardDescription>
          Statements received from n8n and posted to QuickBooks, per {weekly ? 'week' : 'day'}. Select a column to see those
          entries in the audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {trend.isError ? (
          <CardError error={trend.error} onRetry={() => void trend.refetch()} />
        ) : !trend.data ? (
          <CardSkeleton lines={6} className="h-64 content-center" />
        ) : empty ? (
          <EmptyState icon={ActivityIcon} title={`Nothing was received or posted in the last ${periodLabel}.`} description="Try a longer period." />
        ) : (
          <figure className={cn('m-0 grid gap-2 transition-opacity duration-150', trend.isPlaceholderData && 'opacity-60')}>
            <ChartContainer config={config} className="aspect-auto h-64 w-full">
              <BarChart data={buckets} barGap={2} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                <ChartTooltip
                  cursor={{ fillOpacity: 0.6 }}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => (payload?.[0]?.payload as FlowBucket | undefined)?.tooltipLabel ?? ''}
                    />
                  }
                />
                {/* Series order, not alphabetical: received, then posted. */}
                <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
                {(Object.keys(config) as Series[]).map((s) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    fill={`var(--color-${s})`}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                    isAnimationActive={animate}
                    className="cursor-pointer"
                    onClick={open(s)}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <figcaption className="sr-only">{trendSummary(buckets, `last ${periodLabel}`)}</figcaption>
            <table className="sr-only">
              <caption>Statements received and posted per {weekly ? 'week' : 'day'}</caption>
              <thead>
                <tr>
                  <th scope="col">{weekly ? 'Week' : 'Day'}</th>
                  <th scope="col">Received</th>
                  <th scope="col">Posted</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.from}>
                    <th scope="row">{b.tooltipLabel}</th>
                    <td>{b.received}</td>
                    <td>{b.posted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
        )}
        {trend.data?.truncated && (
          <p className="text-xs text-muted-foreground">
            Showing the latest {(TREND_MAX_PAGES * TREND_PAGE_SIZE).toLocaleString('en-US')} entries; earlier{' '}
            {weekly ? 'weeks' : 'days'} may be undercounted. The totals above are exact.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
