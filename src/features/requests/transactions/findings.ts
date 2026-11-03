import type { Finding, Payload, QbLists, Txn } from '@/api/schema'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The payload index a finding belongs to, or -1 when it matches no row. */
function rowIndexOf(rows: Txn[], f: Finding): number {
  let index = f.index
  if (f.externalId && rows[index]?.externalId !== f.externalId) {
    const byId = rows.findIndex((r) => r.externalId === f.externalId)
    if (byId >= 0) index = byId
  }
  return Number.isInteger(index) && index >= 0 && index < rows.length ? index : -1
}

/** Findings per row, keyed by payload index. Findings that match no row go in the -1 bucket. */
export function findingsByRow(rows: Txn[], findings: Finding[]): Map<number, Finding[]> {
  const out = new Map<number, Finding[]>()
  for (const f of findings) {
    const index = rowIndexOf(rows, f)
    out.set(index, [...(out.get(index) ?? []), f])
  }
  return out
}

function nameResolved(row: Txn, reason: string, lists: QbLists): boolean {
  if (reason === 'unknown-payee') {
    return (row.kind === 'Deposit' ? lists.customers : lists.vendors).includes(row.payee as string)
  }
  // Either account field can be the unknown one, so both must be known.
  const names = [row.account, row.lineAccount].filter((v): v is string => typeof v === 'string' && v !== '')
  return reason === 'unknown-account' && names.length > 0 && names.every((n) => lists.accounts.includes(n))
}

/**
 * The stored snapshot only changes on Validate, so after a sync it can still name a QuickBooks name that now exists.
 * Hides those findings (same exact match as the "not in QuickBooks" flag); the server re-validates on Post anyway.
 */
export function dropResolvedFindings(rows: Txn[], findings: Finding[], lists: QbLists | undefined): Finding[] {
  if (!lists) return findings
  return findings.filter((f) => {
    const index = rowIndexOf(rows, f)
    return index < 0 || !nameResolved(rows[index], f.reason, lists)
  })
}

const READ_ERROR = /^\$\.transactions\[(\d+)\]\.(\w+)/

/** `$.transactions[3].kind` becomes row 3 / field `kind`. */
export function readErrorCells(readErrors: string[]): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>()
  for (const e of readErrors) {
    const m = READ_ERROR.exec(e)
    if (!m) continue
    const i = Number(m[1])
    out.set(i, (out.get(i) ?? new Set()).add(m[2]))
  }
  return out
}

export function tableShape(payload: Payload): 'table' | 'raw' {
  const t = payload.transactions
  return Array.isArray(t) && t.every(isObject) ? 'table' : 'raw'
}
