import { Link } from 'react-router'
import { useAuditEvents } from '@/api/queries/audit'
import type { AuditEvent } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Skeleton } from '@/components/ui/skeleton'
import { auditSentence } from '@/features/audit/auditSentence'
import { ValueDiff } from '@/features/audit/ValueDiff'

function Entry({ e }: { e: AuditEvent }) {
  return (
    <li className="relative ml-1 border-l pb-5 pl-5 last:border-transparent last:pb-0">
      <span aria-hidden className="absolute top-1 -left-[5px] size-2.5 rounded-full bg-primary ring-4 ring-background" />
      <p className="text-sm">
        <span className="font-medium">{e.actor.name}</span> · {auditSentence(e)}
      </p>
      {(e.old != null || e.new != null) && (
        <p className="mt-1 text-sm">
          <ValueDiff old={e.old} new={e.new} />
        </p>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">
        <Timestamp utc={e.atUtc} />
      </p>
    </li>
  )
}

/** This statement's audit entries, newest first. */
export function HistoryTimeline({ requestId }: { requestId: number }) {
  const q = useAuditEvents({ requestId, pageSize: 100 })
  if (q.isPending) return <Skeleton className="h-24" />
  if (q.data === undefined) return <ProblemAlert error={q.error} />
  const events = [...q.data.items].sort((a, b) => b.atUtc.localeCompare(a.atUtc))
  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ul aria-label="History">
          {events.map((e) => (
            <Entry key={e.id} e={e} />
          ))}
        </ul>
      )}
      <Link className="inline-block text-sm font-medium text-primary underline-offset-2 hover:underline" to={`/audit?requestId=${requestId}`}>
        Open in Audit trail
      </Link>
    </div>
  )
}
