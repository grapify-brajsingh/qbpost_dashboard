import { useContext } from 'react'
import { Link, useMatches } from 'react-router'
import { BreadcrumbContext } from './useBreadcrumb'

export type CrumbHandle = { crumb?: string | ((data: unknown) => string) }

export function Breadcrumb() {
  const matches = useMatches()
  const { title } = useContext(BreadcrumbContext)
  const crumbs = matches.flatMap((m) => {
    const crumb = (m.handle as CrumbHandle | undefined)?.crumb
    if (crumb === undefined) return []
    return [{ to: m.pathname, label: typeof crumb === 'function' ? crumb(m.data) : crumb }]
  })
  if (crumbs.length === 0) return null
  // The deepest crumb belongs to the page; it may supply a better label (the statement's reference).
  const last = crumbs.length - 1
  if (title) crumbs[last] = { ...crumbs[last], label: title }
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex items-center gap-1.5">
        {crumbs.map((c, i) => (
          <li key={c.to} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === last ? (
              <b aria-current="page" title={c.label} className="block max-w-[40ch] truncate font-medium text-foreground">
                {c.label}
              </b>
            ) : (
              <Link to={c.to} className="hover:text-foreground">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
