/** One plain-text summary of a company folder scan, e.g. "2 new, 1 missing"; "no changes" when every count is zero. */
export function scanSummaryText(c: { added: number; updated: number; missing: number; ambiguous: number }): string {
  const parts = [
    c.added > 0 ? `${c.added} new` : null,
    c.updated > 0 ? `${c.updated} updated` : null,
    c.missing > 0 ? `${c.missing} missing` : null,
    c.ambiguous > 0 ? `${c.ambiguous} with several files` : null,
  ].filter((p): p is string => p !== null)
  return parts.length ? parts.join(', ') : 'no changes'
}
