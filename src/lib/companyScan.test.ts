import { describe, expect, it } from 'vitest'
import { scanSummaryText } from './companyScan'

describe('scanSummaryText', () => {
  it('lists only the non-zero counts', () => {
    expect(scanSummaryText({ added: 2, updated: 0, missing: 1, ambiguous: 0 })).toBe('2 new, 1 missing')
    expect(scanSummaryText({ added: 1, updated: 3, missing: 2, ambiguous: 4 })).toBe('1 new, 3 updated, 2 missing, 4 with several files')
  })
  it('says no changes when everything is zero', () => {
    expect(scanSummaryText({ added: 0, updated: 0, missing: 0, ambiguous: 0 })).toBe('no changes')
  })
})
