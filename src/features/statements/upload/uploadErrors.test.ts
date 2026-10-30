import { describe, expect, it } from 'vitest'
import { ApiTimeoutError } from '@/api/client'
import { ApiError } from '@/api/problem'
import { canRetry, uploadError } from './uploadErrors'

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

  it('words the size limit for people, and treats a proxy 413 the same', () => {
    const big = { message: 'The PDF is larger than 10 MB.', retry: false }
    expect(uploadError(err(413, 'file-too-large', 'The file may be at most 10485760 bytes. Nothing was read or stored.'))).toEqual(big)
    expect(uploadError(new ApiError({ title: 'Request Entity Too Large', status: 413 }, new Headers()))).toEqual(big)
  })

  it('gives the wait from Retry-After', () => {
    const e = new ApiError({ status: 429, title: 'Too many extractions', type: 'too-many-extractions', detail: 'Wait for your other upload to finish.' }, new Headers({ 'Retry-After': '30' }))
    expect(uploadError(e)).toEqual({ message: 'Wait for your other upload to finish. Try again in 30 seconds.', retry: true, waitSeconds: 30 })
  })

  it('offers Try again only when the server or network was at fault', () => {
    expect(canRetry(err(403, 'forbidden'))).toBe(false)
    expect(canRetry(err(400, 'invalid-request'))).toBe(false)
    expect(canRetry(err(502, 'bad-gateway'))).toBe(true)
    expect(canRetry(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('returns null for anything else, which the page shows with ProblemAlert', () => {
    expect(uploadError(err(403, 'forbidden'))).toBeNull()
    expect(uploadError(new Error('x'))).toBeNull()
  })
})
