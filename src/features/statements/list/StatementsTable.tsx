import type { KeyboardEvent } from 'react'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import type { RequestSummary } from '@/api/schema'
import { Money } from '@/components/Money'
import { PushId } from '@/components/PushId'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusDot } from '@/components/StatusDot'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { nextSort, type SortKey, type SortValue } from './statusTabs'

export type SheetTab = 'history' | 'results'

function validationLabel(r: RequestSummary): string {
  if (r.status === 'posted' && r.postSummary) return `${r.postSummary.postedCount} TxnIDs`
  const v = r.validationSummary
  if (v.problemCount > 0) return `${v.problemCount} ${v.problemCount === 1 ? 'problem' : 'problems'}`
  switch (v.state) {
    case 'ok':
      return 'No problems'
    case 'unreadable':
      return 'Unreadable'
    case 'refused':
    case 'held':
      return 'Held'
    default:
      return 'Not checked'
  }
}

function validationClass(r: RequestSummary): string {
  if (r.status === 'posted' && r.postSummary) return 'bg-success-soft text-success'
  const v = r.validationSummary
  if (v.problemCount > 0 || v.state === 'unreadable' || v.state === 'refused' || v.state === 'held')
    return 'bg-destructive/10 text-destructive'
  return v.state === 'ok' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  sort: SortValue
  onSort: (next: SortValue) => void
  className?: string
}) {
  const active = sort === sortKey || sort === `-${sortKey}`
  const Icon = sort === sortKey ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead className={className} aria-sort={active ? (sort === sortKey ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={cn('inline-flex items-center gap-1 font-medium', active && 'text-foreground')}
        onClick={() => onSort(nextSort(sort, sortKey))}
      >
        {label}
        {active && <Icon className="size-3.5" aria-hidden />}
      </button>
    </TableHead>
  )
}

export function StatementsTable({
  items,
  sort,
  onSort,
  lastSeen,
  onOpenSheet,
}: {
  items: RequestSummary[]
  sort: SortValue
  onSort: (next: SortValue) => void
  /** ISO time the user last left this page; rows received after it get the new dot. */
  lastSeen: string | null
  onOpenSheet: (id: number, tab: SheetTab) => void
}) {
  const navigate = useNavigate()
  const open = (id: number) => void navigate(`/statements/${id}`)
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, id: number) => {
    // A focused link or button inside the row handles its own Enter.
    if (e.key === 'Enter' && e.target === e.currentTarget) open(id)
  }
  const isNew = (r: RequestSummary) => {
    const at = r.email?.receivedUtc ? Date.parse(r.email.receivedUtc) : NaN
    return lastSeen !== null && !Number.isNaN(at) && at > Date.parse(lastSeen)
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHead label="Received" sortKey="received" sort={sort} onSort={onSort} />
          <TableHead>Email</TableHead>
          <TableHead>Reference</TableHead>
          <SortHead label="Rows" sortKey="rows" sort={sort} onSort={onSort} className="text-right" />
          <SortHead label="Total" sortKey="total" sort={sort} onSort={onSort} className="text-right" />
          <TableHead>Status</TableHead>
          <TableHead>Validation</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((r) => (
          <TableRow
            key={r.id}
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => open(r.id)}
            onKeyDown={(e) => onKeyDown(e, r.id)}
          >
            <TableCell className="whitespace-nowrap tabular-nums">
              {isNew(r) && (
                <>
                  <StatusDot tone="new" className="mr-1.5 align-middle" />
                  <span className="sr-only">New</span>
                </>
              )}
              {r.email?.receivedUtc ? <Timestamp utc={r.email.receivedUtc} /> : '—'}
            </TableCell>
            <TableCell className="max-w-72">
              <Link
                className="block truncate underline-offset-4 hover:underline"
                to={`/statements/${r.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                {r.email?.subject ?? '—'}
              </Link>
              <span className="block truncate text-xs text-muted-foreground">{r.email?.from ?? '—'}</span>
            </TableCell>
            <TableCell>
              <span className="block">{r.reference ?? '—'}</span>
              <span onClick={(e) => e.stopPropagation()}>
                <PushId value={r.pushId} fallback={r.publicRef} />
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.transactionCount}</TableCell>
            <TableCell>
              <Money value={r.controlTotal} />
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
            <TableCell>
              <span className={cn('rounded-full px-2 py-0.5 text-xs', validationClass(r))}>{validationLabel(r)}</span>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenSheet(r.id, 'history')}>
                History {r.historyCount}
              </Button>{' '}
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenSheet(r.id, 'results')}>
                Results
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
