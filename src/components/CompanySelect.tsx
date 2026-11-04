import type { Company } from '@/api/schema'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { companyLabel } from '@/features/companies/companiesView'

/**
 * A company picker for filters and statement actions. Options keep the order given (callers sort with
 * `assignableCompanies`); `emptyLabel` adds the "nothing chosen" option, which reports `undefined`.
 */
export function CompanySelect({
  companies,
  value,
  onChange,
  label,
  id,
  emptyLabel,
  disabled,
  size,
}: {
  companies: readonly Company[]
  value: number | undefined
  onChange: (id: number | undefined) => void
  label: string
  id?: string
  /** 'All companies' for a filter, 'Choose a company' for an assignment. */
  emptyLabel?: string
  disabled?: boolean
  size?: 'sm' | 'default'
}) {
  return (
    <NativeSelect
      id={id}
      aria-label={label}
      size={size}
      // A long company name must not push the page sideways at 375 px.
      wrapperClassName="max-w-full"
      disabled={disabled}
      value={value === undefined ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    >
      {emptyLabel !== undefined && <NativeSelectOption value="">{emptyLabel}</NativeSelectOption>}
      {companies.map((c) => (
        <NativeSelectOption key={c.id} value={String(c.id)}>
          {companyLabel(c)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
