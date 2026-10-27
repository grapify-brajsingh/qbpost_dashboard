import { Loader2 } from 'lucide-react'

/** Shown while a post runs (sent from here, or found running when the page opened). */
export function PostingProgress({ rows }: { rows: number }) {
  return (
    <div
      role="status"
      aria-label="Posting progress"
      className="flex items-center gap-3 rounded-md border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
    >
      <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
      <p>
        Posting {rows} {rows === 1 ? 'row' : 'rows'} to QuickBooks… this can take a few minutes. You can leave this
        page; the post keeps running.
      </p>
    </div>
  )
}
