import { CheckCircle2Icon, CircleAlertIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { friendlyError } from '@/features/statements/detail/validationText'
import type { PostOutcome } from './outcome'

const TONE = {
  success: { variant: 'success', icon: CheckCircle2Icon },
  warning: { variant: 'warning', icon: TriangleAlertIcon },
  info: { variant: 'info', icon: InfoIcon },
  error: { variant: 'destructive', icon: CircleAlertIcon },
} as const

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
export function PostResultBanner({ outcome, requestId, shownAbove = [] }: { outcome: PostOutcome; requestId: string; shownAbove?: string[] }) {
  const o = outcome
  const errors = (o.errors ?? []).filter((e) => !shownAbove.includes(e))
  const rows = o.findings?.length ?? 0
  const tone = TONE[TONE_OF[o.kind]]
  const Icon = tone.icon
  return (
    <Alert role="status" aria-label="Post result" variant={tone.variant}>
      <Icon aria-hidden />
      <AlertDescription className="gap-1.5 text-current">
        <p className="font-medium">{o.title}</p>
        {o.detail && !shownAbove.includes(o.detail) && !o.errors?.includes(o.detail) && <p>{o.detail}</p>}
        {o.postId && (
          <p>
            Post ID: <span className="font-mono text-[0.92em]">{o.postId}</span>
          </p>
        )}
        {errors.length > 0 && (
          <ul className="list-disc pl-5 text-foreground/85">
            {errors.map((e, i) => (
              <li key={i}>{friendlyError(e)}</li>
            ))}
          </ul>
        )}
        {(o.kind === 'held' || o.kind === 'partial' || o.kind === 'failed') && rows > 0 && (
          <div>
            <p>
              {rows} {rows === 1 ? 'row is' : 'rows are'} held. They are marked in the table below.
            </p>
            <ul aria-label="Held rows" className="list-disc pl-5 text-foreground/85">
              {o.findings!.map((f, i) => (
                <li key={i}>
                  Row {f.index + 1}
                  {f.externalId ? ` (${f.externalId})` : ''}: {f.reason}
                  {f.detail ? ` — ${f.detail}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {o.kind === 'conflict' && o.attemptId !== undefined && (
          <Link className="underline" to={`/statements/${requestId}?sheet=${requestId}&sheetTab=results`}>
            See their attempt
          </Link>
        )}
      </AlertDescription>
    </Alert>
  )
}
