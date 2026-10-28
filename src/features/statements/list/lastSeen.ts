const KEY = 'qbpost.statements.lastSeen'

/** When the user last left the Statements page (ISO UTC), or null. Storage may be blocked: every access is guarded. */
export const lastSeen = {
  read(): string | null {
    try {
      const v = localStorage.getItem(KEY)
      return v && !Number.isNaN(Date.parse(v)) ? v : null
    } catch {
      return null
    }
  },
  markNow(): void {
    try {
      localStorage.setItem(KEY, new Date().toISOString())
    } catch {
      // Without storage there are simply no "new" dots.
    }
  },
}
