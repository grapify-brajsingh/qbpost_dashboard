import { TriangleAlertIcon } from 'lucide-react'
import type { DuplicateReason, PossibleDuplicate } from '@/api/schema'
import { StatusBadge } from '@/components/StatusBadge'
import { Timestamp } from '@/components/Timestamp'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const REASON_TEXT: Record<DuplicateReason, string> = {
  'same-file': 'same PDF uploaded before',
  'same-reference': 'same reference',
  'overlapping-rows': 'some rows match',
  'same-payload': 'identical rows',
}

/** R-13.9: a warning, never a block. Links open in a new tab so the draft on screen is kept. */
export function DuplicateWarning({ items }: { items: PossibleDuplicate[] }) {
  if (items.length === 0) return null
  return (
    <Alert variant="warning">
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>This may already be in the dashboard</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1.5">
          {items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={`/statements/${d.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
                {d.publicRef}
              </a>
              {d.reference && <span className="break-all">{d.reference}</span>}
              <StatusBadge status={d.status} />
              {d.receivedUtc && <Timestamp utc={d.receivedUtc} />}
              <span className="text-muted-foreground">
                {d.source === 'upload' ? 'uploaded' : d.source === 'email' ? 'from email' : 'saved'} ·{' '}
                {d.reasons.map((r) => REASON_TEXT[r] ?? r).join(', ')}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2">You can still save it.</p>
      </AlertDescription>
    </Alert>
  )
}
