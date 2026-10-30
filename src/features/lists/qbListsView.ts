import type { QbListCounts, QbListSync, QbListSyncFilters, QbListSyncRun } from '@/api/schema'

/** QuickBooks `AccountType` ("OtherCurrentAsset") as words ("Other current asset"); a dash when unknown. */
export function accountTypeLabel(type: string | null): string {
  if (!type) return '—'
  const words = type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words[0].toUpperCase() + words.slice(1)
}

const byName = new Intl.Collator(undefined, { sensitivity: 'base' })

/** Items whose name contains `search` (case-insensitive, outer spaces ignored), sorted by name. */
export function filterNames<T>(items: readonly T[], search: string, name: (item: T) => string): T[] {
  const q = search.trim().toLowerCase()
  return items.filter((i) => !q || name(i).toLowerCase().includes(q)).sort((a, b) => byName.compare(name(a), name(b)))
}

/** Who or what started a sync attempt. */
export function startedByLabel(run: Pick<QbListSyncRun, 'trigger' | 'requestedBy'>): string {
  switch (run.trigger) {
    case 'schedule':
      return 'Automatic'
    case 'dashboard':
      return run.requestedBy?.displayName ?? 'Sync now'
    case 'api':
      return 'API'
    case 'import':
      return 'Imported from file'
  }
}

export type OutcomeTone = 'success' | 'warning' | 'danger'

const OUTCOMES: Record<QbListSync['outcome'], { label: string; tone: OutcomeTone }> = {
  ok: { label: 'Synced', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
}

export function outcomeView(outcome: QbListSync['outcome']): { label: string; tone: OutcomeTone } {
  return OUTCOMES[outcome]
}

/** How long an attempt took: "0.4 s", "13 s", "1 min 52 s". */
export function durationText(startedUtc: string, finishedUtc: string): string {
  const ms = Math.max(0, Date.parse(finishedUtc) - Date.parse(startedUtc))
  if (ms < 10_000) return `${ms === 0 ? 0 : (ms / 1000).toFixed(1).replace(/\.0$/, '')} s`
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} s`
  const min = Math.floor(total / 60)
  const sec = total % 60
  return sec ? `${min} min ${sec} s` : `${min} min`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function countsText(counts: QbListCounts | null): string {
  if (!counts) return '—'
  return [plural(counts.accounts, 'account'), plural(counts.vendors, 'vendor'), plural(counts.customers, 'customer')].join(' · ')
}

/** The Sync history filters as kept in the URL. */
export const STARTED_BY = ['automatic', 'manual', 'imported'] as const
export const RESULTS = ['ok', 'skipped', 'failed'] as const

const TRIGGERS: Record<(typeof STARTED_BY)[number], QbListSyncFilters['trigger']> = {
  automatic: ['schedule'],
  manual: ['dashboard', 'api'],
  imported: ['import'],
}

/** The page's filters as the history query (`trigger`, `outcome`, `page`). */
export function syncFiltersFrom(
  f: { by?: (typeof STARTED_BY)[number]; result?: (typeof RESULTS)[number] },
  page: number,
): QbListSyncFilters {
  return { trigger: f.by ? TRIGGERS[f.by] : [], outcome: f.result ? [f.result] : [], page }
}
