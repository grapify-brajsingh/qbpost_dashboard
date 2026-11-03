import { isValidReference } from './reference'

describe('isValidReference', () => {
  test.each(['chase-2026-08', 'a', 'A.b_c-1', 'x'.repeat(64)])('accepts %s', (v) => {
    expect(isValidReference(v)).toBe(true)
  })

  test.each(['', '4339 9314 4718 9820', 'a/b', 'x'.repeat(65), ' padded '])('refuses "%s"', (v) => {
    expect(isValidReference(v)).toBe(false)
  })
})
