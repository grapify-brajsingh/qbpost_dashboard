import type { RequestEvent } from '@/api/schema'
import { eventSentence } from './eventSentence'

const ev = (kind: string, detail: Record<string, unknown> | null = null): RequestEvent => ({
  id: 1,
  kind,
  detail,
  atUtc: '2026-10-27T08:00:00Z',
  actor: { id: 'u', name: 'Asha K' },
})

describe('eventSentence', () => {
  test.each([
    [ev('created'), 'Request received'],
    [ev('flagged-duplicate', { of: 1 }), 'Flagged as a possible duplicate of SR-000001'],
    [ev('edited', { version: 2, note: 'fixed payee' }), 'Edited (version 2): fixed payee'],
    [ev('edited', { version: 3, note: null }), 'Edited (version 3)'],
    [ev('validated', { state: 'held' }), 'Validated: held'],
    [ev('post-started', { attemptId: 1 }), 'Post started'],
    [ev('post-finished', { attemptId: 1, outcome: 'partial' }), 'Post finished: partial'],
    [ev('discarded', { reason: 'test' }), 'Discarded: test'],
    [ev('restored'), 'Restored'],
    [ev('resolved', { outcome: 'posted', note: 'checked in QB' }), 'Resolved as posted: checked in QB'],
  ])('%j', (e, text) => {
    expect(eventSentence(e)).toBe(text)
  })

  test('an unknown kind is shown as itself', () => {
    expect(eventSentence(ev('teleported'))).toBe('teleported')
  })
})
