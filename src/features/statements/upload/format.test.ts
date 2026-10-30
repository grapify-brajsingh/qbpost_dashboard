import { cleanReference } from './format'

test('turns what was read into a reference the API accepts', () => {
  expect(cleanReference('4339 9314 4718 9820')).toBe('4339-9314-4718-9820')
  expect(cleanReference('  Chase (Sept) #12 ')).toBe('Chase-Sept-12')
  expect(cleanReference('x'.repeat(70))).toHaveLength(64)
  expect(cleanReference('###')).toBe('')
})
