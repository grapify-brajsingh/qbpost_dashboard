// What the fake API "reads" from an uploaded PDF (R-13). The file name picks the outcome so tests and demos can
// reach every state: not-statement, scan, protected, fail, empty, dup (same reference as statement 1).
import type { Payload, Txn } from '@/api/schema'

export const EXTRACTION_MODEL = 'google/gemini-pro-latest'
export const PROMPT_VERSION = '2026-10-28.1'

export type ExtractionOutcome =
  | { kind: 'ok'; payload: Payload }
  | { kind: 'problem'; status: number; code: string; title: string; detail: string }

const problem = (status: number, code: string, title: string, detail: string): ExtractionOutcome => ({ kind: 'problem', status, code, title, detail })

/** A 14-row checking statement as the model reads it: only Deposit or Check, three rows missing account or payee. */
export function readRows(): Txn[] {
  const rows: Omit<Txn, 'externalId'>[] = [
    { kind: 'Deposit', date: '2026-09-01', amount: 1240, account: 'Chase Checking 4521', lineAccount: 'Rental Income', memo: 'DEPOSIT UNIT 4 RENT', payee: 'Unit 4 Tenant' },
    { kind: 'Check', date: '2026-09-02', amount: 412.18, account: 'Chase Checking 4521', lineAccount: 'Repairs and Maintenance', memo: 'CHECK 2041 ABC PLUMBING', payee: 'ABC Plumbing LLC', checkNo: '2041' },
    { kind: 'Check', date: '2026-09-03', amount: 60, lineAccount: 'Bank Service Charges', memo: 'MONTHLY SERVICE FEE', payee: 'Bank Fees' },
    { kind: 'Deposit', date: '2026-09-04', amount: 980, account: 'Chase Checking 4521', lineAccount: 'Rental Income', memo: 'DEPOSIT UNIT 7 RENT', payee: 'Unit 7 Tenant' },
    { kind: 'Check', date: '2026-09-05', amount: 156.4, account: 'Chase Checking 4521', lineAccount: 'Utilities', memo: 'ACH METRO ELECTRIC', payee: 'Metro Electric Co' },
    { kind: 'Check', date: '2026-09-08', amount: 89.99, account: 'Chase Checking 4521', lineAccount: 'Office Supplies', memo: 'POS STAPLES 0912' },
    { kind: 'Deposit', date: '2026-09-09', amount: 1500, account: 'Chase Checking 4521', lineAccount: 'Rental Income', memo: 'DEPOSIT UNIT 12 RENT', payee: 'Unit 12 Tenant' },
    { kind: 'Check', date: '2026-09-10', amount: 225, account: 'Chase Checking 4521', lineAccount: 'Insurance', memo: 'ACH ALLIED INSURANCE', payee: 'Allied Insurance' },
    { kind: 'Check', date: '2026-09-12', amount: 310.5, account: 'Chase Checking 4521', lineAccount: 'Repairs and Maintenance', memo: 'CHECK 2042 HARBOR PROPERTY', payee: 'Harbor Property Services', checkNo: '2042' },
    { kind: 'Check', date: '2026-09-15', amount: 72.35, memo: 'ACH CITY WATER', payee: 'City Water Department' },
    { kind: 'Deposit', date: '2026-09-16', amount: 450, account: 'Chase Checking 4521', lineAccount: 'Rental Income', memo: 'DEPOSIT KIOSK', payee: 'Kiosk Rental' },
    { kind: 'Check', date: '2026-09-18', amount: 135, account: 'Chase Checking 4521', lineAccount: 'Repairs and Maintenance', memo: 'CHECK 2043 NORTHSIDE CLEANING', payee: 'Northside Cleaning', checkNo: '2043' },
    { kind: 'Check', date: '2026-09-22', amount: 520, account: 'Chase Checking 4521', lineAccount: 'Professional Fees', memo: 'CHECK 2044 SUMMIT LEGAL', payee: 'Summit Legal Group', checkNo: '2044' },
    { kind: 'Check', date: '2026-09-25', amount: 98.6, account: 'Chase Checking 4521', lineAccount: 'Repairs and Maintenance', memo: 'POS GREENLINE LANDSCAPING', payee: 'Greenline Landscaping' },
  ]
  return rows.map((r, i) => ({ externalId: `row-${i + 1}`, ...r }))
}

export function outcomeFor(fileName: string): ExtractionOutcome {
  const name = fileName.toLowerCase()
  if (name.includes('not-statement')) return problem(422, 'not-a-bank-statement', 'Not a bank statement', "This PDF doesn't look like a bank or card statement.")
  if (name.includes('scan')) return problem(422, 'no-text', 'No readable text', 'This PDF has no readable text. It may be a scan.')
  if (name.includes('protected')) return problem(422, 'pdf-protected', 'Password-protected PDF', 'This PDF is password-protected.')
  if (name.includes('fail')) return problem(502, 'extraction-failed', 'Extraction failed', 'The statement could not be read. Try again.')
  if (name.includes('empty')) return { kind: 'ok', payload: { reference: null, controlTotal: null, transactions: [] } }
  const reference = name.includes('dup') ? 'chase-4521-2026-08' : null
  return { kind: 'ok', payload: { reference, controlTotal: null, transactions: readRows() } }
}
