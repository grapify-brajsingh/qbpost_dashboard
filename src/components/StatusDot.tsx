import { cn } from '@/lib/utils'

export type StatusTone = 'ok' | 'warn' | 'bad' | 'new'

const TONES: Record<StatusTone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-destructive',
  new: 'bg-primary',
}

export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={cn('inline-block size-1.5 shrink-0 rounded-full', TONES[tone], className)}
    />
  )
}
