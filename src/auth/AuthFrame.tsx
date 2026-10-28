import type { ReactNode } from 'react'
import { BrandMark } from '@/components/BrandMark'

/** The signed-out frame: the mark, a heading, one line of context, and the form on a single card. */
export function AuthFrame({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-[400px] animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
        <div className="mb-6 flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">QbAutopost</span>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-[0_1px_2px_rgb(22_32_28/0.04),0_8px_24px_-12px_rgb(22_32_28/0.12)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  )
}
