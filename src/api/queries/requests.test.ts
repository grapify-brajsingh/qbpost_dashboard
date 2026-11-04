import { describe, expect, test } from 'vitest'
import { listQuery, requestKeys } from './requests'

describe('request query keys and params', () => {
  test('listQuery sends company=<id> and company=none, and nothing when unset', () => {
    expect(new URLSearchParams(listQuery({ company: '2' })).get('company')).toBe('2')
    expect(new URLSearchParams(listQuery({ company: 'none' })).get('company')).toBe('none')
    expect(listQuery({ status: ['pending'] })).not.toContain('company')
  })

  test('stats keys: one per company, all-companies key unchanged', () => {
    expect(requestKeys.stats()).toEqual(['requests', 'stats'])
    expect(requestKeys.stats('2')).toEqual(['requests', 'stats', '2'])
  })
})
