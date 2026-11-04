import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/problem'
import { useSetCompany } from '@/api/queries/requests'
import type { Company, RequestDetail } from '@/api/schema'
import { CompanySelect } from '@/components/CompanySelect'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { assignableCompanies } from '@/features/companies/companiesView'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: RequestDetail
  /** ETag of the statement on screen, sent as If-Match. */
  etag: string
  companies: readonly Company[]
}

/** R-19: assigns the statement to a company. Active companies only, the printed-name candidates first. */
export function ChooseCompanyDialog({ open, onOpenChange, request, etag, companies }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <Body request={request} etag={etag} companies={companies} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** A 412 reloads the statement (the mutation invalidates it); say so in the app's usual stale wording. */
function shownError(error: unknown): unknown {
  if (error instanceof ApiError && error.problem.status === 412) {
    return new ApiError({ title: 'This changed since you opened it.', status: 412, detail: 'The latest version was reloaded.' }, error.headers)
  }
  return error
}

function Body({ request, etag, companies, onClose }: Omit<Props, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const [companyId, setCompanyId] = useState<number | undefined>()
  const assign = useSetCompany(String(request.id))
  const options = assignableCompanies(companies, request.companyMatch?.candidates)
  const chosen = options.find((c) => c.id === companyId)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose company</DialogTitle>
        <DialogDescription>The QuickBooks company file this statement posts to.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <CompanySelect label="Company" emptyLabel="Choose a company" companies={options} value={chosen?.id} onChange={setCompanyId} />
        {request.validationSummary.state !== 'none' && <p className="text-sm text-muted-foreground">Validation will be cleared</p>}
      </div>
      {assign.error && <ProblemAlert error={shownError(assign.error)} />}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!chosen || assign.isPending}
          onClick={() =>
            chosen &&
            assign.mutate(
              { companyId: chosen.id, etag },
              {
                onSuccess: () => {
                  onClose()
                  toast.success(`Assigned to ${chosen.displayName}`)
                },
              },
            )
          }
        >
          Assign company
        </Button>
      </DialogFooter>
    </>
  )
}
