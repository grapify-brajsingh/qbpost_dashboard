import { TXN_KINDS, type Finding, type Txn } from '@/api/schema'
import type { TxField } from '@/features/requests/transactions/columns'
import type { Draft } from '@/features/requests/transactions/draft'
import { isValidReference, REFERENCE_RULE } from '@/lib/reference'

/** The API's `missing-field` rule: a row without these cannot be posted, so the upload cannot be saved without them. */
export const REQUIRED_FIELDS = ['kind', 'date', 'amount', 'account'] as const satisfies readonly TxField[]
/** Shown as empty but not blocking: validation after saving reports them as it does for emailed statements. */
export const RECOMMENDED_FIELDS = ['payee', 'lineAccount'] as const satisfies readonly TxField[]

export interface EmptyRow {
  required: TxField[]
  recommended: TxField[]
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/** Rows the user is keeping, keyed by display index (loaded rows first, then added ones), as `TxTable` numbers them. */
function keptRows(d: Draft): [number, Txn][] {
  const loaded = d.rows.map((row, i): [number, Txn] => [i, row]).filter(([i]) => !d.deleted.has(i))
  return [...loaded, ...d.added.map((row, k): [number, Txn] => [d.rows.length + k, row])]
}

/** Empty fields per kept row; rows with none are left out. */
export function emptyFields(d: Draft): Map<number, EmptyRow> {
  const out = new Map<number, EmptyRow>()
  for (const [index, row] of keptRows(d)) {
    const required = REQUIRED_FIELDS.filter((f) => isEmpty(row[f]))
    const recommended = RECOMMENDED_FIELDS.filter((f) => isEmpty(row[f]))
    if (required.length || recommended.length) out.set(index, { required, recommended })
  }
  return out
}

/** One finding per empty field, so `TxTable` marks the cell itself (reason `empty-<field>`). */
export function emptyFindings(empty: Map<number, EmptyRow>): Map<number, Finding[]> {
  const out = new Map<number, Finding[]>()
  for (const [index, e] of empty) {
    out.set(index, [
      ...e.required.map((f) => ({ index, reason: `empty-${f}`, detail: 'Empty' })),
      ...e.recommended.map((f) => ({ index, reason: `empty-${f}`, detail: 'Empty (optional)' })),
    ])
  }
  return out
}

export const requiredCount = (empty: Map<number, EmptyRow>) => [...empty.values()].reduce((n, e) => n + e.required.length, 0)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Values the API could not read (spec §4.7): a date that is not yyyy-MM-dd, an amount that is not a number, a kind
 * outside `TxnKind`. The model's date is copied as given (R-13.4), so a misread date must not reach the database
 * unseen. Shaped like `readErrorCells` so `TxTable` marks the cells; empty values are left to `emptyFields`.
 */
export function badValues(d: Draft): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>()
  for (const [index, row] of keptRows(d)) {
    const bad = new Set<string>()
    if (!isEmpty(row.date) && !(typeof row.date === 'string' && DATE_RE.test(row.date))) bad.add('date')
    if (!isEmpty(row.amount) && !(typeof row.amount === 'number' && Number.isFinite(row.amount))) bad.add('amount')
    if (!isEmpty(row.kind) && !(TXN_KINDS as readonly unknown[]).includes(row.kind)) bad.add('kind')
    if (bad.size) out.set(index, bad)
  }
  return out
}

/** Why Save statement is disabled, or null when it can be pressed. */
export function saveBlocker(d: Draft, reference: string, saving: boolean): string | null {
  if (saving) return 'Saving…'
  const n = requiredCount(emptyFields(d))
  if (n > 0) return `Fill in ${n} empty required ${n === 1 ? 'field' : 'fields'}`
  const unreadable = [...badValues(d).values()].reduce((sum, s) => sum + s.size, 0)
  if (unreadable > 0) return `Fix ${unreadable} ${unreadable === 1 ? 'value' : 'values'} that could not be read`
  if (reference.trim() === '') return 'Enter a reference'
  if (!isValidReference(reference.trim())) return REFERENCE_RULE
  if (keptRows(d).length === 0) return 'Add at least one row'
  return null
}
