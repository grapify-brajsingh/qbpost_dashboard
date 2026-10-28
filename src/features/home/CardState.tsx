import { RotateCwIcon } from 'lucide-react'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** A card whose query failed: the problem, and a way to ask again. The rest of the page keeps working. */
export function CardError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="grid gap-3">
      <ProblemAlert error={error} />
      <Button variant="outline" size="sm" className="justify-self-start" onClick={onRetry}>
        <RotateCwIcon aria-hidden />
        Try again
      </Button>
    </div>
  )
}

/** Placeholder lines while a card's first load runs. */
export function CardSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('grid gap-3', className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i % 3 === 0 ? 'w-2/3' : i % 3 === 1 ? 'w-full' : 'w-1/2')} />
      ))}
    </div>
  )
}
