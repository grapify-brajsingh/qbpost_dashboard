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
  top: { controlTotal: unknown; reference: unknown }
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
    top: { controlTotal: payload.controlTotal, reference: payload.reference },
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

/** Appends a row. Dashboard-made rows get a `dash-<uuid>` externalId unless one is given. */
export function addRow(d: Draft, row?: Partial<Txn>): Draft {
  const added: Txn = { externalId: `dash-${crypto.randomUUID()}`, ...row }
  return { ...d, added: [...d.added, added] }
}

/** A row's `post` missing means true. */
export const isPosting = (row: Txn): boolean => row.post !== false

/** Switches a row between post and don't post. Never removes data; a row with no `post` field gets none back. */
export function setPost(d: Draft, rowKey: string, post: boolean): Draft {
  const added = isAddedKey(rowKey)
  const i = Number(added ? rowKey.slice(1) : rowKey)
  const list = added ? d.added : d.rows
  const current = list[i]
  if (current === undefined) return d
  const original: Txn = added ? {} : baseRows(d.base)[i]
  const key = `${rowKey}:post`
  const next: Txn = { ...current }
  const dirtyCells = new Set(d.dirtyCells)
  if (post === isPosting(original)) {
    if ('post' in original) next.post = original.post
    else delete next.post
    dirtyCells.delete(key)
  } else {
    next.post = post
    dirtyCells.add(key)
  }
  const copy = [...list]
  copy[i] = next
  return added ? { ...d, added: copy, dirtyCells } : { ...d, rows: copy, dirtyCells }
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
  return { ...d, top: { ...d.top, controlTotal: v } }
}

export function setReference(d: Draft, v: string): Draft {
  return { ...d, top: { ...d.top, reference: v } }
}

const controlTotalChanged = (d: Draft) => !Object.is(d.top.controlTotal, d.base.controlTotal)
const referenceChanged = (d: Draft) => !Object.is(d.top.reference, d.base.reference)

export function draftToPayload(d: Draft): Payload {
  const out: Payload = { ...d.base }
  if ('controlTotal' in d.base || controlTotalChanged(d)) out.controlTotal = d.top.controlTotal
  if (referenceChanged(d)) out.reference = d.top.reference
  if (Array.isArray(d.base.transactions) || d.added.length > 0) {
    out.transactions = [...d.rows.filter((_, i) => !d.deleted.has(i)), ...d.added]
  }
  return out
}

/** Edited cells on rows that are kept, plus deleted rows, added rows, a changed control total and reference. */
export function dirtyCount(d: Draft): number {
  let n = d.deleted.size + d.added.length + (controlTotalChanged(d) ? 1 : 0) + (referenceChanged(d) ? 1 : 0)
  for (const c of d.dirtyCells) {
    const rk = c.split(':')[0]
    if (!isAddedKey(rk) && !d.deleted.has(Number(rk))) n++
  }
  return n
}

export interface ChangeBreakdown {
  edits: number
  added: number
  deleted: number
  postOff: number
  postOn: number
}

/** The parts of `dirtyCount`: cell edits (and a changed control total or reference), added and deleted rows, post switches. */
export function changeBreakdown(d: Draft): ChangeBreakdown {
  const out: ChangeBreakdown = { edits: (controlTotalChanged(d) ? 1 : 0) + (referenceChanged(d) ? 1 : 0), added: d.added.length, deleted: d.deleted.size, postOff: 0, postOn: 0 }
  for (const c of d.dirtyCells) {
    const [rk, field] = c.split(':')
    if (isAddedKey(rk) || d.deleted.has(Number(rk))) continue
    if (field !== 'post') out.edits++
    else if (isPosting(d.rows[Number(rk)])) out.postOn++
    else out.postOff++
  }
  return out
}

export const isDirty = (d: Draft) => dirtyCount(d) > 0

export function rowsSumCents(d: Draft): number {
  const kept = d.rows.filter((_, i) => !d.deleted.has(i))
  return sumCents([...kept, ...d.added].map((r) => r.amount))
}

export interface PostStats {
  total: number
  posting: number
  skipped: number
  skippedCents: number
  allCents: number
}

/** Counts over every non-deleted row (loaded and added). Skipped rows stay in `allCents`. */
export function postStats(d: Draft): PostStats {
  const kept = [...d.rows.filter((_, i) => !d.deleted.has(i)), ...d.added]
  const skipped = kept.filter((r) => !isPosting(r))
  return {
    total: kept.length,
    posting: kept.length - skipped.length,
    skipped: skipped.length,
    skippedCents: sumCents(skipped.map((r) => r.amount)),
    allCents: sumCents(kept.map((r) => r.amount)),
  }
}
