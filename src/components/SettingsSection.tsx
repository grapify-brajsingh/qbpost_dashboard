import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * One block of a settings-style page: what it is about on the left, the fields on the right.
 * Stacks on narrow screens. Labelled by its heading, so it reads as a region.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={cn('grid gap-x-10 gap-y-4 border-t py-7 first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]', className)}
    >
      <div className="space-y-1">
        <h2 id={id} className="text-[15px] font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
