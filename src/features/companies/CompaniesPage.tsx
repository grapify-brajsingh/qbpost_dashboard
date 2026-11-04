import { useIsMutating } from '@tanstack/react-query'
import { BuildingIcon, FolderXIcon, Loader2Icon, RefreshCwIcon, ServerOffIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useCheckCompany, useCompanies, useScanCompanies, useUpdateCompany } from '@/api/queries/companies'
import { hasScope, useSession } from '@/auth/useSession'
import { DataPanel, EmptyState, TableSkeleton } from '@/components/DataPanel'
import { PageHeader } from '@/components/PageHeader'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { formatRelative, formatTimestamp } from '@/lib/dates'
import { ApprovalHelp } from './ApprovalHelp'
import { ChooseFileDialog } from './ChooseFileDialog'
import { CompaniesTable } from './CompaniesTable'
import { checkAccessToast, rootUnreachableError, scanToastText } from './companiesView'
import { MatchNamesDialog } from './MatchNamesDialog'

type Dialog = { kind: 'names' | 'file'; id: number }

/** Sync: re-reads the company folders. The running state comes from the mutation cache, so it survives navigation. */
function SyncButton({ onSync }: { onSync: () => void }) {
  const running = useIsMutating({ mutationKey: ['companies', 'scan'] }) > 0
  return (
    <Button onClick={onSync} disabled={running}>
      {running ? <Loader2Icon className="animate-spin" aria-hidden /> : <RefreshCwIcon aria-hidden />}
      {running ? 'Scanning…' : 'Sync'}
    </Button>
  )
}

/**
 * The company files the API found under its root folder, their QuickBooks access and lists, and (for admins) Sync,
 * Check access, match names, file choice and disabling (R-18). Every role with `lists:read` can read it.
 */
export function CompaniesPage() {
  const { me } = useSession()
  const isAdmin = hasScope(me, 'requests:admin')
  const companies = useCompanies()
  const scan = useScanCompanies()
  const check = useCheckCompany()
  const update = useUpdateCompany()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const data = companies.data
  const items = data?.items ?? []
  const dialogCompany = dialog ? items.find((c) => c.id === dialog.id) : undefined

  function sync() {
    scan.mutate(undefined, { onSuccess: (r) => toast.success(scanToastText(r)) })
  }

  function checkAccess(id: number) {
    const say = (r: unknown) => {
      const t = checkAccessToast(r)
      toast[t.level](t.text)
    }
    check.mutate({ id }, { onSuccess: say, onError: say })
  }

  const syncButton = isAdmin ? <SyncButton onSync={sync} /> : undefined
  const table = (
    <DataPanel>
      <CompaniesTable
        items={items}
        isAdmin={isAdmin}
        checkingId={check.isPending ? check.variables?.id : undefined}
        onCheck={(c) => checkAccess(c.id)}
        onEditNames={(c) => setDialog({ kind: 'names', id: c.id })}
        onChooseFile={(c) => setDialog({ kind: 'file', id: c.id })}
        onToggleDisabled={(c) =>
          update.mutate({ id: c.id, rowVersion: c.rowVersion, patch: { disabled: c.state !== 'disabled' } })
        }
      />
    </DataPanel>
  )

  let body: ReactNode
  if (companies.isPending) {
    body = (
      <DataPanel>
        <TableSkeleton columns={6} />
      </DataPanel>
    )
  } else if (companies.isError) {
    body = (
      <div className="grid justify-items-start gap-3">
        <ProblemAlert error={companies.error} />
        <Button variant="outline" size="sm" onClick={() => void companies.refetch()}>
          Try again
        </Button>
      </div>
    )
  } else if (!data) {
    body = (
      <DataPanel>
        <EmptyState icon={ServerOffIcon} title="Companies need a newer API." />
      </DataPanel>
    )
  } else if (!data.rootConfigured) {
    body = (
      <>
        <DataPanel>
          <EmptyState
            icon={FolderXIcon}
            title="No company folder is set."
            description={
              <>
                Set <code>Companies:RootFolder</code> in the API's appsettings.json.
              </>
            }
          />
        </DataPanel>
        {items.length > 0 && table}
      </>
    )
  } else if (!data.rootReachable) {
    body = (
      <div className="grid justify-items-start gap-3">
        <ProblemAlert error={rootUnreachableError(data.rootFolder ?? '')} />
        <Button variant="outline" size="sm" onClick={() => void companies.refetch()}>
          Try again
        </Button>
      </div>
    )
  } else if (items.length === 0) {
    body = (
      <DataPanel>
        <EmptyState
          icon={BuildingIcon}
          title={`No company files found in ${data.rootFolder}.`}
          description="Each company needs its own subfolder with a .qbw file."
          action={syncButton}
        />
      </DataPanel>
    )
  } else {
    body = (
      <>
        <ApprovalHelp companies={items.filter((c) => c.access === 'needs-approval')} />
        {table}
      </>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Companies"
        description={
          data?.rootFolder ? (
            <>
              Company files found in <code>{data.rootFolder}</code> on the QuickBooks server.
              {data.lastScanUtc && (
                <>
                  {' '}
                  <span title={formatTimestamp(data.lastScanUtc)}>Last scanned {formatRelative(data.lastScanUtc)}</span>
                </>
              )}
            </>
          ) : undefined
        }
        actions={data?.rootConfigured && items.length > 0 ? syncButton : undefined}
      />
      {scan.isError && <ProblemAlert error={scan.error} />}
      {update.isError && <ProblemAlert error={update.error} />}
      {body}

      {dialogCompany && dialog?.kind === 'names' && (
        <MatchNamesDialog company={dialogCompany} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
      {dialogCompany && dialog?.kind === 'file' && (
        <ChooseFileDialog company={dialogCompany} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
    </div>
  )
}
