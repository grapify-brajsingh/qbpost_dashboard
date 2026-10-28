import type { KeyboardEvent } from 'react'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CheckIcon, MinusIcon, TriangleAlertIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import type { RequestSummary } from '@/api/schema'
import { Money } from '@/components/Money'
import { PushId } from '@/components/PushId'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusDot } from '@/components/StatusDot'
import { Timestamp } from '@/components/Timestamp'
import { Badge } from '@/components/ui/badge'
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

function validationTone(r: RequestSummary): 'success' | 'danger' | 'muted' {
  if (r.status === 'posted' && r.postSummary) return 'success'
  const v = r.validationSummary
  if (v.problemCount > 0 || v.state === 'unreadable' || v.state === 'refused' || v.state === 'held') return 'danger'
  return v.state === 'ok' ? 'success' : 'muted'
}

const VALIDATION_ICON = { success: CheckIcon, danger: TriangleAlertIcon, muted: MinusIcon } as const

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
        className={cn(
          'group/sort -mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
          active && 'text-foreground',
        )}
        onClick={() => onSort(nextSort(sort, sortKey))}
      >
        {label}
        {active ? (
          <Icon className="size-3.5" aria-hidden />
        ) : (
          <ArrowUpDownIcon className="size-3.5 opacity-0 transition-opacity group-hover/sort:opacity-50" aria-hidden />
        )}
      </button>
    </TableHead>
  )
}

function ValidationBadge({ r }: { r: RequestSummary }) {
  const tone = validationTone(r)
  const Icon = VALIDATION_ICON[tone]
  return (
    <Badge variant={tone}>
      <Icon aria-hidden />
      {validationLabel(r)}
    </Badge>
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
    <Table className="min-w-[920px]">
      <TableHeader className="bg-muted/40">
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
            className="group/row cursor-pointer outline-none focus-visible:bg-accent focus-visible:shadow-[inset_2px_0_0_var(--primary)]"
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
            <TableCell className="w-full max-w-0 min-w-56">
              <Link
                className="block truncate font-medium underline-offset-4 group-hover/row:text-primary hover:underline"
                to={`/statements/${r.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                {r.email?.subject ?? '—'}
              </Link>
              <span className="block truncate text-xs text-muted-foreground">{r.email?.from ?? '—'}</span>
            </TableCell>
            <TableCell>
              <span className="block text-[13px]">{r.reference ?? '—'}</span>
              <span onClick={(e) => e.stopPropagation()}>
                <PushId value={r.pushId} fallback={r.publicRef} />
              </span>
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">{r.transactionCount}</TableCell>
            <TableCell className="font-medium">
              <Money value={r.controlTotal} />
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
            <TableCell>
              <ValidationBadge r={r} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
              <div className="inline-flex gap-0.5">
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onOpenSheet(r.id, 'history')}>
                  History <span className="tabular-nums">{r.historyCount}</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onOpenSheet(r.id, 'results')}>
                  Results
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
