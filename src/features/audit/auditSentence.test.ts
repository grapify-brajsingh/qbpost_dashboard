import { describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS, type AuditAction, type AuditEvent } from '@/api/schema'
import { ACTION_LABEL, auditSentence } from './auditSentence'

const ev = (action: AuditAction, over: Partial<AuditEvent> = {}): AuditEvent => ({
  id: 'e', atUtc: '2026-10-28T10:00:00Z', actor: { id: 'u', name: 'Asha K', kind: 'user' }, action,
  request: null, row: null, field: null, old: null, new: null, versionNumber: null, detail: null, ...over,
})

describe('auditSentence', () => {
  it('reads like the sketch', () => {
    expect(auditSentence(ev('row-edited', { field: 'payee', row: { externalId: 'r7', index: 6 } }))).toBe('Changed payee on row 7')
    expect(auditSentence(ev('row-post-off', { row: { externalId: 'r3', index: 2 } }))).toBe("Marked row 3 don't post")
    expect(auditSentence(ev('row-added', { row: { externalId: 'dash-1', index: 134 } }))).toBe('Added row 135')
    expect(auditSentence(ev('posted', { detail: { postedCount: 61, batch: 'api-amex-2026-09' } }))).toBe('Posted 61 rows (batch api-amex-2026-09)')
    expect(auditSentence(ev('user-password-reset', { detail: { email: 'eli@example.com' } }))).toBe('Reset the password for eli@example.com')
    expect(auditSentence(ev('user-created', { detail: { email: 'eli@example.com', role: 'editor' } }))).toBe('Created user eli@example.com as Editor')
    expect(auditSentence(ev('post-failed', { detail: { outcome: 'busy' } }))).toBe('Post failed (busy)')
  })

  it('an upload reads "Uploaded <file>"; n8n saves still read "Received"', () => {
    expect(auditSentence(ev('received', { detail: { source: 'upload', fileName: 'chase-sep.pdf' } }))).toBe('Uploaded chase-sep.pdf')
    expect(auditSentence(ev('received', { detail: { source: 'email' } }))).toBe('Received the statement')
  })

  it('falls back to the row external id, then to words, when the position is unknown', () => {
    expect(auditSentence(ev('row-deleted', { row: { externalId: 'row-7', index: null } }))).toBe('Deleted row row-7')
    expect(auditSentence(ev('row-deleted'))).toBe('Deleted a row')
    expect(auditSentence(ev('row-edited', { field: 'memo' }))).toBe('Changed memo')
  })

  it('reads the actions the API adds beyond R-7.4 (API v2 spec §14, Q-97)', () => {
    expect(auditSentence(ev('flagged-duplicate', { detail: { of: 1, reasons: ['same-payload'] } }))).toBe('Flagged as a possible duplicate of SR-000001')
    expect(auditSentence(ev('flagged-duplicate'))).toBe('Flagged as a possible duplicate')
    expect(auditSentence(ev('request-edited', { field: 'reference' }))).toBe('Changed reference')
    expect(auditSentence(ev('user-session-revoked'))).toBe('Signed out of every session (a used sign-in token came back)')
    expect(auditSentence(ev('user-other', { detail: { kind: 'stamp-rotated' } }))).toBe('Account event: stamp-rotated')
  })

  it('reads the company actions (R-18, R-19)', () => {
    const sa = { id: 2, code: '440', displayName: 'S & A Convenience Market LLC' }
    const takoma = { id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' }
    const request = { id: 14, publicRef: 'SR-000014', reference: null, pushId: null, emailSubject: null }
    expect(auditSentence(ev('company-assigned', { request, detail: { from: null, to: sa, source: 'chosen' } }))).toBe('Assigned SR-000014 to S & A Convenience Market LLC')
    expect(auditSentence(ev('company-assigned', { request, detail: { from: takoma, to: sa } }))).toBe('Assigned SR-000014 to S & A Convenience Market LLC (was Takoma Park Grocery Store Inc)')
    expect(auditSentence(ev('company-assigned'))).toBe('Assigned the statement to a company')
    expect(auditSentence(ev('companies-scanned', { detail: { added: 2, updated: 0, missing: 1, ambiguous: 0 } }))).toBe('Scanned the company folder: 2 new, 1 missing')
    expect(auditSentence(ev('companies-scanned', { detail: { added: 0, updated: 0, missing: 0, ambiguous: 0 } }))).toBe('Scanned the company folder: no changes')
    expect(auditSentence(ev('company-checked', { detail: { company: takoma, access: 'approved' } }))).toBe('Checked QuickBooks access to Takoma Park Grocery Store Inc: approved')
    expect(auditSentence(ev('company-checked', { detail: { company: sa, access: 'needs-approval' } }))).toBe('Checked QuickBooks access to S & A Convenience Market LLC: needs approval')
    expect(auditSentence(ev('company-updated', { detail: { company: sa, fields: ['matchNames'] } }))).toBe('Updated company S & A Convenience Market LLC')
  })

  it('reads the detail shapes the real API writes (M17: no company reference on checked/updated)', () => {
    expect(auditSentence(ev('company-checked', { detail: { companyId: 2, access: 'file-not-found' } }))).toBe('Checked QuickBooks access to a company: file not found')
    expect(auditSentence(ev('company-updated', { detail: { companyId: 2, matchNames: ['S&A'], state: 'active' } }))).toBe('Updated a company')
    expect(auditSentence(ev('companies-scanned', { detail: { added: 1, updated: 0, missing: 0, ambiguous: 0, noCompanyFile: ['Empty folder'] } }))).toBe('Scanned the company folder: 1 new')
    // a statement's company that has since been removed comes back as { id, code: null, displayName: null }
    const gone = { id: 9, code: null, displayName: null }
    expect(auditSentence(ev('company-assigned', { detail: { companyId: 2, from: gone, to: { id: 2, code: '440', displayName: 'S & A' }, source: 'chosen' } }))).toBe('Assigned the statement to S & A')
  })

  it('company sentences fall back to a shorter form when detail is missing', () => {
    expect(auditSentence(ev('companies-scanned'))).toBe('Scanned the company folder')
    expect(auditSentence(ev('company-checked'))).toBe('Checked QuickBooks access to a company')
    expect(auditSentence(ev('company-updated'))).toBe('Updated a company')
  })

  it('every AUDIT_ACTIONS value has a sentence and a label (no fallback to the raw enum)', () => {
    for (const a of AUDIT_ACTIONS) {
      const s = auditSentence(ev(a))
      expect(s, a).not.toBe('')
      expect(s, a).not.toContain(a)
      expect(ACTION_LABEL[a], a).toBeTruthy()
    }
  })
})
