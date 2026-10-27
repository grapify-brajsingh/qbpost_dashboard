import type { Change, Txn } from '@/api/schema'
import { formatMoney } from '@/lib/money'

const ROW_PATH = /^\$\.transactions\[(\d+)\](?:\.([A-Za-z0-9_]+))?$/
const MONEY_FIELDS = new Set(['amount', 'controlTotal'])

function show(v: unknown): string {
  return JSON.stringify(v) ?? 'none'
}

function value(field: string, v: unknown): string {
  if (MONEY_FIELDS.has(field) && typeof v === 'number') return formatMoney(v)
  return typeof v === 'string' ? v : show(v)
}

function rowLabel(index: number, externalId: unknown): string {
  return typeof externalId === 'string' && externalId ? `Row ${index + 1} (${externalId})` : `Row ${index + 1}`
}

/** One change as a plain sentence. `rows` are the version's payload rows, used to name rows by externalId. */
export function changeSentence(c: Change, rows?: Txn[]): { text: string; details?: unknown } {
  if (c.path === '$.controlTotal' && c.op === 'replace') {
    return { text: `Control total: ${value('controlTotal', c.old)} → ${value('controlTotal', c.new)}` }
  }
  const m = ROW_PATH.exec(c.path)
  if (m) {
    const index = Number(m[1])
    const field = m[2]
    if (field === undefined && c.op === 'add') return { text: `Row ${index + 1} added`, details: c.new }
    if (field === undefined && c.op === 'remove') return { text: `Row ${index + 1} removed`, details: c.old }
    if (field !== undefined && c.op === 'replace') {
      const known = rows?.[index]?.externalId
      return { text: `${rowLabel(index, known)} ${field}: ${value(field, c.old)} → ${value(field, c.new)}` }
    }
  }
  return { text: `${c.path}: ${show(c.old)} → ${show(c.new)}` }
}
