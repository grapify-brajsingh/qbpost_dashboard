import {
  CheckCircle2,
  CircleHelp,
  Copy,
  FilePlus2,
  Flag,
  Pencil,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useEvents } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Skeleton } from '@/components/ui/skeleton'
import { Timestamp } from '@/components/Timestamp'
import { eventSentence } from './eventSentence'

const ICONS: Record<string, LucideIcon> = {
  created: FilePlus2,
  'flagged-duplicate': Copy,
  edited: Pencil,
  validated: ShieldCheck,
  'post-started': PlayCircle,
  'post-finished': Flag,
  discarded: Trash2,
  restored: RotateCcw,
  resolved: CheckCircle2,
}

export function HistoryTab({ requestId }: { requestId: string }) {
  const q = useEvents(requestId)
  if (q.isPending) return <Skeleton className="h-24" />
  if (q.data === undefined) return <ProblemAlert error={q.error} />
  if (q.data.length === 0) return <p className="text-sm text-muted-foreground">No history yet.</p>
  return (
    <ol aria-label="History" className="space-y-3">
      {q.data.map((e) => {
        const Icon = ICONS[e.kind] ?? CircleHelp
        return (
          <li key={e.id} className="flex items-start gap-3 text-sm">
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p>{eventSentence(e)}</p>
              <p className="text-xs text-muted-foreground">
                {e.actor.name} · <Timestamp utc={e.atUtc} />
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
