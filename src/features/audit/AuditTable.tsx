import { Fragment } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router'
import type { AuditAction, AuditEvent } from '@/api/schema'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatTimestamp } from '@/lib/dates'
import { shortPushId } from '@/lib/pushId'
import { cn } from '@/lib/utils'
import { actionLabel, auditSentence } from './auditSentence'
import { groupByDay } from './groupByDay'
import { ValueDiff } from './ValueDiff'

type Tone = 'ok' | 'warn' | 'bad' | 'edit' | 'plain'

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-destructive-soft text-destructive',
  edit: 'bg-primary-soft text-primary',
  plain: 'bg-muted text-muted-foreground',
}

const TONE: Partial<Record<AuditAction, Tone>> = {
  'row-edited': 'edit',
  'control-total-changed': 'edit',
  'row-added': 'ok',
  'row-post-on': 'ok',
  posted: 'ok',
  restored: 'ok',
  resolved: 'ok',
  'row-post-off': 'warn',
  'user-sign-in-failed': 'warn',
  'user-locked-out': 'warn',
  'row-deleted': 'bad',
  'post-failed': 'bad',
  discarded: 'bad',
}

/** Local HH:mm; the day is in the separator row above. */
function timeOf(utc: string): string {
  const d = new Date(utc)
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'HH:mm')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Who({ actor }: { actor: AuditEvent['actor'] }) {
  const isClient = actor.kind === 'api-client'
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar size="sm">
        <AvatarFallback className={cn('text-[10px]', isClient ? 'bg-muted text-muted-foreground' : 'bg-primary-soft text-primary')}>
          {isClient ? 'n8n' : initials(actor.name)}
        </AvatarFallback>
      </Avatar>
      {actor.name}
    </span>
  )
}

function StatementCell({ e }: { e: AuditEvent }) {
  const r = e.request
  if (!r) return <span className="text-muted-foreground">Not a statement</span>
  return (
    <Link className="font-medium text-primary underline-offset-2 hover:underline" to={`/statements/${r.id}`}>
      {r.reference ?? r.publicRef}
      {r.pushId && (
        <code className="num ml-1.5 font-mono text-xs text-muted-foreground" title={r.pushId}>
          {shortPushId(r.pushId)}
        </code>
      )}
    </Link>
  )
}

function RowCell({ e }: { e: AuditEvent }) {
  if (!e.request) return null
  if (!e.row) return <span className="text-muted-foreground">All</span>
  const label = e.row.index != null ? String(e.row.index + 1) : (e.row.externalId ?? '—')
  if (!e.row.externalId) return <span className="num">{label}</span>
  return (
    <Link className="num text-primary hover:underline" to={`/statements/${e.request.id}?row=${encodeURIComponent(e.row.externalId)}`}>
      {label}
    </Link>
  )
}

/** Field edits show old → new; added and deleted rows show the row; everything else its sentence. */
function Change({ e }: { e: AuditEvent }) {
  switch (e.action) {
    case 'row-edited':
    case 'control-total-changed':
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {e.field && <span>{e.field}</span>}
          <ValueDiff old={e.old} new={e.new} />
        </span>
      )
    case 'row-added':
    case 'row-deleted':
      return e.old == null && e.new == null ? <>{auditSentence(e)}</> : <ValueDiff old={e.old} new={e.new} />
    default:
      return <>{auditSentence(e)}</>
  }
}

function ActionBadge({ action }: { action: AuditAction }) {
  return <Badge className={TONE_CLASS[TONE[action] ?? 'plain']}>{actionLabel(action)}</Badge>
}

/** Read-only audit entries grouped by local day. `showStatement` is false where the page is about one statement. */
export function AuditTable({ events, showStatement = true }: { events: readonly AuditEvent[]; showStatement?: boolean }) {
  const groups = groupByDay(events, new Date())
  const cols = showStatement ? 6 : 4
  return (
    <Table aria-label="Audit trail" className="min-w-[760px]">
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Who</TableHead>
          {showStatement && <TableHead>Statement</TableHead>}
          {showStatement && <TableHead>Row</TableHead>}
          <TableHead>Action</TableHead>
          <TableHead>Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => (
          <Fragment key={g.label}>
            <TableRow className="bg-background hover:bg-background">
              <TableCell colSpan={cols} className="py-2 text-xs font-semibold text-foreground/70">
                {g.label}
              </TableCell>
            </TableRow>
            {g.items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  <span title={formatTimestamp(e.atUtc)}>{timeOf(e.atUtc)}</span>
                </TableCell>
                <TableCell>
                  <Who actor={e.actor} />
                </TableCell>
                {showStatement && (
                  <TableCell>
                    <StatementCell e={e} />
                  </TableCell>
                )}
                {showStatement && (
                  <TableCell>
                    <RowCell e={e} />
                  </TableCell>
                )}
                <TableCell>
                  <ActionBadge action={e.action} />
                </TableCell>
                <TableCell className="max-w-md whitespace-normal">
                  <Change e={e} />
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
