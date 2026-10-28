import { useState } from 'react'
import { CheckIcon, MinusIcon, PencilIcon, TriangleAlertIcon } from 'lucide-react'
import { formatCents, formatMoney, toCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { PostStats } from '@/features/requests/transactions/draft'
import { parseAmount, type ParseResult } from '@/features/requests/transactions/cells/parse'
import { TextCell } from '@/features/requests/transactions/cells/TextCell'
import { cellText } from '@/features/requests/transactions/columns'

interface Props {
  /** Sum of every non-deleted row, including don't-post rows, in cents. */
  allCents: number
  controlTotal: unknown
  postStats: PostStats
  /** Present when the user may edit the control total. Only the user's typing changes it, never the sum. */
  onControlTotal?: (v: number | null) => void
  /** The saved control total, present while the draft's differs from it. */
  was?: { value: unknown }
}

const asText = (v: unknown) => (typeof v === 'number' ? String(v) : cellText(v))
const shownTotal = (v: unknown) => (typeof v === 'number' ? formatMoney(v) : cellText(v) || 'empty')
/** Same rules as an amount cell; an empty field removes the control total. */
const parseTotal = (t: string): ParseResult => (t.trim() === '' ? { value: null } : parseAmount(t))

/** Sum of all rows against the control total. Never filtered; the control total is shown, never changed. */
export function ReconciliationMeter({ allCents, controlTotal, postStats, onControlTotal, was }: Props) {
  const [editing, setEditing] = useState(false)
  const ct = typeof controlTotal === 'number' && Number.isFinite(controlTotal) ? toCents(controlTotal) : null
  const diff = ct === null ? null : allCents - ct
  const width = ct === null || ct <= 0 ? 0 : Math.max(0, Math.min(100, (allCents / ct) * 100))
  const skipped = postStats.skipped > 0 ? ` (${postStats.skipped} marked don't post, ${formatCents(postStats.skippedCents)})` : ''

  let label: string
  if (diff === null) label = 'No control total'
  else if (diff === 0) label = 'Matches to the cent'
  else if (diff < 0) label = `Short by ${formatCents(-diff)}`
  else label = `Over by ${formatCents(diff)}`

  const tone = diff === 0 ? 'ok' : 'out'
  const DeltaIcon = diff === 0 ? CheckIcon : diff === null ? MinusIcon : TriangleAlertIcon

  return (
    <section
      aria-label="Reconciliation"
      className="grid items-center gap-x-8 gap-y-4 rounded-lg border bg-card px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      {/* The footing: the figure everything else is measured against. */}
      <div className="text-[13px] text-muted-foreground">
        Sum of all rows
        <div data-testid="meter-sum" className="mt-0.5 text-[28px] leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums">
          {formatCents(allCents)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            data-testid="meter-bar"
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out-soft motion-reduce:transition-none',
              tone === 'ok' ? 'bg-success' : 'bg-primary',
            )}
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>{`${postStats.posting} of ${postStats.total} rows will post${skipped}`}</span>
          {onControlTotal ? (
            <span className="flex flex-wrap items-center gap-1">
              Control total
              {editing ? (
                <span className="w-32">
                  <TextCell
                    label="Control total"
                    initial={asText(controlTotal)}
                    align="right"
                    parse={parseTotal}
                    onCommit={(v) => {
                      setEditing(false)
                      // Opening the editor and clicking away must not write anything: unchanged text, or null vs missing, is no edit.
                      if (asText(v) !== asText(controlTotal)) onControlTotal(v as number | null)
                    }}
                    onCancel={() => setEditing(false)}
                  />
                </span>
              ) : (
                <button
                  type="button"
                  aria-label="Edit control total"
                  data-testid="control-total"
                  data-dirty={was ? 'true' : undefined}
                  className={cn(
                    'group/ct inline-flex items-center gap-1 rounded-md border border-dashed border-input px-1.5 py-0.5 font-medium text-foreground tabular-nums transition-colors outline-none hover:border-primary/50 hover:bg-primary-soft focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    was && 'border-solid border-primary/40 bg-primary-soft',
                  )}
                  onClick={() => setEditing(true)}
                >
                  {ct === null ? 'none' : formatCents(ct)}
                  <PencilIcon aria-hidden className="size-3 text-muted-foreground transition-colors group-hover/ct:text-primary" />
                </button>
              )}
              {was && <span className="text-[11px] text-primary">was {shownTotal(was.value)}</span>}
              <span className="-ml-1">, never changed by the app</span>
            </span>
          ) : (
            <span>{ct === null ? 'No control total' : `Control total ${formatCents(ct)}, never changed by the app`}</span>
          )}
        </div>
      </div>
      {/* The result, ruled off twice the way a bookkeeper closes a column. */}
      <div
        data-testid="meter-delta"
        className={cn(
          'rule-double flex items-center gap-2 justify-self-start rounded-md px-3 py-2 text-sm font-semibold tabular-nums transition-colors duration-300 md:justify-self-end',
          diff === 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
        )}
        style={{ borderTopColor: 'currentColor' }}
      >
        <DeltaIcon aria-hidden className="size-4 shrink-0" />
        {label}
      </div>
    </section>
  )
}
