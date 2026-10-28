import { CheckIcon, PlusIcon } from 'lucide-react'
import { TXN_KINDS } from '@/api/schema'
import { ClearFilters, DateRangeChip, FilterChip, SearchBox, type FilterValues } from '@/components/filters'
import { chipClass } from '@/components/filters/FilterChip'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { ROW_FILTER_SPEC } from './rowFilters'

export type RowFilterValues = FilterValues<typeof ROW_FILTER_SPEC>

const POST_OPTIONS = [
  { value: 'post', label: 'Post' },
  { value: 'skip', label: "Don't post" },
]
type Kind = (typeof TXN_KINDS)[number]

/** Several kinds can be chosen; the popover stays open while ticking them. */
function KindChip({ value, onChange }: { value: Kind[] | undefined; onChange: (kinds: Kind[] | undefined) => void }) {
  const chosen = value ?? []
  const toggle = (kind: Kind, on: boolean) => {
    const next = TXN_KINDS.filter((k) => (k === kind ? on : chosen.includes(k)))
    onChange(next.length > 0 ? next : undefined)
  }
  return (
    <FilterChip label="Kind" value={chosen.length > 0 ? chosen.join(', ') : undefined} onChange={() => onChange(undefined)}>
      <div role="group" aria-label="Kinds" className="grid p-1">
        {TXN_KINDS.map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent">
            <Checkbox checked={chosen.includes(k)} onCheckedChange={(c) => toggle(k, c === true)} />
            {k}
          </label>
        ))}
      </div>
    </FilterChip>
  )
}

/** An on/off chip: dashed "+ Label" when off, solid with a check when on. */
function ToggleChip({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(chipClass, on ? 'border-solid border-primary/35 bg-primary-soft font-medium text-foreground' : 'border-dashed text-muted-foreground')}
      onClick={() => onChange(!on)}
    >
      {on ? <CheckIcon className="size-3.5" aria-hidden /> : <PlusIcon className="size-3.5" aria-hidden />}
      {label}
    </button>
  )
}

/** Search, filter chips and Add transaction. Filters only hide rows. */
export function RowToolbar({
  values,
  onSet,
  onClear,
  activeCount,
  onAdd,
}: {
  values: RowFilterValues
  onSet: (patch: Partial<RowFilterValues>) => void
  onClear: () => void
  activeCount: number
  /** Absent when the statement can't be edited. */
  onAdd?: () => void
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div role="search" aria-label="Row filters" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <SearchBox value={values.rq} onChange={(v) => onSet({ rq: v.trim() || undefined })} label="Search rows" placeholder="Search payee, memo or account" className="sm:max-w-72" />
        <FilterChip label="Post or don't post" value={values.rpost} options={POST_OPTIONS} onChange={(v) => onSet({ rpost: v as RowFilterValues['rpost'] })} />
        <KindChip value={values.rkind} onChange={(rkind) => onSet({ rkind })} />
        <DateRangeChip label="Date" from={values.rfrom} to={values.rto} onChange={(r) => onSet({ rfrom: r.from, rto: r.to })} />
        <ToggleChip label="Has a problem" on={values.rproblem === true} onChange={(on) => onSet({ rproblem: on || undefined })} />
        <ToggleChip label="Edited" on={values.redited === true} onChange={(on) => onSet({ redited: on || undefined })} />
        {activeCount > 0 && <ClearFilters onClear={onClear} />}
      </div>
      {onAdd && (
        <Button size="sm" className="ml-auto shrink-0" onClick={onAdd}>
          <PlusIcon aria-hidden /> Add transaction
        </Button>
      )}
    </div>
  )
}
