import { createContext, useContext, useEffect } from 'react'

export interface BreadcrumbValue {
  title: string | null
  setTitle(title: string | null): void
}

export const BreadcrumbContext = createContext<BreadcrumbValue>({ title: null, setTitle: () => {} })

/** A page sets the label of its own (last) crumb, e.g. the statement's reference. Cleared when the page unmounts. */
export function useBreadcrumb(title: string): void {
  const { setTitle } = useContext(BreadcrumbContext)
  useEffect(() => {
    setTitle(title)
    return () => setTitle(null)
  }, [title, setTitle])
}
