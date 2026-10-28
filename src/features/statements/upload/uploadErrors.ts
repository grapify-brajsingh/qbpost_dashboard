import { ApiTimeoutError } from '@/api/client'
import { ApiError, problemCode } from '@/api/problem'

export interface UploadErrorView {
  message: string
  /** Offer "Try again" with the same file. */
  retry: boolean
}

const AGAIN = "We couldn't read the statement this time."

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
  if (code === 'file-too-large') return { message: detail, retry: false }
  if (code === 'too-many-extractions') return { message: detail, retry: true }
  return null
}
