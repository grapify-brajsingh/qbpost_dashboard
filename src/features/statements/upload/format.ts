/** "412 KB", "1.2 MB": file sizes for people, not bytes. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** The file name without `.pdf`, as a starting reference the user can change. */
export const referenceFromFileName = (name: string) => name.replace(/\.pdf$/i, '').trim()

/** A starting reference the API accepts: spaces become `-`, other characters go, at most 64 characters. */
export const cleanReference = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 64)

/** The API's limit (R-13.2); checked here too so a wrong file is never sent. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024

/** Why this file cannot be uploaded, or null. */
export function fileProblem(files: FileList | File[]): string | null {
  if (files.length !== 1) return 'Choose one PDF at a time.'
  const file = files[0]
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return "That file isn't a PDF."
  if (file.size > MAX_PDF_BYTES) return 'The PDF is larger than 10 MB.'
  return null
}
