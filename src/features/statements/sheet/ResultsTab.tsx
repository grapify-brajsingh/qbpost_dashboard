import { useState } from 'react'
import { useAuditEvents } from '@/api/queries/audit'
import { useAttempt, useAttempts, useRequest } from '@/api/queries/requests'
import type { RequestDetail, Txn } from '@/api/schema'
import { Money } from '@/components/Money'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AttemptList } from '@/features/requests/attempts/AttemptsTab'
import { postedRows } from '@/features/requests/attempts/postedRows'
import { formatCents, sumCents, toCents } from '@/lib/money'

const FIRST = 10

const STATE_TEXT: Record<RequestDetail['validation']['state'], string> = {
  ok: 'No problems',
  held: 'Held: problems to fix',
  refused: 'Refused by the checks',
  unreadable: 'Could not read the statement',
  unavailable: 'Validation unavailable',
}

/** The validation snapshot has no actor: take it from the newest `validated` audit event, if there is one. */
function useValidatedBy(requestId: number): string | null {
  const q = useAuditEvents({ requestId, action: ['validated'], pageSize: 1 })
  return q.data?.items[0]?.actor.name ?? null
}

function ValidationBlock({ d }: { d: RequestDetail }) {
  const validatedBy = useValidatedBy(d.id)
  const v = d.validation
  const findings = v.validation ?? []
  const errors = v.errors ?? []
  const ok = v.state === 'ok'
  const rows = Array.isArray(d.payload.transactions) ? (d.payload.transactions as Txn[]) : []
  // Every row counts, including the ones switched off.
  const sum = sumCents(rows.map((r) => r?.amount))
  const control = typeof d.payload.controlTotal === 'number' ? d.payload.controlTotal : null
  const matches = control !== null && toCents(control) === sum
  return (
    <section aria-label="Latest validation" className="space-y-2">
      <h3 className="text-sm font-semibold">Latest validation</h3>
      <div role="status" className={`rounded-md p-3 text-sm ${ok ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive'}`}>
        <p className="font-medium">{STATE_TEXT[v.state]}</p>
        {v.validatedUtc ? (
          <p className="text-xs">
            Validated <Timestamp utc={v.validatedUtc} />
            {validatedBy ? ` by ${validatedBy}` : ''}
            {v.versionNumber !== undefined ? ` against version ${v.versionNumber}` : ''}
          </p>
        ) : (
          <p className="text-xs">Not checked yet</p>
        )}
        {v.versionNumber !== undefined && v.versionNumber < d.currentVersion && (
          <p className="text-xs font-medium">Validation is out of date</p>
        )}
      </div>
      {(findings.length > 0 || errors.length > 0) && (
        <ul aria-label="Problems" className="list-disc space-y-1 pl-5 text-sm">
          {findings.map((f, i) => (
            <li key={i}>
              Row {f.index + 1}
              {f.externalId ? ` (${f.externalId})` : ''}: {f.reason}
              {f.detail ? ` — ${f.detail}` : ''}
            </li>
          ))}
          {errors.map((e, i) => (
            <li key={`e${i}`}>{e}</li>
          ))}
        </ul>
      )}
      <p className={`text-sm ${control === null || matches ? '' : 'text-destructive'}`}>
        {control === null
          ? `Rows add up to ${formatCents(sum)}. No control total on this statement.`
          : matches
            ? `Rows add up to ${formatCents(sum)}, matching the control total.`
            : `Rows add up to ${formatCents(sum)}; the control total is ${formatCents(toCents(control))}.`}
      </p>
    </section>
  )
}

function TxnIdTable({ requestId, attemptId }: { requestId: string; attemptId: number }) {
  const q = useAttempt(requestId, attemptId)
  const [all, setAll] = useState(false)
  if (q.isPending) return <Skeleton className="h-20" />
  if (q.data === undefined) return <ProblemAlert error={q.error} />
  const rows = postedRows(q.data.result)
  if (rows.length === 0) return null
  const shown = all ? rows : rows.slice(0, FIRST)
  return (
    <div className="space-y-2">
      <Table aria-label="Row to TxnID">
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>External ID</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>TxnID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={`${r.index}-${r.txnId}`}>
              <TableCell>{r.index + 1}</TableCell>
              <TableCell>{r.externalId ?? '—'}</TableCell>
              <TableCell>
                <Money value={typeof r.amount === 'number' ? r.amount : null} />
              </TableCell>
              <TableCell className="font-mono text-xs">{r.txnId}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > FIRST && !all && (
        <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)}>
          Show all {rows.length}
        </Button>
      )}
    </div>
  )
}

function PostedBlock({ d }: { d: RequestDetail }) {
  const attempts = useAttempts(String(d.id))
  const s = d.postSummary
  if (!s) return null
  const posted = attempts.data?.filter((a) => a.outcome === 'posted').sort((a, b) => b.id - a.id)[0]
  const counts = d.ledgerBatch?.counts
  return (
    <section aria-label="Posted" className="space-y-2">
      <h3 className="text-sm font-semibold">Posted</h3>
      <p className="rounded-md bg-success-soft p-3 text-sm text-success">
        Posted by {s.postedBy.name} at <Timestamp utc={s.postedUtc} />: {s.postedCount} {s.postedCount === 1 ? 'row' : 'rows'}
        {counts
          ? ` (${Object.entries(counts)
              .map(([k, n]) => `${k} ${n}`)
              .join(', ')})`
          : ''}
        {d.ledgerBatch ? <span className="block text-xs">Ledger batch {d.ledgerBatch.postId}</span> : null}
      </p>
      {posted && <TxnIdTable requestId={String(d.id)} attemptId={posted.id} />}
    </section>
  )
}

export function ResultsTab({ requestId }: { requestId: number }) {
  const q = useRequest(String(requestId))
  if (q.isPending) return <Skeleton className="h-32" />
  if (q.data === undefined) return <ProblemAlert error={q.error} />
  const d = q.data.request
  return (
    <div className="space-y-5">
      {d.postSummary && <PostedBlock d={d} />}
      <ValidationBlock d={d} />
      <section aria-label="Post attempts" className="space-y-2">
        <h3 className="text-sm font-semibold">Post attempts</h3>
        <AttemptList requestId={String(requestId)} />
      </section>
    </div>
  )
}
