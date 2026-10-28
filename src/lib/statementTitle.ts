import type { EmailMeta, UploadMeta } from '@/api/schema'

/**
 * What a statement is called before falling back to its reference or SR ref: the email subject, else the uploaded
 * file name (R-14.4). Null when it has neither, so each caller keeps its own last fallback.
 */
export function statementSubject(r: { email: EmailMeta | null; upload?: UploadMeta | null }): string | null {
  const subject = r.email?.subject?.trim()
  if (subject) return r.email!.subject
  return r.upload?.fileName ?? null
}
