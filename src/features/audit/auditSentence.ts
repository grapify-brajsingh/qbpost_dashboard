import type { AuditAction, AuditEvent } from '@/api/schema'
import { scanSummaryText } from '@/lib/companyScan'

/** Short action names for badges and the Action filter. */
/** Label for an action; an action this build does not know shows as the raw value. */
export const actionLabel = (a: string): string => (ACTION_LABEL as Partial<Record<string, string>>)[a] ?? a

export const ACTION_LABEL: Record<AuditAction, string> = {
  received: 'Received',
  'row-edited': 'Edited',
  'row-added': 'Added',
  'row-deleted': 'Deleted',
  'row-post-off': "Don't post",
  'row-post-on': 'Marked post',
  'control-total-changed': 'Control total',
  validated: 'Validated',
  'post-started': 'Post started',
  posted: 'Posted',
  'post-failed': 'Post failed',
  discarded: 'Discarded',
  restored: 'Restored',
  resolved: 'Resolved',
  'user-created': 'User created',
  'user-role-changed': 'Role changed',
  'user-disabled': 'User disabled',
  'user-enabled': 'User enabled',
  'user-password-reset': 'Password reset',
  'user-unlocked': 'Unlocked',
  'user-password-changed': 'Password changed',
  'user-signed-in': 'Signed in',
  'user-sign-in-failed': 'Sign-in failed',
  'user-locked-out': 'Locked out',
  'flagged-duplicate': 'Possible duplicate',
  'request-edited': 'Edited',
  'user-session-revoked': 'Signed out',
  'user-other': 'Account event',
  'companies-scanned': 'Companies scanned',
  'company-checked': 'Access checked',
  'company-updated': 'Company updated',
  'company-assigned': 'Company assigned',
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** "row 7" (1-based position), else the row's external id, else null. */
function rowRef(e: AuditEvent): string | null {
  if (e.row?.index != null) return `row ${e.row.index + 1}`
  if (e.row?.externalId) return `row ${e.row.externalId}`
  return null
}

const rowName = (e: AuditEvent) => rowRef(e) ?? 'a row'

/** The person a user event is about. Only what the API put in `detail`; never guessed. */
function subject(e: AuditEvent): string {
  return str(e.detail?.email) ?? str(e.detail?.displayName) ?? str(e.detail?.userId) ?? 'a user'
}

/** A company's name from a `CompanyRef`-shaped detail value, as text only. */
const companyName = (v: unknown): string | null =>
  v && typeof v === 'object' ? str((v as Record<string, unknown>).displayName) : null

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const SENTENCE: Record<AuditAction, (e: AuditEvent) => string> = {
  received: (e) => {
    const file = e.detail?.source === 'upload' ? str(e.detail.fileName) : null
    if (file) return `Uploaded ${file}`
    const n = num(e.detail?.rowCount) ?? num(e.detail?.rows)
    return n === null ? 'Received the statement' : `Received ${plural(n, 'row')}`
  },
  'row-edited': (e) => `Changed ${e.field ?? rowName(e)}${e.field && rowRef(e) ? ` on ${rowRef(e)}` : ''}`,
  'row-added': (e) => `Added ${rowName(e)}`,
  'row-deleted': (e) => `Deleted ${rowName(e)}`,
  'row-post-off': (e) => `Marked ${rowName(e)} don't post`,
  'row-post-on': (e) => `Marked ${rowName(e)} post`,
  'control-total-changed': () => 'Changed the control total',
  validated: () => 'Validated the statement',
  'post-started': () => 'Started posting to QuickBooks',
  posted: (e) => {
    const n = num(e.detail?.postedCount) ?? num(e.detail?.rows) ?? num(e.detail?.count)
    const batch = str(e.detail?.batch) ?? str(e.detail?.postId)
    const what = n === null ? 'the statement' : plural(n, 'row')
    return `Posted ${what}${batch ? ` (batch ${batch})` : ''}`
  },
  'post-failed': (e) => {
    const outcome = str(e.detail?.outcome)
    return outcome ? `Post failed (${outcome})` : 'Post failed'
  },
  discarded: (e) => {
    const reason = str(e.detail?.reason)
    return reason ? `Discarded the statement: ${reason}` : 'Discarded the statement'
  },
  restored: () => 'Restored the statement',
  resolved: () => 'Resolved the statement',
  'user-created': (e) => {
    const role = str(e.detail?.role)
    return `Created user ${subject(e)}${role ? ` as ${cap(role)}` : ''}`
  },
  'user-role-changed': (e) => {
    const role = str(e.detail?.role)
    return `Changed the role of ${subject(e)}${role ? ` to ${cap(role)}` : ''}`
  },
  'user-disabled': (e) => `Disabled ${subject(e)}`,
  'user-enabled': (e) => `Enabled ${subject(e)}`,
  'user-password-reset': (e) => `Reset the password for ${subject(e)}`,
  'user-unlocked': (e) => `Unlocked ${subject(e)}`,
  'user-password-changed': () => 'Changed their password',
  'user-signed-in': () => 'Signed in',
  'user-sign-in-failed': () => 'Failed to sign in',
  'user-locked-out': () => 'Was locked out after failed sign-ins',
  'flagged-duplicate': (e) => {
    const of = num(e.detail?.of)
    return of === null ? 'Flagged as a possible duplicate' : `Flagged as a possible duplicate of SR-${String(of).padStart(6, '0')}`
  },
  'request-edited': (e) => `Changed ${e.field ?? 'the statement'}`,
  'user-session-revoked': () => 'Signed out of every session (a used sign-in token came back)',
  'user-other': (e) => {
    const kind = str(e.detail?.kind)
    return kind ? `Account event: ${kind}` : 'Account event'
  },
  'companies-scanned': (e) => {
    const d = e.detail
    if (!d || num(d.added) === null || num(d.updated) === null || num(d.missing) === null || num(d.ambiguous) === null) {
      return 'Scanned the company folder'
    }
    return `Scanned the company folder: ${scanSummaryText({ added: d.added as number, updated: d.updated as number, missing: d.missing as number, ambiguous: d.ambiguous as number })}`
  },
  'company-checked': (e) => {
    const name = companyName(e.detail?.company)
    const access = str(e.detail?.access)
    return `Checked QuickBooks access to ${name ?? 'a company'}${access ? `: ${access.replace(/-/g, ' ')}` : ''}`
  },
  'company-updated': (e) => {
    const name = companyName(e.detail?.company)
    return name ? `Updated company ${name}` : 'Updated a company'
  },
  'company-assigned': (e) => {
    const to = companyName(e.detail?.to)
    if (!to) return 'Assigned the statement to a company'
    const from = companyName(e.detail?.from)
    return `Assigned ${e.request?.publicRef ?? 'the statement'} to ${to}${from ? ` (was ${from})` : ''}`
  },
}

/** One plain-text sentence for an audit event. Untrusted `detail` values are only ever inserted as text. */
export function auditSentence(e: AuditEvent): string {
  const sentence = (SENTENCE as Partial<Record<string, (e: AuditEvent) => string>>)[e.action]
  return sentence ? sentence(e) : String(e.action)
}
