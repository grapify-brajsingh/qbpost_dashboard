import { Loader2 } from 'lucide-react'

/** Shown while a post runs (sent from here, or found running when the page opened). */
export function PostingProgress({ rows }: { rows: number }) {
  return (
    <div
      role="status"
      aria-label="Posting progress"
      className="relative overflow-hidden rounded-lg border border-info/30 bg-info-soft p-4 text-sm text-info animate-in fade-in-0 duration-200"
    >
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
        <p className="text-foreground/85">
          Posting {rows} {rows === 1 ? 'row' : 'rows'} to QuickBooks… this can take a few minutes. You can leave this
          page; the post keeps running.
        </p>
      </div>
      {/* An indeterminate sweep: the server gives no row-by-row progress, so this only says "still working". */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-info/15">
        <div className="h-full w-1/3 animate-[posting-sweep_1.6s_ease-in-out_infinite] bg-info motion-reduce:hidden" />
      </div>
    </div>
  )
}
