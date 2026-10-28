/** A `?page=` value as a page number: a safe integer from 1 to 1,000,000, else 1. */
export function parsePage(raw: string | null | undefined): number {
  const n = Math.floor(Number(raw))
  return Number.isSafeInteger(n) && n >= 1 && n <= 1_000_000 ? n : 1
}
