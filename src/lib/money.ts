export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function sumCents(amounts: unknown[]): number {
  let total = 0
  for (const a of amounts) {
    if (typeof a === 'number' && Number.isFinite(a)) total += toCents(a)
  }
  return total
}

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  return fmt.format(amount)
}

export function formatCents(cents: number): string {
  return fmt.format(cents / 100)
}

const AMOUNT_RE = /^-?(\d+|\d{1,3}(,\d{3})+)?(\.\d{0,2})?$/

export function parseAmountInput(text: string): number | null {
  const t = text.trim()
  if (!/\d/.test(t) || !AMOUNT_RE.test(t)) return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
