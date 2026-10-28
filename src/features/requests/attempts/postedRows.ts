import type { PostedRow } from '@/api/schema'

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function postedRows(result: unknown): PostedRow[] {
  if (!isObj(result)) return []
  const list = Array.isArray(result.posted) ? result.posted : result.rows
  if (!Array.isArray(list)) return []
  return list.filter((r): r is PostedRow => isObj(r) && typeof r.txnId === 'string')
}
