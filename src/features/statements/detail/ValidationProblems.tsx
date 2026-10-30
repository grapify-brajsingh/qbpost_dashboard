import { CircleAlertIcon } from 'lucide-react'
import type { Finding, RequestDetail, Txn, ValidationSnapshot } from '@/api/schema'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { findingsByRow, tableShape } from '@/features/requests/transactions/findings'
import { friendlyError } from './validationText'

const TITLE: Record<ValidationSnapshot['state'], string> = {
  ok: 'Validation found problems',
  held: "Some problems aren't on a row",
  refused: "This statement can't be posted",
  unreadable: 'This statement could not be read',
  unavailable: 'Validation is unavailable',
}

/**
 * The problems no row can show: `validation.errors` and findings that match no row. A refusal stops the API before it
 * looks at rows, so more problems can appear on the rows once these are fixed. All text is rendered as React text.
 */
export function ValidationProblems({ request, findings }: { request: RequestDetail; findings?: Finding[] }) {
  const v = request.validation
  const rows = tableShape(request.payload) === 'table' ? (request.payload.transactions as Txn[]) : []
  const unmatched = findingsByRow(rows, findings ?? v.validation ?? []).get(-1) ?? []
  const errors = v.errors ?? []
  if (errors.length === 0 && unmatched.length === 0) return null
  return (
    <Alert role="alert" aria-label="Validation problems" variant="destructive">
      <CircleAlertIcon aria-hidden />
      <AlertTitle>{TITLE[v.state]}</AlertTitle>
      <AlertDescription className="gap-1.5">
        <ul className="list-disc space-y-1 pl-5 text-foreground/85">
          {errors.map((e, i) => (
            <li key={`e${i}`} className="break-words">
              {friendlyError(e)}
            </li>
          ))}
          {unmatched.map((f, i) => (
            <li key={`f${i}`} className="break-words">
              {f.externalId ? `${f.externalId}: ` : ''}
              {f.reason}
              {f.detail ? ` — ${f.detail}` : ''}
            </li>
          ))}
        </ul>
        {v.versionNumber !== undefined && v.versionNumber < request.currentVersion && (
          <p className="font-medium">Validation is out of date</p>
        )}
      </AlertDescription>
    </Alert>
  )
}
