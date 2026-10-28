import type { ReactNode } from 'react'
import { CheckCircle2Icon, CircleHelpIcon, CircleSlashIcon, Loader2Icon, SplitIcon, type LucideIcon } from 'lucide-react'
import type { RequestDetail } from '@/api/schema'
import { Timestamp } from '@/components/Timestamp'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Tone = 'info' | 'success' | 'warning' | 'muted'

const ICON: Record<Tone, LucideIcon> = {
  info: Loader2Icon,
  success: CheckCircle2Icon,
  warning: CircleHelpIcon,
  muted: CircleSlashIcon,
}

function Banner({ tone, icon, children }: { tone: Tone; icon?: LucideIcon; children: ReactNode }) {
  const Icon = icon ?? ICON[tone]
  return (
    <Alert role="status" aria-label="Request status" variant={tone}>
      <Icon aria-hidden className={tone === 'info' ? 'animate-spin' : undefined} />
      <AlertDescription className="text-current">
        <p>{children}</p>
      </AlertDescription>
    </Alert>
  )
}

function PostId({ id }: { id: string | null }) {
  return id ? (
    <>
      {' '}
      Post ID: <span className="font-mono text-[0.92em]">{id}</span>
    </>
  ) : null
}

/** The banner for any status that blocks work. `pending` has none. */
export function StatusBanner({ request }: { request: RequestDetail }) {
  switch (request.status) {
    case 'posting':
      // The detail carries no attempt starter; the last touch on a posting request is the Post press.
      return (
        <Banner tone="info">
          Posting… started by {request.updated.by.name} at <Timestamp utc={request.updated.utc} />
        </Banner>
      )
    case 'posted':
      return (
        <Banner tone="success">
          Posted. Locked.
          <PostId id={request.postId} />
        </Banner>
      )
    case 'unknown':
      return (
        <Banner tone="warning">
          QuickBooks may have posted this. Check QuickBooks before resolving.
          <PostId id={request.postId} />
        </Banner>
      )
    case 'partial':
      return (
        <Banner tone="warning" icon={SplitIcon}>
          Some rows posted, some didn't.
          <PostId id={request.postId} />
        </Banner>
      )
    case 'discarded':
      return <Banner tone="muted">Discarded: {request.discardReason ?? 'no reason recorded'}</Banner>
    default:
      return null
  }
}
