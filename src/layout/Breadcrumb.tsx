import { Fragment, useContext } from 'react'
import { Link, useMatches } from 'react-router'
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
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
    <BreadcrumbRoot aria-label="Breadcrumb" className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((c, i) => (
          <Fragment key={c.to}>
            {i > 0 && <BreadcrumbSeparator className="hidden sm:block" />}
            <BreadcrumbItem className={i === last ? 'min-w-0' : 'hidden shrink-0 sm:inline-flex'}>
              {i === last ? (
                <BreadcrumbPage title={c.label} className="block max-w-[48ch] truncate font-medium">
                  {c.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={c.to}>{c.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </BreadcrumbRoot>
  )
}
