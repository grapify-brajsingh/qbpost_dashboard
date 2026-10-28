import type { UseQueryResult } from '@tanstack/react-query'
import { InboxIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { Page, RequestSummary } from '@/api/schema'
import { EmptyState } from '@/components/DataPanel'
import { FlagChips } from '@/components/FlagChips'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatRelative, formatTimestamp } from '@/lib/dates'
import { CardError, CardSkeleton } from './CardState'
import { ageBuckets, receivedAt, type AgeBucket } from './homeMetrics'

const OLDEST_SHOWN = 5

function bucketHref(b: AgeBucket): string {
  const qs = new URLSearchParams()
  if (b.receivedFrom) qs.set('receivedFrom', b.receivedFrom)
  qs.set('receivedTo', b.receivedTo)
  return `/statements?${qs.toString()}`
}

function AgeBars({ buckets }: { buckets: AgeBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <ul aria-label="Statements waiting, by age" className="grid gap-1">
      {buckets.map((b) => (
        <li key={b.label}>
          <Link
            to={bucketHref(b)}
            aria-label={`${b.count} waiting ${b.label === 'Today' ? 'since today' : b.label}`}
            className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span className="text-muted-foreground">{b.label}</span>
            <span className="flex items-center gap-2">
              <span
                className="h-3 rounded-r-[4px] bg-chart-1"
                style={{ width: b.count === 0 ? 0 : `max(calc(${(b.count / max) * 100}% - 2.5rem), 4px)` }}
              />
              <span className="num font-medium">{b.count}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** D1: how long the to-review queue has been waiting, and its oldest statements. */
export function WaitingCard({ queue, now }: { queue: UseQueryResult<Page<RequestSummary>>; now: Date }) {
  const page = queue.data
  const items = page?.items ?? []
  const partial = page !== undefined && page.total > items.length

  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader>
        <CardTitle>Waiting for review</CardTitle>
        <CardDescription>
          How long the statements in the queue have waited since their email arrived.
          {partial && ` Based on the ${items.length} oldest of ${page.total}.`}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/statements">Open the queue</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        {queue.isError ? (
          <CardError error={queue.error} onRetry={() => void queue.refetch()} />
        ) : !page ? (
          <CardSkeleton lines={7} />
        ) : items.length === 0 ? (
          <EmptyState icon={InboxIcon} title="All clear. Nothing waiting." description="New statements appear here as soon as n8n saves them." />
        ) : (
          <>
            <AgeBars buckets={ageBuckets(items, now)} />
            <div className="-mx-6 border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Statement</TableHead>
                    <TableHead>Waiting</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Rows</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Control total</TableHead>
                    <TableHead className="hidden pr-6 sm:table-cell">Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.slice(0, OLDEST_SHOWN).map((r) => {
                    const title = r.email?.subject ?? r.reference ?? '—'
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-0 pl-6 sm:max-w-[22rem]">
                          <Link
                            to={`/statements/${r.id}`}
                            className="grid rounded-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
                          >
                            <span className="truncate font-medium" title={title}>
                              {title}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">{r.publicRef}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <time dateTime={receivedAt(r)} title={formatTimestamp(receivedAt(r))}>
                            {formatRelative(receivedAt(r), now)}
                          </time>
                        </TableCell>
                        <TableCell className="hidden text-right md:table-cell">{r.transactionCount}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Money value={r.controlTotal} />
                        </TableCell>
                        <TableCell className="hidden pr-6 sm:table-cell">
                          <FlagChips request={r} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
