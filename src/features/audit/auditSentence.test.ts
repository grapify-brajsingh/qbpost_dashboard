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
    expect(auditSentence(ev('post-failed', { detail: { outcome: 'busy' } }))).toBe('Post failed (busy)')
  })

  it('falls back to the row external id, then to words, when the position is unknown', () => {
    expect(auditSentence(ev('row-deleted', { row: { externalId: 'row-7', index: null } }))).toBe('Deleted row row-7')
    expect(auditSentence(ev('row-deleted'))).toBe('Deleted a row')
    expect(auditSentence(ev('row-edited', { field: 'memo' }))).toBe('Changed memo')
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
