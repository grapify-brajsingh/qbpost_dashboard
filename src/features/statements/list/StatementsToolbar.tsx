import { ClearFilters, DateRangeChip, FilterChip, SearchBox } from '@/components/filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Stats } from '@/api/schema'
import { countFor, STATUS_TABS, type StatusTab } from './statusTabs'

export interface ToolbarFilters {
  q?: string
  receivedFrom?: string
  receivedTo?: string
  reference?: string
  emailFrom?: string
  minTotal?: number
  maxTotal?: number
  duplicate?: boolean
}

export function StatusTabs({
  value,
  stats,
  isAdmin,
  onChange,
}: {
  value: StatusTab
  stats: Stats | undefined
  isAdmin: boolean
  onChange: (tab: StatusTab) => void
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as StatusTab)}>
      <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        <TabsList variant="line" className="h-10 w-full min-w-max justify-start gap-1 rounded-none border-b p-0">
          {STATUS_TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="group/tab h-10 flex-none px-3 after:bg-primary group-data-[orientation=horizontal]/tabs:after:bottom-0 data-[state=active]:text-foreground"
            >
              {t.label}
              {stats && (
                <>
                  {' '}
                  <span className="rounded-md bg-muted px-1.5 py-px text-xs font-medium text-muted-foreground tabular-nums transition-colors group-data-[state=active]/tab:bg-primary-soft group-data-[state=active]/tab:text-primary">
                    {countFor(t.id, stats, isAdmin)}
                  </span>
                </>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
}

/** A chip whose popover takes one typed value, applied with Enter or the button. */
function TextChip({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <FilterChip label={label} value={value} onChange={onChange}>
      <form
        className="grid gap-2 p-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = String(new FormData(e.currentTarget).get('value') ?? '').trim()
          onChange(v || undefined)
        }}
      >
        <Input name="value" aria-label={label} defaultValue={value ?? ''} />
        <Button type="submit" size="sm">
          Apply
        </Button>
      </form>
    </FilterChip>
  )
}

function parseAmount(raw: FormDataEntryValue | null): number | undefined {
  const s = String(raw ?? '').trim()
  return s === '' || !Number.isFinite(Number(s)) ? undefined : Number(s)
}

function TotalChip({
  min,
  max,
  onChange,
}: {
  min?: number
  max?: number
  onChange: (range: { minTotal?: number; maxTotal?: number }) => void
}) {
  const shown = min !== undefined || max !== undefined ? `${min ?? ''}–${max ?? ''}` : undefined
  return (
    <FilterChip label="Total" value={shown} onChange={() => onChange({ minTotal: undefined, maxTotal: undefined })}>
      <form
        className="grid gap-2 p-2"
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          onChange({ minTotal: parseAmount(f.get('min')), maxTotal: parseAmount(f.get('max')) })
        }}
      >
        <Input name="min" type="number" step="any" aria-label="Minimum total" placeholder="Min" defaultValue={min ?? ''} />
        <Input name="max" type="number" step="any" aria-label="Maximum total" placeholder="Max" defaultValue={max ?? ''} />
        <Button type="submit" size="sm">
          Apply
        </Button>
      </form>
    </FilterChip>
  )
}

const DUPLICATE_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

export function StatementsToolbar({
  filters,
  onSet,
  onClear,
  activeCount,
}: {
  filters: ToolbarFilters
  onSet: (patch: Partial<ToolbarFilters>) => void
  onClear: () => void
  activeCount: number
}) {
  return (
    <div role="search" aria-label="Filters" className="flex flex-wrap items-center gap-2">
      <SearchBox
        value={filters.q}
        onChange={(v) => onSet({ q: v.trim() || undefined })}
        label="Search"
        placeholder="Search reference, subject, payee, memo"
      />
      <DateRangeChip
        label="Received"
        from={filters.receivedFrom}
        to={filters.receivedTo}
        onChange={(r) => onSet({ receivedFrom: r.from, receivedTo: r.to })}
      />
      <TextChip label="Reference" value={filters.reference} onChange={(v) => onSet({ reference: v })} />
      <TextChip label="Sender" value={filters.emailFrom} onChange={(v) => onSet({ emailFrom: v })} />
      <TotalChip min={filters.minTotal} max={filters.maxTotal} onChange={onSet} />
      <FilterChip
        label="Duplicate"
        value={filters.duplicate === undefined ? undefined : String(filters.duplicate)}
        options={DUPLICATE_OPTIONS}
        onChange={(v) => onSet({ duplicate: v === undefined ? undefined : v === 'true' })}
      />
      <ClearFilters onClear={onClear} disabled={activeCount === 0} />
    </div>
  )
}
