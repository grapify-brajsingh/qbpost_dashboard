import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type SheetTab = 'results' | 'history' | 'versions'
const TABS: readonly SheetTab[] = ['results', 'history', 'versions']

/**
 * The sheet's state lives in the URL (`sheet=<id>&sheetTab=…`) so Back closes it. Only those two params are
 * touched: filters, tab, sort and `page` stay as they are. Garbage reads as closed / the Results tab.
 */
export function useStatementSheet() {
  const [search, setSearch] = useSearchParams()
  const raw = search.get('sheet')
  const n = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN
  const id = Number.isSafeInteger(n) && n > 0 ? n : null
  const rawTab = search.get('sheetTab')
  const tab: SheetTab = TABS.find((t) => t === rawTab) ?? 'results'

  const write = useCallback(
    (next: { id: number; tab: SheetTab } | null, replace: boolean) =>
      setSearch(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next) {
            p.set('sheet', String(next.id))
            p.set('sheetTab', next.tab)
          } else {
            p.delete('sheet')
            p.delete('sheetTab')
          }
          return p
        },
        { replace },
      ),
    [setSearch],
  )

  const open = useCallback((sheetId: number, sheetTab: SheetTab) => write({ id: sheetId, tab: sheetTab }, false), [write])
  const close = useCallback(() => write(null, true), [write])
  const setTab = useCallback((sheetTab: SheetTab) => id !== null && write({ id, tab: sheetTab }, true), [id, write])

  return { id, tab, open, close, setTab }
}
