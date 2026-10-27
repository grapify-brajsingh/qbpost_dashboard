import type { Finding, Payload, Txn } from '@/api/schema'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Findings per row, keyed by payload index. Findings that match no row go in the -1 bucket. */
export function findingsByRow(rows: Txn[], findings: Finding[]): Map<number, Finding[]> {
  const out = new Map<number, Finding[]>()
  for (const f of findings) {
    let index = f.index
    if (f.externalId && rows[index]?.externalId !== f.externalId) {
      const byId = rows.findIndex((r) => r.externalId === f.externalId)
      if (byId >= 0) index = byId
    }
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) index = -1
    out.set(index, [...(out.get(index) ?? []), f])
  }
  return out
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
