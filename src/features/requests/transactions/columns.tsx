/* eslint-disable react-refresh/only-export-components -- column definitions, not a component module */
import type { ReactNode } from 'react'
import { TXN_KINDS, type Txn } from '@/api/schema'
import { Money } from '@/components/Money'

export type TxField = 'kind' | 'date' | 'amount' | 'account' | 'lineAccount' | 'payee' | 'checkNo' | 'refNumber' | 'memo' | 'last4' | 'externalId'

export interface TxColumn {
  /** Stable id, also the key persisted when the column is hidden. */
  id: string
  header: string
  /** Payload field the column shows (and, in Task 9, edits). Absent for the row number. */
  field?: TxField
  /** Narrow columns can be hidden from the column menu. */
  narrow?: boolean
  align?: 'right'
  width: string
  render: (row: Txn, index: number) => ReactNode
}

/** Payload values are shown as text, whatever their type. */
export function cellText(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

export const isKnownKind = (v: unknown): v is string => typeof v === 'string' && (TXN_KINDS as readonly string[]).includes(v)

/** Columns the dashboard edits: every payload field except the external id. */
export const isEditableField = (f: TxField | undefined): f is TxField => f !== undefined && f !== 'externalId'

const text = (id: TxField, header: string, width: string, narrow = false): TxColumn => ({
  id,
  header,
  field: id,
  narrow,
  width,
  render: (row) => cellText(row[id]),
})

export const COLUMNS: TxColumn[] = [
  { id: 'index', header: '#', width: 'w-20', render: (_row, index) => index + 1 },
  text('date', 'Date', 'w-28'),
  text('kind', 'Kind', 'w-28'),
  text('payee', 'Payee', 'w-56'),
  text('account', 'Account', 'w-52'),
  text('lineAccount', 'Line account', 'w-52'),
  {
    id: 'amount',
    header: 'Amount',
    field: 'amount',
    align: 'right',
    width: 'w-32',
    render: (row) => (typeof row.amount === 'number' ? <Money value={row.amount} /> : cellText(row.amount)),
  },
  text('checkNo', 'Check no', 'w-24', true),
  text('refNumber', 'Ref no', 'w-24', true),
  text('memo', 'Memo', 'w-64'),
  text('last4', 'Last 4', 'w-20', true),
  text('externalId', 'External id', 'w-40', true),
]

export const NARROW_COLUMNS = COLUMNS.filter((c) => c.narrow)
