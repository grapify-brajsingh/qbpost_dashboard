import { useCompanies } from '@/api/queries/companies'
import { useQbListsDetail } from '@/api/queries/lists'
import { hasScope, useSession } from '@/auth/useSession'
import { CompanySelect } from '@/components/CompanySelect'
import { DataPanel, TableSkeleton } from '@/components/DataPanel'
import { FilterChip, SearchBox, useUrlFilters } from '@/components/filters'
import { PageHeader } from '@/components/PageHeader'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { defaultCompanyId } from '@/features/companies/companiesView'
import { QbListsStatus } from '@/features/requests/transactions/QbListsStatus'
import { NamesTable, NeverSynced, type ListKind } from './NamesTable'
import { accountTypeLabel, RESULTS, STARTED_BY } from './qbListsView'
import { SyncHistory } from './SyncHistory'

const TABS = ['accounts', 'vendors', 'customers', 'history'] as const
type Tab = (typeof TABS)[number]
const NAME_TABS: { id: ListKind; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'customers', label: 'Customers' },
]

// Module level: useUrlFilters memoises on the spec's identity.
const FILTER_SPEC = {
  tab: { kind: 'enum', values: TABS },
  q: { kind: 'text' },
  type: { kind: 'text' },
  by: { kind: 'enum', values: STARTED_BY },
  result: { kind: 'enum', values: RESULTS },
  company: { kind: 'text' },
} as const

const triggerClass =
  'group/tab h-10 flex-none px-3 after:bg-primary group-data-[orientation=horizontal]/tabs:after:bottom-0 data-[state=active]:text-foreground'
const countClass =
  'rounded-md bg-muted px-1.5 py-px text-xs font-medium text-muted-foreground tabular-nums transition-colors group-data-[state=active]/tab:bg-primary-soft group-data-[state=active]/tab:text-primary'

/**
 * The QuickBooks names the review checks against (accounts with their type, vendors, customers), how fresh they are
 * with Sync now, and every sync attempt (R-16, R-17). Every role reads it; Sync now is for `requests:edit`.
 */
export function ListsPage() {
  const { me } = useSession()
  const canSync = hasScope(me, 'requests:edit')
  const filters = useUrlFilters(FILTER_SPEC)
  const f = filters.values
  // null on an older API: no selector, and the lists load without `company`.
  const companies = useCompanies()
  const items = companies.data?.items ?? []
  const defaultId = defaultCompanyId(companies.data)
  // An id in the URL that is not (or no longer) a company falls back to the default; it is never sent.
  const urlId = f.company !== undefined && /^[1-9]\d*$/.test(f.company) ? Number(f.company) : undefined
  const company = urlId !== undefined && items.some((c) => c.id === urlId) ? urlId : defaultId
  // Wait for the companies to settle, so the default company is never fetched first and then the right one.
  const lists = useQbListsDetail(company, { enabled: !companies.isPending })
  const tab: Tab = f.tab ?? 'accounts'
  const data = lists.data
  const neverSynced = !!data && data.syncedUtc === null && !data.accounts.length && !data.vendors.length && !data.customers.length
  const types = data ? [...new Set(data.accounts.map((a) => a.type).filter((t): t is string => !!t))].sort() : []

  return (
    <div className="page">
      <PageHeader
        title="QuickBooks lists"
        description={
          data && data.nextSyncUtc === null
            ? 'The accounts, vendors and customers the review checks names against. Automatic sync is off; use Sync now.'
            : 'The accounts, vendors and customers the review checks names against. The server syncs them from QuickBooks every 30 minutes while QuickBooks is open.'
        }
        actions={
          !companies.isPending && (
            <>
              {items.length > 1 && (
                <CompanySelect
                  label="Company"
                  size="sm"
                  companies={items}
                  value={company}
                  onChange={(id) => filters.set({ company: id === defaultId || id === undefined ? undefined : String(id) })}
                />
              )}
              <QbListsStatus company={company} />
            </>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => filters.set({ tab: v === 'accounts' ? undefined : (v as Tab) })}>
        <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none] md:mx-0 md:px-0">
          <TabsList variant="line" className="h-10 w-full min-w-max justify-start gap-1 rounded-none border-b p-0">
            {NAME_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className={triggerClass}>
                {t.label}
                {data && (
                  <>
                    {' '}
                    <span className={countClass}>{data[t.id].length}</span>
                  </>
                )}
              </TabsTrigger>
            ))}
            <TabsTrigger value="history" className={triggerClass}>
              Sync history
            </TabsTrigger>
          </TabsList>
        </div>

        {NAME_TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-4 grid gap-4">
            {data && !neverSynced && (
              <div role="search" aria-label="Name filters" className="flex flex-wrap items-center gap-2">
                <SearchBox
                  value={f.q}
                  onChange={(v) => filters.set({ q: v.trim() || undefined })}
                  label="Search names"
                  placeholder={`Search ${t.label.toLowerCase()}`}
                />
                {t.id === 'accounts' && (
                  <FilterChip
                    label="Type"
                    value={f.type}
                    options={types.map((ty) => ({ value: ty, label: accountTypeLabel(ty) }))}
                    onChange={(v) => filters.set({ type: v })}
                  />
                )}
              </div>
            )}
            {lists.isError && !data ? (
              <div className="grid justify-items-start gap-3">
                <ProblemAlert error={lists.error} />
                <Button variant="outline" size="sm" onClick={() => void lists.refetch()}>
                  Try again
                </Button>
              </div>
            ) : (
              <DataPanel>
                {!data ? (
                  <TableSkeleton columns={2} rows={8} />
                ) : neverSynced ? (
                  <NeverSynced canSync={canSync} />
                ) : (
                  <NamesTable
                    kind={t.id}
                    lists={data}
                    search={f.q ?? ''}
                    type={t.id === 'accounts' ? f.type : undefined}
                    onClearSearch={() => filters.set({ q: undefined })}
                  />
                )}
              </DataPanel>
            )}
          </TabsContent>
        ))}

        <TabsContent value="history" className="mt-4">
          {!companies.isPending && (
            <SyncHistory company={company} by={f.by} result={f.result} onFilter={(patch) => filters.set(patch)} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
