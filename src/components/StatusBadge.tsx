import type { RequestStatus } from '@/api/schema'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STYLES: Record<RequestStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-secondary text-secondary-foreground' },
  posting: { label: 'Posting', className: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200' },
  posted: { label: 'Posted', className: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200' },
  partial: { label: 'Partial', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  unknown: { label: 'Unknown', className: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200' },
  discarded: { label: 'Discarded', className: 'bg-muted text-muted-foreground line-through' },
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const s = STYLES[status]
  return <Badge className={cn(s.className)}>{s.label}</Badge>
}
