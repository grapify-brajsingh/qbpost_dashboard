import { CheckIcon, PlusIcon } from 'lucide-react'
import { TXN_KINDS } from '@/api/schema'
import { ClearFilters, DateRangeChip, FilterChip, SearchBox, type FilterValues } from '@/components/filters'
import { chipClass } from '@/components/filters/FilterChip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ROW_FILTER_SPEC } from './rowFilters'

export type RowFilterValues = FilterValues<typeof ROW_FILTER_SPEC>

const POST_OPTIONS = [
  { value: 'post', label: 'Post' },
  { value: 'skip', label: "Don't post" },
]
const KIND_OPTIONS = TXN_KINDS.map((k) => ({ value: k, label: k }))

/** An on/off chip: dashed "+ Label" when off, solid with a check when on. */
function ToggleChip({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(chipClass, on ? 'border-solid border-primary/40 bg-primary/10 text-foreground' : 'border-dashed text-muted-foreground')}
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
    <div className="flex flex-wrap items-center gap-2">
      <div role="search" aria-label="Row filters" className="flex flex-wrap items-center gap-2">
        <SearchBox value={values.rq} onChange={(v) => onSet({ rq: v.trim() || undefined })} label="Search rows" placeholder="Search payee, memo or account" />
        <FilterChip label="Post or don't post" value={values.rpost} options={POST_OPTIONS} onChange={(v) => onSet({ rpost: v as RowFilterValues['rpost'] })} />
        <FilterChip
          label="Kind"
          value={values.rkind?.join(', ')}
          options={KIND_OPTIONS}
          onChange={(v) => onSet({ rkind: v === undefined ? undefined : [v as (typeof TXN_KINDS)[number]] })}
        />
        <DateRangeChip label="Date" from={values.rfrom} to={values.rto} onChange={(r) => onSet({ rfrom: r.from, rto: r.to })} />
        <ToggleChip label="Has a problem" on={values.rproblem === true} onChange={(on) => onSet({ rproblem: on || undefined })} />
        <ToggleChip label="Edited" on={values.redited === true} onChange={(on) => onSet({ redited: on || undefined })} />
        {activeCount > 0 && <ClearFilters onClear={onClear} />}
      </div>
      {onAdd && (
        <Button className="ml-auto" onClick={onAdd}>
          <PlusIcon aria-hidden /> Add transaction
        </Button>
      )}
    </div>
  )
}
