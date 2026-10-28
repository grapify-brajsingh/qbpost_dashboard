import { describe, expect, it } from 'vitest'
import { statementSubject } from './statementTitle'

const upload = { fileName: 'chase-sep.pdf', sizeBytes: 1, sha256: 'x', model: 'm', promptVersion: 'p', extractedUtc: 'u' }

describe('statementSubject', () => {
  it('is the email subject when there is one', () => {
    expect(statementSubject({ email: { subject: 'Chase – Aug', receivedUtc: null }, upload })).toBe('Chase – Aug')
  })
  it('falls back to the uploaded file name when the subject is missing or blank', () => {
    expect(statementSubject({ email: null, upload })).toBe('chase-sep.pdf')
    expect(statementSubject({ email: { subject: '  ', receivedUtc: null }, upload })).toBe('chase-sep.pdf')
  })
  it('is null when there is neither (older API rows without `upload` too)', () => {
    expect(statementSubject({ email: null })).toBeNull()
    expect(statementSubject({ email: null, upload: null })).toBeNull()
  })
})
