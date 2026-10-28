import { vi } from 'vitest'
import { lastSeen } from './lastSeen'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

describe('lastSeen', () => {
  it('reads null before anything is stored and round-trips markNow', () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T10:00:00Z') })
    expect(lastSeen.read()).toBeNull()
    lastSeen.markNow()
    expect(localStorage.getItem('qbpost.statements.lastSeen')).toBe('2026-10-28T10:00:00.000Z')
    expect(lastSeen.read()).toBe('2026-10-28T10:00:00.000Z')
  })

  it('ignores a malformed stored value', () => {
    localStorage.setItem('qbpost.statements.lastSeen', 'garbage')
    expect(lastSeen.read()).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(lastSeen.read()).toBeNull()
    expect(() => lastSeen.markNow()).not.toThrow()
  })
})
