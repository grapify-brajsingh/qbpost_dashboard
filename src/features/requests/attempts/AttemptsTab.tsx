import { useState } from 'react'
import { useAttempt, useAttempts } from '@/api/queries/requests'
import type { Attempt, Finding } from '@/api/schema'
import { Money } from '@/components/Money'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isObj, postedRows } from './postedRows'

function findings(result: unknown): Finding[] {
  if (!isObj(result) || !Array.isArray(result.validation)) return []
  return result.validation.filter((f): f is Finding => isObj(f) && typeof f.reason === 'string')
}

function problemText(result: unknown): { title: string; detail: string | null } | null {
  if (!isObj(result) || typeof result.title !== 'string') return null
  return { title: result.title, detail: typeof result.detail === 'string' ? result.detail : null }
}

function AttemptDetail({ requestId, attempt }: { requestId: string; attempt: Attempt }) {
  const q = useAttempt(requestId, attempt.id)
  if (q.isPending) return <Skeleton className="h-16" />
  if (q.data === undefined) return <ProblemAlert error={q.error} />
  const a = q.data
  const rows = postedRows(a.result)
  const held = findings(a.result)
  const problem = problemText(a.result)
  return (
    <div className="space-y-3 text-sm">
      {rows.length > 0 && (
        <Table aria-label={`Posted rows for attempt ${a.id}`}>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>TxnID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.index}-${r.txnId}`}>
                <TableCell>{r.index + 1}</TableCell>
                <TableCell>{r.externalId ?? '—'}</TableCell>
                <TableCell>{r.kind}</TableCell>
                <TableCell>{r.account}</TableCell>
                <TableCell>
                  <Money value={typeof r.amount === 'number' ? r.amount : null} />
                </TableCell>
                <TableCell className="font-mono text-xs">{r.txnId}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {held.length > 0 && (
        <ul aria-label={`Findings for attempt ${a.id}`} className="list-disc space-y-1 pl-5">
          {held.map((f, i) => (
            <li key={i}>
              Row {f.index + 1}
              {f.externalId ? ` (${f.externalId})` : ''}: {f.reason}
              {f.detail ? ` — ${f.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <div>
          <p className="font-medium">{problem.title}</p>
          {problem.detail && <p>{problem.detail}</p>}
        </div>
      )}
      {!problem && a.error && <p>{a.error}</p>}
      {a.resolvedBy && (
        <p>
          Resolved by {a.resolvedBy.name}
          {a.resolvedUtc && (
            <>
              {' '}
              at <Timestamp utc={a.resolvedUtc} />
            </>
          )}
          {a.resolutionNote ? `: ${a.resolutionNote}` : ''}
        </p>
      )}
    </div>
  )
}

function AttemptRow({ requestId, attempt: a }: { requestId: string; attempt: Attempt }) {
  const [open, setOpen] = useState(false)
  const counts = a.counts ? Object.entries(a.counts).map(([k, v]) => `${k} ${v}`).join(', ') : null
  return (
    <li className="rounded-md border">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Attempt ${a.id}`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md p-3 text-left text-sm transition-colors duration-150 outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className="font-medium">#{a.id}</span>
        <Badge variant="outline">{a.outcome}</Badge>
        {a.httpStatus !== null && <span>HTTP {a.httpStatus}</span>}
        <span>v{a.versionNumber}</span>
        <span>{a.startedBy.name}</span>
        <span>
          <Timestamp utc={a.startedUtc} />
          {a.finishedUtc && (
            <>
              {' → '}
              <Timestamp utc={a.finishedUtc} />
            </>
          )}
        </span>
        {counts && <span className="text-muted-foreground">{counts}</span>}
      </button>
      {open && (
        <div className="border-t p-3">
          <AttemptDetail requestId={requestId} attempt={a} />
        </div>
      )}
    </li>
  )
}

/** The attempt list body (newest first), shared by the v1 tab and the statement sheet. */
export function AttemptList({ requestId }: { requestId: string }) {
  const q = useAttempts(requestId)
  if (q.isPending) return <Skeleton className="h-24" />
  if (q.data === undefined) return <ProblemAlert error={q.error} />
  if (q.data.length === 0) return <p className="text-sm text-muted-foreground">No post attempts yet.</p>
  return (
    <ul aria-label="Attempts" className="space-y-2">
      {[...q.data]
        .sort((a, b) => b.startedUtc.localeCompare(a.startedUtc) || b.id - a.id)
        .map((a) => (
          <AttemptRow key={a.id} requestId={requestId} attempt={a} />
        ))}
    </ul>
  )
}

export function AttemptsTab({ requestId }: { requestId: string }) {
  return <AttemptList requestId={requestId} />
}
