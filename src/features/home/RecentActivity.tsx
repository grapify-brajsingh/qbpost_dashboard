import type { UseQueryResult } from '@tanstack/react-query'
import { CheckCircle2Icon, CircleIcon, CircleSlashIcon, HistoryIcon, InboxIcon, XCircleIcon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { AuditEvent, Page } from '@/api/schema'
import { EmptyState } from '@/components/DataPanel'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelative, formatTimestamp } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { auditSentence } from '@/features/audit/auditSentence'
import { CardError, CardSkeleton } from './CardState'

const MARK: Partial<Record<string, { icon: LucideIcon; className: string }>> = {
  received: { icon: InboxIcon, className: 'bg-info-soft text-info' },
  posted: { icon: CheckCircle2Icon, className: 'bg-success-soft text-success' },
  'post-failed': { icon: XCircleIcon, className: 'bg-destructive-soft text-destructive' },
  discarded: { icon: CircleSlashIcon, className: 'bg-muted text-muted-foreground' },
}
const PLAIN = { icon: CircleIcon, className: 'bg-muted text-muted-foreground' }

/** D2: the newest audit entries, as sentences. */
export function RecentActivity({ events, now }: { events: UseQueryResult<Page<AuditEvent>>; now: Date }) {
  const items = events.data?.items ?? []
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>The latest entries in the audit trail.</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/audit">Audit trail</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {events.isError ? (
          <CardError error={events.error} onRetry={() => void events.refetch()} />
        ) : !events.data ? (
          <CardSkeleton lines={8} />
        ) : items.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="No activity yet." description="Changes appear here as people work." />
        ) : (
          <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
            {items.map((e) => {
              const mark = MARK[e.action] ?? PLAIN
              const Icon = mark.icon
              return (
                <li key={e.id} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                  <span className={cn('z-10 grid size-7 place-items-center rounded-full ring-4 ring-card', mark.className)}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="break-words">
                      <span className="font-medium">{e.actor.name}</span>{' '}
                      <span className="text-muted-foreground">{auditSentence(e).replace(/^\w/, (c) => c.toLowerCase())}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <time dateTime={e.atUtc} title={formatTimestamp(e.atUtc)}>
                        {formatRelative(e.atUtc, now)}
                      </time>
                      {e.request && (
                        <Link
                          to={`/statements/${e.request.id}`}
                          className="rounded-sm font-mono text-foreground/80 underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
                        >
                          {e.request.publicRef}
                        </Link>
                      )}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
