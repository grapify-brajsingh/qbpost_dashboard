import { useState } from 'react'
import { formatCents, formatMoney, parseAmountInput, toCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { cellText } from './columns'

interface Props {
  sumCents: number
  controlTotal: unknown
  /** Present when the control total can be edited. Only the user's typing changes it, never the sum. */
  onControlTotal?: (v: number | null) => void
  changed?: boolean
}

const asText = (v: unknown) => (typeof v === 'number' ? String(v) : cellText(v))

/** Sum of rows, control total and their difference (red unless zero). Live as amounts change. */
export function TotalsBar({ sumCents, controlTotal, onControlTotal, changed }: Props) {
  const [shown, setShown] = useState(controlTotal)
  const [text, setText] = useState(asText(controlTotal))
  const [error, setError] = useState<string | null>(null)
  if (!Object.is(shown, controlTotal)) {
    // The draft changed underneath (save, discard, reload): show the new value.
    setShown(controlTotal)
    setText(asText(controlTotal))
    setError(null)
  }

  const ct = typeof controlTotal === 'number' && Number.isFinite(controlTotal) ? toCents(controlTotal) : null
  const diff = ct === null ? null : sumCents - ct

  function commit() {
    if (!onControlTotal || text === asText(controlTotal)) return
    if (text.trim() === '') {
      onControlTotal(null)
      return
    }
    const n = parseAmountInput(text)
    if (n === null) setError(/\.\d{3,}\s*$/.test(text) ? 'Up to 2 decimals' : 'Enter an amount like 1234.56')
    else onControlTotal(n)
  }

  return (
    <section
      aria-label="Totals"
      className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-x-8 gap-y-2 rounded-md border bg-background px-4 py-2 text-sm"
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Sum of rows</span>
        <span data-testid="rows-sum" className="font-medium tabular-nums">
          {formatCents(sumCents)}
        </span>
      </div>
      <div className="relative flex items-center gap-2">
        <label htmlFor="control-total" className="text-muted-foreground">
          Control total
        </label>
        {onControlTotal ? (
          <input
            id="control-total"
            aria-invalid={error !== null}
            className={cn(
              'h-8 w-32 rounded border bg-background px-2 text-right tabular-nums focus-visible:ring-2 focus-visible:ring-ring',
              changed && 'bg-amber-100 dark:bg-amber-950',
              error && 'border-destructive',
            )}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              else if (e.key === 'Escape') {
                setText(asText(controlTotal))
                setError(null)
              }
            }}
          />
        ) : (
          <span id="control-total" className="font-medium tabular-nums">
            {typeof controlTotal === 'number' ? formatMoney(controlTotal) : asText(controlTotal) || '—'}
          </span>
        )}
        {error && (
          <span role="alert" className="absolute top-full right-0 mt-0.5 text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Difference</span>
        <span data-testid="difference" className={cn('font-medium tabular-nums', diff !== null && diff !== 0 && 'text-destructive')}>
          {diff === null ? '—' : formatCents(diff)}
        </span>
      </div>
    </section>
  )
}
