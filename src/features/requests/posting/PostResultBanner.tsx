import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import type { PostOutcome } from './outcome'

const TONE = {
  success: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  info: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100',
  error: 'border-destructive/50 bg-destructive/10',
}

const TONE_OF: Record<PostOutcome['kind'], keyof typeof TONE> = {
  posted: 'success',
  partial: 'warning',
  unknown: 'warning',
  busy: 'warning',
  stale: 'warning',
  conflict: 'info',
  timeout: 'info',
  duplicate: 'info',
  failed: 'error',
  held: 'error',
  refused: 'error',
  unavailable: 'error',
  error: 'error',
}

/** The outcome of the last post, shown in place above the tabs. All text is rendered as React text. */
export function PostResultBanner({ outcome, requestId }: { outcome: PostOutcome; requestId: string }) {
  const o = outcome
  const rows = o.findings?.length ?? 0
  return (
    <div role="status" aria-label="Post result" className={cn('space-y-1 rounded-md border p-3 text-sm', TONE[TONE_OF[o.kind]])}>
      <p className="font-medium">{o.title}</p>
      {o.detail && <p>{o.detail}</p>}
      {o.postId && (
        <p>
          Post ID: <span className="font-mono">{o.postId}</span>
        </p>
      )}
      {o.errors && o.errors.length > 0 && (
        <ul className="list-disc pl-5">
          {o.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {(o.kind === 'held' || o.kind === 'partial') && rows > 0 && (
        <p>
          {rows} {rows === 1 ? 'row is' : 'rows are'} held. They are marked in the table below.
        </p>
      )}
      {o.kind === 'conflict' && o.attemptId !== undefined && (
        <Link className="underline" to={`/requests/${requestId}?tab=attempts`}>
          See their attempt
        </Link>
      )}
    </div>
  )
}
