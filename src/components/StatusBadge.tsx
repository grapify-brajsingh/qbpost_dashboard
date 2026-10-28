import { CheckCircle2Icon, CircleDashedIcon, CircleHelpIcon, CircleSlashIcon, Loader2Icon, SplitIcon, type LucideIcon } from 'lucide-react'
import type { RequestStatus } from '@/api/schema'
import { Badge } from '@/components/ui/badge'

type Tone = 'muted' | 'info' | 'success' | 'warning' | 'danger'

const STYLES: Record<RequestStatus, { label: string; tone: Tone; icon: LucideIcon; spin?: boolean }> = {
  pending: { label: 'Pending', tone: 'muted', icon: CircleDashedIcon },
  posting: { label: 'Posting', tone: 'info', icon: Loader2Icon, spin: true },
  posted: { label: 'Posted', tone: 'success', icon: CheckCircle2Icon },
  partial: { label: 'Partial', tone: 'warning', icon: SplitIcon },
  unknown: { label: 'Unknown', tone: 'warning', icon: CircleHelpIcon },
  discarded: { label: 'Discarded', tone: 'muted', icon: CircleSlashIcon },
}

/** A statement's status: icon and word, so the colour is never the only signal. */
export function StatusBadge({ status }: { status: RequestStatus }) {
  const s = STYLES[status]
  const Icon = s.icon
  return (
    <Badge variant={s.tone}>
      <Icon aria-hidden className={s.spin ? 'animate-spin' : undefined} />
      {s.label}
    </Badge>
  )
}
