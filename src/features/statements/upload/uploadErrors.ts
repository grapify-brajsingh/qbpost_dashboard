import { ApiTimeoutError } from '@/api/client'
import { ApiError, problemCode, retryAfterSeconds } from '@/api/problem'

export interface UploadErrorView {
  message: string
  /** Offer "Try again" with the same file. */
  retry: boolean
  /** Try again stays disabled this long. */
  waitSeconds?: number
}

const AGAIN = "We couldn't read the statement this time."
const TOO_BIG = 'The PDF is larger than 10 MB.'

const waitText = (n: number) => (n < 60 ? `${n} ${n === 1 ? 'second' : 'seconds'}` : `${Math.ceil(n / 60)} minutes`)

const BY_CODE: Record<string, UploadErrorView> = {
  'not-a-pdf': { message: "That file isn't a PDF.", retry: false },
  'not-a-bank-statement': { message: "This PDF doesn't look like a bank or card statement.", retry: false },
  'no-text': { message: 'This PDF has no readable text. It may be a scan.', retry: false },
  'pdf-protected': { message: 'This PDF is password-protected. Remove the password and upload it again.', retry: false },
  'extraction-failed': { message: AGAIN, retry: true },
  'extraction-timeout': { message: AGAIN, retry: true },
  'extraction-unavailable': { message: "Reading PDFs isn't available right now.", retry: false },
}

/** Spec §4.3: what to tell the user when reading a PDF fails. Null means "show it with ProblemAlert". */
export function uploadError(error: unknown): UploadErrorView | null {
  if (error instanceof ApiTimeoutError) return { message: AGAIN, retry: true }
  if (!(error instanceof ApiError)) return null
  const code = problemCode(error.problem)
  if (code && BY_CODE[code]) return BY_CODE[code]
  const detail = error.problem.detail ?? error.problem.title
  // The API words its size limit in bytes; its page limit reads well as it is.
  if (code === 'file-too-large') return { message: /pages?\b/i.test(detail) ? detail : TOO_BIG, retry: false }
  if (error.problem.status === 413) return { message: TOO_BIG, retry: false }
  if (code === 'too-many-extractions') {
    const wait = retryAfterSeconds(error.headers)
    return wait ? { message: `${detail} Try again in ${waitText(wait)}.`, retry: true, waitSeconds: wait } : { message: detail, retry: true }
  }
  return null
}

/** For failures without a view: trying again can only help when the server or the network was at fault. */
export const canRetry = (error: unknown) => !(error instanceof ApiError) || error.problem.status >= 500
