import { BookOpenIcon, SearchXIcon } from 'lucide-react'
import type { QbListsResponse } from '@/api/schema'
import { EmptyState } from '@/components/DataPanel'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { accountTypeLabel, filterNames } from './qbListsView'

export type ListKind = 'accounts' | 'vendors' | 'customers'

const TITLE: Record<ListKind, string> = { accounts: 'Accounts', vendors: 'Vendors', customers: 'Customers' }
const NOUN: Record<ListKind, { one: string; many: string }> = {
  accounts: { one: 'account', many: 'accounts' },
  vendors: { one: 'vendor', many: 'vendors' },
  customers: { one: 'customer', many: 'customers' },
}

/** No names at all: the lists were never synced (or QuickBooks has none of anything). */
export function NeverSynced({ canSync }: { canSync: boolean }) {
  return (
    <EmptyState
      icon={BookOpenIcon}
      title="No QuickBooks lists yet"
      description={canSync ? 'Press Sync now while QuickBooks is open.' : 'Ask an editor to sync them.'}
    />
  )
}

/** One list's names (accounts with their QuickBooks type), filtered by the page search and, for accounts, the type. */
export function NamesTable({
  kind,
  lists,
  search,
  type,
  onClearSearch,
}: {
  kind: ListKind
  lists: QbListsResponse
  search: string
  type?: string
  onClearSearch: () => void
}) {
  const noun = NOUN[kind]
  const rows =
    kind === 'accounts'
      ? filterNames(
          lists.accounts.filter((a) => !type || a.type === type),
          search,
          (a) => a.name,
        )
      : filterNames(lists[kind], search, (n) => n).map((name) => ({ name, type: null }))
  const of = kind === 'accounts' && type ? lists.accounts.filter((a) => a.type === type).length : lists[kind].length

  if (lists[kind].length === 0) {
    return <EmptyState icon={BookOpenIcon} title={`QuickBooks has no active ${noun.many}`} />
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title={search.trim() ? `No ${noun.many} match "${search.trim()}".` : `No ${noun.many} of this type.`}
        action={
          search.trim() ? (
            <Button variant="outline" size="sm" onClick={onClearSearch}>
              Clear search
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <>
      <Table aria-label={TITLE[kind]}>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            {kind === 'accounts' && <TableHead className="w-48">Type</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="break-words whitespace-normal">{r.name}</TableCell>
              {kind === 'accounts' && <TableCell className="text-muted-foreground">{accountTypeLabel(r.type)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
        Showing {rows.length} of {of} {of === 1 ? noun.one : noun.many}
      </p>
    </>
  )
}
