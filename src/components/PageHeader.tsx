import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The title row every page opens with: the h1, an optional line under it, and the page's own actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  aside,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Buttons for the page's main jobs; they wrap under the title on narrow screens. */
  actions?: ReactNode
  /** Sits right after the title (for example the new-arrivals pill). */
  aside?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.015em] break-words">{title}</h1>
          {aside}
        </div>
        {description && <p className="max-w-[70ch] text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
