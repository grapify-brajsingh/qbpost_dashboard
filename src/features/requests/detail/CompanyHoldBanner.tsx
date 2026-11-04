import { Building2Icon } from 'lucide-react'
import type { RequestDetail } from '@/api/schema'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * R-19: a statement with no company cannot be validated or posted. Shown only when the API says `company: null`; an
 * older API without the key (unknown) shows nothing. `onChoose` is given only when `allowedActions` has `set-company`.
 * Only a pending statement (or one the API still lets you assign) is on hold: a discarded or posted one is not waiting.
 */
export function CompanyHoldBanner({ request, onChoose }: { request: RequestDetail; onChoose?: () => void }) {
  if (request.company !== null) return null
  if (request.status !== 'pending' && !request.allowedActions.includes('set-company')) return null
  const printed = request.companyMatch?.printedName
  return (
    <Alert variant="warning" aria-label="Company hold">
      <Building2Icon aria-hidden />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-current">
        <p>
          Choose the company before validating or posting.
          {printed && (
            <>
              {' '}
              The printed name on this statement was <em>{printed}</em>.
            </>
          )}
        </p>
        {onChoose && (
          <Button type="button" size="sm" variant="outline" onClick={onChoose}>
            Choose company
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
