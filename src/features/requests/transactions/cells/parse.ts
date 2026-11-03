// How the amount and date editors read what was typed. Shared by the cells and the Add transaction dialog.
import { parseAmountInput } from '@/lib/money'
import { isValidReference, REFERENCE_RULE } from '@/lib/reference'

export type ParseResult = { value: unknown } | { error: string }

/** Amounts are JSON numbers with at most 2 decimals. */
export function parseAmount(text: string): ParseResult {
  const n = parseAmountInput(text)
  if (n !== null) return { value: n }
  return { error: /\.\d{3,}\s*$/.test(text) ? 'Up to 2 decimals' : 'Enter an amount like 1234.56' }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar day as yyyy-MM-dd. */
export function parseDate(text: string): ParseResult {
  const t = text.trim()
  const m = DATE_RE.exec(t)
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    if (d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])) return { value: t }
  }
  return { error: 'Use yyyy-MM-dd' }
}

/** A statement reference, without surrounding spaces. */
export function parseReference(text: string): ParseResult {
  const t = text.trim()
  return isValidReference(t) ? { value: t } : { error: REFERENCE_RULE }
}
