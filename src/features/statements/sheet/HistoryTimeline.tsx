import { Link } from 'react-router'
import { useAuditEvents } from '@/api/queries/audit'
import type { AuditEvent } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Skeleton } from '@/components/ui/skeleton'

const MAX = 120

/** Untrusted values: always plain text, long ones cut (the full text stays in the title tooltip). */
function show(v: unknown): string {
  if (v === undefined || v === null) return '—'
  return typeof v === 'string' ? v : (JSON.stringify(v) ?? '—')
}

function Value({ v, tone }: { v: unknown; tone: 'old' | 'new' }) {
  const full = show(v)
  const text = full.length > MAX ? `${full.slice(0, MAX)}…` : full
  return (
    <span title={full} className={tone === 'old' ? 'text-muted-foreground line-through' : 'rounded bg-primary-soft px-1 font-medium'}>
      {text}
    </span>
  )
}

function Entry({ e }: { e: AuditEvent }) {
  const hasChange = e.field !== null || e.old != null || e.new != null
  return (
    <li className="relative border-l pl-4">
      <span aria-hidden className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-primary" />
      <p className="text-sm">
        <span className="font-medium">{e.actor.name}</span> · {e.action}
        {e.row?.externalId ? ` · ${e.row.externalId}` : ''}
      </p>
      {hasChange && (
        <p className="text-sm">
          {e.field !== null && <>{e.field}: </>}
          <Value v={e.old} tone="old" /> → <Value v={e.new} tone="new" />
        </p>
      )}
      <p className="text-xs text-muted-foreground">
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
        <ul aria-label="History" className="space-y-4">
          {events.map((e) => (
            <Entry key={e.id} e={e} />
          ))}
        </ul>
      )}
      <Link className="text-sm text-primary underline" to={`/audit?requestId=${requestId}`}>
        Open in Audit trail
      </Link>
    </div>
  )
}
