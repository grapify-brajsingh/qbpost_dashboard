// Unsaved edits to a payload. Pure and immutable: every function returns a new Draft and never touches its input.
// The saved payload is the loaded one with only the edited cells changed, so fields the dashboard does not know
// (on rows and at the top level) survive a save untouched.
import type { Payload, Txn } from '@/api/schema'
import { sumCents } from '@/lib/money'

export interface Draft {
  base: Payload
  /** The loaded rows with edits applied; index = original payload index. Unedited rows are the original objects. */
  rows: Txn[]
  /** Original indexes marked for deletion. */
  deleted: Set<number>
  /** New rows, keyed `n0`, `n1`, … */
  added: Txn[]
  top: { controlTotal: unknown }
  /** `"<rowKey>:<field>"` for every cell whose value differs from the loaded one. */
  dirtyCells: Set<string>
}

const baseRows = (p: Payload): Txn[] => (Array.isArray(p.transactions) ? (p.transactions as Txn[]) : [])

export function createDraft(payload: Payload): Draft {
  return {
    base: payload,
    rows: baseRows(payload),
    deleted: new Set(),
    added: [],
    top: { controlTotal: payload.controlTotal },
    dirtyCells: new Set(),
  }
}

/** An empty text value is the same as a missing field. */
const same = (a: unknown, b: unknown) => Object.is(a, b) || ((a === undefined || a === '') && (b === undefined || b === ''))

export const isAddedKey = (rowKey: string) => rowKey.startsWith('n')

export function setCell(d: Draft, rowKey: string, field: keyof Txn, value: unknown): Draft {
  const added = isAddedKey(rowKey)
  const i = Number(added ? rowKey.slice(1) : rowKey)
  const list = added ? d.added : d.rows
  const current = list[i]
  if (current === undefined) return d
  const original: Txn = added ? {} : baseRows(d.base)[i]
  const key = `${rowKey}:${String(field)}`
  const next: Txn = { ...current }
  const dirtyCells = new Set(d.dirtyCells)
  if (same(original[field], value)) {
    if (field in original) next[field] = original[field]
    else delete next[field]
    dirtyCells.delete(key)
  } else {
    next[field] = value
    dirtyCells.add(key)
  }
  const copy = [...list]
  copy[i] = next
  return added ? { ...d, added: copy, dirtyCells } : { ...d, rows: copy, dirtyCells }
}

export function addRow(d: Draft): Draft {
  return { ...d, added: [...d.added, {}] }
}

/** Marks or unmarks a loaded row for deletion. An added row is removed outright (later added rows move up). */
export function toggleDeleteRow(d: Draft, rowKey: string): Draft {
  if (isAddedKey(rowKey)) {
    const k = Number(rowKey.slice(1))
    if (k >= d.added.length) return d
    const dirtyCells = new Set<string>()
    for (const c of d.dirtyCells) {
      const [rk, field] = c.split(':')
      if (!isAddedKey(rk)) dirtyCells.add(c)
      else {
        const n = Number(rk.slice(1))
        if (n < k) dirtyCells.add(c)
        else if (n > k) dirtyCells.add(`n${n - 1}:${field}`)
      }
    }
    return { ...d, added: d.added.filter((_, j) => j !== k), dirtyCells }
  }
  const i = Number(rowKey)
  if (!(i >= 0 && i < d.rows.length)) return d
  const deleted = new Set(d.deleted)
  if (deleted.has(i)) deleted.delete(i)
  else deleted.add(i)
  return { ...d, deleted }
}

export function setControlTotal(d: Draft, v: number | null): Draft {
  return { ...d, top: { controlTotal: v } }
}

const controlTotalChanged = (d: Draft) => !Object.is(d.top.controlTotal, d.base.controlTotal)

export function draftToPayload(d: Draft): Payload {
  const out: Payload = { ...d.base }
  if ('controlTotal' in d.base || controlTotalChanged(d)) out.controlTotal = d.top.controlTotal
  if (Array.isArray(d.base.transactions) || d.added.length > 0) {
    out.transactions = [...d.rows.filter((_, i) => !d.deleted.has(i)), ...d.added]
  }
  return out
}

/** Edited cells on rows that are kept, plus deleted rows, added rows and a changed control total. */
export function dirtyCount(d: Draft): number {
  let n = d.deleted.size + d.added.length + (controlTotalChanged(d) ? 1 : 0)
  for (const c of d.dirtyCells) {
    const rk = c.split(':')[0]
    if (!isAddedKey(rk) && !d.deleted.has(Number(rk))) n++
  }
  return n
}

export const isDirty = (d: Draft) => dirtyCount(d) > 0

export function rowsSumCents(d: Draft): number {
  const kept = d.rows.filter((_, i) => !d.deleted.has(i))
  return sumCents([...kept, ...d.added].map((r) => r.amount))
}
