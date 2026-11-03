import { friendlyError } from './validationText'

test('row numbers match the table', () => {
  expect(friendlyError('row 0: amount must be greater than zero')).toBe('Row 1: amount must be greater than zero')
})

test('unreadable fields are named in plain words', () => {
  expect(friendlyError('$.transactions[2].date: The JSON value could not be converted to System.DateOnly.')).toBe("Row 3: the date isn't a valid date.")
  expect(friendlyError('$.transactions[0].amount: The JSON value could not be converted to System.Decimal.')).toBe("Row 1: the amount isn't valid.")
  expect(friendlyError('$.transactions[1].post: must be true or false')).toBe('Row 2, post: must be true or false')
})

test('anything else is unchanged', () => {
  const text = "reference 'a b' may contain only letters, digits, '.', '_' and '-' (1-64 characters)"
  expect(friendlyError(text)).toBe(text)
})
