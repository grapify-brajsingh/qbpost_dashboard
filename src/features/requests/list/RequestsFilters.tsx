import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Values are what the API's `source` filter matches (the API client id, or the kind for dashboard users).
const SOURCES = [
  { label: 'Any', value: '' },
  { label: 'n8n', value: 'n8n-mailbox' },
  { label: 'Dashboard user', value: 'user' },
]

export interface FilterValues {
  q: string
  receivedFrom: string
  receivedTo: string
  source: string
}

export function RequestsFilters({
  values,
  onQChange,
  onChange,
}: {
  values: FilterValues
  onQChange: (q: string) => void
  onChange: (patch: Partial<Omit<FilterValues, 'q'>>) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="grid gap-1">
        <Label htmlFor="req-search">Search</Label>
        <Input
          id="req-search"
          type="search"
          className="w-72"
          placeholder="Reference, SR-number, payee, memo, subject"
          value={values.q}
          onChange={(e) => onQChange(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="req-from">Received from</Label>
        <Input id="req-from" type="date" value={values.receivedFrom} onChange={(e) => onChange({ receivedFrom: e.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="req-to">Received to</Label>
        <Input id="req-to" type="date" value={values.receivedTo} onChange={(e) => onChange({ receivedTo: e.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="req-source">Source</Label>
        <select
          id="req-source"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs dark:bg-input/30"
          value={values.source}
          onChange={(e) => onChange({ source: e.target.value })}
        >
          {SOURCES.map((s) => (
            <option key={s.label} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
