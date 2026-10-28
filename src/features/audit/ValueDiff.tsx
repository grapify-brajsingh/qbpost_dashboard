import { cn } from '@/lib/utils'

const MAX = 80

/** Whole rows (objects) on one line: `date · kind · payee · account · amount`; any other object as JSON. */
function show(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object' && !Array.isArray(v)) {
    const r = v as Record<string, unknown>
    const parts = ['date', 'kind', 'payee', 'account', 'amount']
      .map((k) => r[k])
      .filter((x) => x !== undefined && x !== null && x !== '')
      .map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x)))
    if (parts.length > 0) return parts.join(' · ')
  }
  return JSON.stringify(v) ?? ''
}

function Value({ v, tone }: { v: unknown; tone: 'old' | 'new' }) {
  const full = show(v)
  const text = full.length > MAX ? `${full.slice(0, MAX)}…` : full
  return (
    <span
      title={full}
      className={cn(
        'rounded px-1.5 break-all',
        tone === 'old' ? 'bg-destructive-soft text-destructive line-through' : 'bg-success-soft text-success',
      )}
    >
      {text === '' ? '(empty)' : text}
    </span>
  )
}

/**
 * Old value struck through in rose, new value in emerald. Values are untrusted: always rendered as text,
 * cut at 80 characters with the full text in the tooltip. A missing side is left out.
 */
export function ValueDiff({ old, new: next }: { old?: unknown; new?: unknown }) {
  const hasOld = old !== null && old !== undefined
  const hasNew = next !== null && next !== undefined
  if (!hasOld && !hasNew) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {hasOld && <Value v={old} tone="old" />}
      {hasOld && hasNew && <span aria-hidden>→</span>}
      {hasNew && <Value v={next} tone="new" />}
    </span>
  )
}
