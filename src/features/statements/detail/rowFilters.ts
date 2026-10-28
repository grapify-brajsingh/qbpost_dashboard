// Row filters for the statement table. They decide which rows are shown, nothing else: the meter, the counts and the
// saved payload always use every row.
import { TXN_KINDS, type Txn, type Version } from '@/api/schema'
import { isPosting } from '@/features/requests/transactions/draft'

/** A row as the table shows it. `key` is the draft row key (`"3"` for a loaded row, `"n0"` for an added one). */
export interface DisplayRow {
  key: string
  /** Payload index; added rows continue after the loaded ones. */
  index: number
  row: Txn
  added: boolean
  deleted: boolean
}

export interface RowFilter {
  q?: string
  post?: 'post' | 'skip'
  kind?: string[]
  from?: string
  to?: string
  problem?: boolean
  edited?: boolean
}

/** URL params of the row filters. Defined once: `useUrlFilters` memoises on the spec's identity. */
export const ROW_FILTER_SPEC = {
  rq: { kind: 'text' },
  rpost: { kind: 'enum', values: ['post', 'skip'] },
  rkind: { kind: 'enumList', values: TXN_KINDS },
  rfrom: { kind: 'date' },
  rto: { kind: 'date' },
  rproblem: { kind: 'bool' },
  redited: { kind: 'bool' },
} as const

export interface FilterContext {
  /** Row keys with a validation finding or an unreadable cell. */
  findings: Set<string>
  /** Row keys with unsaved changes (edited, added, deleted or switched). */
  dirtyKeys: Set<string>
  /** Row keys changed in a saved version after version 1. */
  editedInVersions: Set<string>
}

const SEARCHED: (keyof Txn)[] = ['payee', 'memo', 'account', 'lineAccount']

export function filterRows(rows: DisplayRow[], f: RowFilter, ctx: FilterContext): DisplayRow[] {
  const q = f.q?.trim().toLowerCase()
  return rows.filter(({ key, row }) => {
    if (q && !SEARCHED.some((k) => typeof row[k] === 'string' && (row[k] as string).toLowerCase().includes(q))) return false
    if (f.post === 'post' && !isPosting(row)) return false
    if (f.post === 'skip' && isPosting(row)) return false
    if (f.kind && f.kind.length > 0 && !(typeof row.kind === 'string' && f.kind.includes(row.kind))) return false
    if (f.from && !(typeof row.date === 'string' && row.date >= f.from)) return false
    if (f.to && !(typeof row.date === 'string' && row.date <= f.to)) return false
    if (f.problem && !ctx.findings.has(key)) return false
    if (f.edited && !ctx.dirtyKeys.has(key) && !ctx.editedInVersions.has(key)) return false
    return true
  })
}

export const isFiltering = (f: RowFilter) => Object.values(f).some((v) => v !== undefined && v !== false && !(Array.isArray(v) && v.length === 0))

const ROW_PATH = /^\$\.transactions\[(\d+)\]/

/**
 * Keys of the current rows that a saved version after version 1 changed or added. A change path's index points into
 * that version's payload; rows are matched to the current ones by externalId.
 */
export function editedInVersions(versions: Version[], current: Txn[]): Set<string> {
  const keyById = new Map<string, string>()
  current.forEach((r, i) => {
    if (typeof r.externalId === 'string') keyById.set(r.externalId, String(i))
  })
  const out = new Set<string>()
  for (const v of versions) {
    if (v.number <= 1) continue
    const rows = Array.isArray(v.payload.transactions) ? (v.payload.transactions as Txn[]) : []
    for (const c of v.changes) {
      if (c.op === 'remove') continue
      const m = ROW_PATH.exec(c.path)
      if (!m) continue
      const id = rows[Number(m[1])]?.externalId
      const key = typeof id === 'string' ? keyById.get(id) : undefined
      if (key !== undefined) out.add(key)
    }
  }
  return out
}

/** The version that removed the row with this externalId, or null when no version did. */
export function deletedInVersion(versions: Version[], externalId: string): number | null {
  let found: number | null = null
  for (const v of versions) {
    for (const c of v.changes) {
      if (c.op !== 'remove' || !ROW_PATH.test(c.path)) continue
      const old = c.old as Txn | undefined
      if (old && typeof old === 'object' && old.externalId === externalId) found = Math.max(found ?? 0, v.number)
    }
  }
  return found
}
