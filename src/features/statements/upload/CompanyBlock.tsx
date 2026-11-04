import { useState } from 'react'
import type { Company, ExtractionCompany } from '@/api/schema'
import { CompanySelect } from '@/components/CompanySelect'
import { Button } from '@/components/ui/button'
import { assignableCompanies } from '@/features/companies/companiesView'

interface Props {
  /** The server's reading of the printed name; undefined on an older API, which hides the block. */
  match: ExtractionCompany | undefined
  /** undefined while loading or when the API has no companies endpoint: no select is offered. */
  companies: readonly Company[] | undefined
  /** The company the user picked; undefined while the server's match (if any) stands. */
  value: number | undefined
  onChange: (id: number | undefined) => void
  disabled?: boolean
}

/** The company this upload belongs to: what the statement said, and a picker when it needs one (spec §3.5). */
export function CompanyBlock({ match, companies, value, onChange, disabled }: Props) {
  const [editing, setEditing] = useState(false)
  if (!match) return null

  const candidateIds = match.candidates.map((c) => c.id)
  const printed = match.printedName
  const matchedName = match.match === 'matched' ? (match.candidates.find((c) => c.id === match.companyId) ?? match.candidates[0])?.displayName : undefined
  const showPicker = match.match !== 'matched' || editing

  let note: React.ReactNode = null
  if (match.match === 'ambiguous') note = 'More than one company matches'
  else if (match.match === 'none') {
    note = printed ? (
      <>
        No company matched the printed name <em>{printed}</em>
      </>
    ) : (
      'No business name was found on the statement'
    )
  }

  const options = companies ? assignableCompanies(companies, match.match === 'none' ? [] : candidateIds) : undefined

  return (
    <div className="grid gap-1.5">
      <span className="text-sm leading-none font-medium">Company</span>
      {match.match === 'matched' && !editing && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{matchedName ?? 'Matched company'}</span>
          <Button type="button" size="sm" variant="outline" disabled={disabled || !options} onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      )}
      {match.match === 'matched' && printed && (
        <p className="text-xs text-muted-foreground">
          Read from statement: <em>{printed}</em>
        </p>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {showPicker && options && (
        <>
          <CompanySelect
            label="Company"
            emptyLabel="Choose a company"
            companies={options}
            value={value ?? (match.match === 'matched' ? (match.companyId ?? undefined) : undefined)}
            onChange={onChange}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">Optional. Without a company the statement waits until someone chooses one.</p>
        </>
      )}
    </div>
  )
}
