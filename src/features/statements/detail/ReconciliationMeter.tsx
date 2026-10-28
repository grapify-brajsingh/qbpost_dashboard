import { useState } from 'react'
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

  return (
    <section
      aria-label="Reconciliation"
      className="grid items-center gap-5 rounded-[10px] border bg-card px-[18px] py-4 md:grid-cols-[auto_1fr_auto]"
    >
      <div className="text-xs text-muted-foreground">
        Sum of all rows
        <div data-testid="meter-sum" className="text-[22px] font-semibold tracking-tight text-foreground tabular-nums">
          {formatCents(allCents)}
        </div>
      </div>
      <div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            data-testid="meter-bar"
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-cyan-400 transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="mt-[7px] flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground tabular-nums">
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
                    'group/ct rounded px-1 font-medium text-foreground tabular-nums hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring',
                    was && 'bg-primary/10',
                  )}
                  onClick={() => setEditing(true)}
                >
                  {ct === null ? 'none' : formatCents(ct)}
                  <span aria-hidden className="ml-1 opacity-0 group-hover/ct:opacity-100">
                    ✎
                  </span>
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
      <div
        data-testid="meter-delta"
        className={cn(
          'rounded-lg px-2.5 py-1.5 text-[13px] font-semibold tabular-nums',
          diff === 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
        )}
      >
        {label}
      </div>
    </section>
  )
}
