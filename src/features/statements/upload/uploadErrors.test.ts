import { describe, expect, it } from 'vitest'
import { ApiTimeoutError } from '@/api/client'
import { ApiError } from '@/api/problem'
import { uploadError } from './uploadErrors'

const err = (status: number, code: string, detail?: string) =>
  new ApiError({ status, title: code, code, type: `https://qbautopost/problems/${code}`, detail }, new Headers())

describe('uploadError', () => {
  it.each([
    [err(415, 'not-a-pdf'), "That file isn't a PDF.", false],
    [err(422, 'not-a-bank-statement'), "This PDF doesn't look like a bank or card statement.", false],
    [err(422, 'no-text'), 'This PDF has no readable text. It may be a scan.', false],
    [err(422, 'pdf-protected'), 'This PDF is password-protected. Remove the password and upload it again.', false],
    [err(502, 'extraction-failed'), "We couldn't read the statement this time.", true],
    [err(504, 'extraction-timeout'), "We couldn't read the statement this time.", true],
    [new ApiTimeoutError(), "We couldn't read the statement this time.", true],
    [err(503, 'extraction-unavailable'), "Reading PDFs isn't available right now.", false],
  ])('%s', (e, message, retry) => {
    expect(uploadError(e)).toEqual({ message, retry })
  })

  it('uses the problem detail for size limits and rate limits', () => {
    expect(uploadError(err(413, 'file-too-large', 'The PDF has more than 50 pages.'))).toEqual({ message: 'The PDF has more than 50 pages.', retry: false })
    expect(uploadError(err(429, 'too-many-extractions', 'Wait a minute.'))).toEqual({ message: 'Wait a minute.', retry: true })
  })

  it('returns null for anything else, which the page shows with ProblemAlert', () => {
    expect(uploadError(err(403, 'forbidden'))).toBeNull()
    expect(uploadError(new Error('x'))).toBeNull()
  })
})
