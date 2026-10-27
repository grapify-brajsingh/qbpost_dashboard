import type { ReactNode } from 'react'
import type { RequestDetail } from '@/api/schema'
import { Timestamp } from '@/components/Timestamp'
import { cn } from '@/lib/utils'

const TONE = {
  info: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100',
  success: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  muted: 'border-border bg-muted text-muted-foreground',
}

function Banner({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <div role="status" aria-label="Request status" className={cn('rounded-md border p-3 text-sm', TONE[tone])}>
      {children}
    </div>
  )
}

function PostId({ id }: { id: string | null }) {
  return id ? (
    <>
      {' '}
      Post ID: <span className="font-mono">{id}</span>
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
        <Banner tone="warning">
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
