import type { KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { RequestSummary } from '@/api/schema'
import { FlagChips } from '@/components/FlagChips'
import { Money } from '@/components/Money'
import { StatusBadge } from '@/components/StatusBadge'
import { Timestamp } from '@/components/Timestamp'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function RequestsTable({ items }: { items: RequestSummary[] }) {
  const navigate = useNavigate()
  const open = (id: number) => void navigate(`/requests/${id}`)
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, id: number) => {
    // A focused link inside the row handles its own Enter.
    if (e.key === 'Enter' && e.target === e.currentTarget) open(id)
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ref</TableHead>
          <TableHead>Email subject</TableHead>
          <TableHead>Received</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">Rows</TableHead>
          <TableHead className="text-right">Control total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Flags</TableHead>
          <TableHead>Last attempt</TableHead>
          <TableHead>Updated</TableHead>
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
            <TableCell className="font-mono">
              <Link className="underline-offset-4 hover:underline" to={`/requests/${r.id}`} onClick={(e) => e.stopPropagation()}>
                {r.publicRef}
              </Link>
            </TableCell>
            <TableCell className="max-w-80 truncate">{r.email?.subject ?? '—'}</TableCell>
            <TableCell>{r.email?.receivedUtc ? <Timestamp utc={r.email.receivedUtc} /> : '—'}</TableCell>
            <TableCell>{r.reference ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{r.transactionCount}</TableCell>
            <TableCell>
              <Money value={r.controlTotal} />
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
            <TableCell>
              <FlagChips request={r} />
            </TableCell>
            <TableCell>{r.lastAttempt?.outcome ?? '—'}</TableCell>
            <TableCell>
              <Timestamp utc={r.updated.utc} />
              <span className="block text-xs text-muted-foreground">{r.updated.by.name}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
