import { BanIcon, CircleAlertIcon, CircleCheckIcon, CircleHelpIcon, ShieldAlertIcon, type LucideIcon } from 'lucide-react'
import { ApiError, problemCode } from '@/api/problem'
import type { CompaniesResponse, Company, CompanyAccess, CompanyRef, CompanyScanResult } from '@/api/schema'
import { companyFileMessage } from '@/features/requests/transactions/qbListsSync'
import { scanSummaryText } from '@/lib/companyScan'

/** "18 · Takoma Park Grocery Store Inc"; the name alone for a company without a code. */
export function companyLabel(c: Pick<CompanyRef, 'code' | 'displayName'>): string {
  return c.code ? `${c.code} · ${c.displayName}` : c.displayName
}

/** Statements can be validated and posted only for an active company whose QuickBooks access is approved. */
export function isCompanyReady(c: Pick<Company, 'state' | 'access'>): boolean {
  return c.state === 'active' && c.access === 'approved'
}

const names = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** Codes in numeric order, companies without a code after those with one, then by name. */
function byCodeThenName(a: Company, b: Company): number {
  if (a.code !== b.code) {
    if (a.code === null) return 1
    if (b.code === null) return -1
    const n = names.compare(a.code, b.code)
    if (n) return n
  }
  return names.compare(a.displayName, b.displayName)
}

/** The companies a statement can be assigned to: active ones, `firstIds` first (e.g. the matched candidates). */
export function assignableCompanies(items: readonly Company[], firstIds: readonly number[] = []): Company[] {
  const active = items.filter((c) => c.state === 'active').sort(byCodeThenName)
  const first = firstIds.flatMap((id) => active.filter((c) => c.id === id))
  return [...first, ...active.filter((c) => !firstIds.includes(c.id))]
}

export function defaultCompanyId(r: CompaniesResponse | null | undefined): number | undefined {
  return r?.items.find((c) => c.isDefault)?.id
}

const isDimmed = (c: Company) => c.state === 'missing' || c.state === 'disabled'

/** By code then name, with missing and disabled companies last. */
export function sortCompanies(items: readonly Company[]): Company[] {
  return [...items].sort((a, b) => Number(isDimmed(a)) - Number(isDimmed(b)) || byCodeThenName(a, b))
}

export interface AccessView {
  label: string
  variant: 'success' | 'warning' | 'muted' | 'danger'
  icon: LucideIcon
}

const ACCESS: Record<CompanyAccess, AccessView> = {
  approved: { label: 'Approved', variant: 'success', icon: CircleCheckIcon },
  'needs-approval': { label: 'Needs approval', variant: 'warning', icon: ShieldAlertIcon },
  unchecked: { label: 'Not checked', variant: 'muted', icon: CircleHelpIcon },
  'file-not-found': { label: 'File missing', variant: 'danger', icon: BanIcon },
  error: { label: 'Error', variant: 'danger', icon: CircleAlertIcon },
}

export const accessView = (a: CompanyAccess): AccessView => ACCESS[a]

export function fileText(c: Company): string {
  return c.state === 'ambiguous' ? `${c.candidateFiles.length} files — choose one` : (c.fileName ?? '—')
}

/** "Found 2 new, 1 missing" or "No changes", built from the one scan sentence. */
export function scanToastText(r: CompanyScanResult): string {
  const s = scanSummaryText(r)
  return s === 'no changes' ? 'No changes' : `Found ${s}`
}

export interface CheckToast {
  level: 'success' | 'warning' | 'error'
  text: string
}

/** The toast for a Check access answer: the company (200) or the error thrown. */
export function checkAccessToast(result: Company | unknown): CheckToast {
  if (result instanceof ApiError) {
    const p = result.problem
    const code = problemCode(p)
    if (p.status === 409 && code === 'company-file-open-elsewhere') return { level: 'error', text: companyFileMessage(p, 'check') }
    if (p.status === 503 && code === 'quickbooks-not-open') return { level: 'warning', text: "QuickBooks isn't running" }
    if (p.status === 503 && code === 'company-file-unavailable') {
      const file = typeof p.neededFile === 'string' && p.neededFile ? p.neededFile : 'the company file'
      return { level: 'error', text: `QuickBooks couldn't open ${file}. Check that QuickBooks can open it, then check again.` }
    }
    // The file was re-pointed while QuickBooks answered, so the answer was for another file and nothing was saved.
    if (p.status === 412 && code === 'edited-by-someone-else') {
      return { level: 'warning', text: 'This company changed while QuickBooks was checking it. The list is reloaded; check again.' }
    }
    return { level: 'error', text: p.title }
  }
  if (typeof result !== 'object' || result === null || !('access' in result)) {
    return { level: 'error', text: 'Could not reach the server. Try again.' }
  }
  const c = result as Company
  switch (c.access) {
    case 'approved':
      return { level: 'success', text: `QuickBooks access approved for ${c.displayName}` }
    case 'needs-approval':
      return { level: 'warning', text: `QuickBooks hasn't approved ${c.displayName} yet. Follow the steps above, then check again.` }
    case 'file-not-found':
      return { level: 'error', text: `${c.fileName ?? 'The company file'} wasn't found. Sync the folder, then check again.` }
    default:
      return { level: 'error', text: c.accessMessage ?? 'QuickBooks could not check this file.' }
  }
}

/** The name to add, trimmed; null when it is blank or already in the list (ignoring case). */
export function cleanMatchName(raw: string, existing: readonly string[]): string | null {
  const name = raw.trim()
  if (!name) return null
  const key = name.toLowerCase()
  return existing.some((e) => e.trim().toLowerCase() === key) ? null : name
}

/** The page's own problem for a root folder the server cannot read, shown by ProblemAlert. */
export function rootUnreachableError(rootFolder: string): ApiError {
  return new ApiError({ title: "Can't reach the company folder", status: 503, detail: rootFolder }, new Headers())
}
