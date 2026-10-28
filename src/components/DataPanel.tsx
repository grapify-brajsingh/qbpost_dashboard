import type { ComponentType, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** The bordered surface a table or list sits on. Scrolls sideways on its own so the page never does. */
export function DataPanel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-w-0 overflow-hidden rounded-lg border bg-card', className)}>{children}</div>
}

/** What a list shows when it has nothing: what happened, and the one thing to do next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-14 text-center animate-in fade-in-0 duration-300">
      {Icon && (
        <span className="mb-1 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-[48ch] text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Placeholder rows while a table's first page loads; the same height as real rows so nothing jumps. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid items-center gap-4 px-4 py-3.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-3/4' : c % 2 ? 'w-1/2' : 'w-2/3')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** "Page 2 of 5 · 112 total" with Previous and Next, under a server-paged list. */
export function Pager({
  page,
  shown = page,
  pages,
  total,
  onPage,
}: {
  /** The page asked for in the URL; Previous and Next step from it. */
  page: number
  /** The page the server says it returned, for the label. */
  shown?: number
  pages: number
  total: number
  onPage: (n: number) => void
}) {
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span className="text-muted-foreground tabular-nums">
        Page {shown} of {pages} · {total} total
      </span>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}
