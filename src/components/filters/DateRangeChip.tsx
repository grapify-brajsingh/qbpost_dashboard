import { useState } from 'react'
import { CalendarIcon, XIcon } from 'lucide-react'
import { endOfMonth, parse, startOfMonth, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { chipClass } from './FilterChip'
import { formatDate } from './useUrlFilters'

export interface DateRangeValue {
  from?: string
  to?: string
}

interface DateRangeChipProps extends DateRangeValue {
  label: string
  onChange: (range: DateRangeValue) => void
}

const toDate = (s?: string) => (s ? parse(s, 'yyyy-MM-dd', new Date()) : undefined)

function presets(now: Date): { label: string; from: Date; to: Date }[] {
  return [
    { label: 'Today', from: now, to: now },
    { label: 'Yesterday', from: subDays(now, 1), to: subDays(now, 1) },
    { label: 'Last 7 days', from: subDays(now, 6), to: now },
    { label: 'This month', from: startOfMonth(now), to: endOfMonth(now) },
  ]
}

export function DateRangeChip({ label, from, to, onChange }: DateRangeChipProps) {
  const [open, setOpen] = useState(false)
  const isSet = Boolean(from || to)
  const shown = from && to && from !== to ? `${from} – ${to}` : (from ?? to)

  const apply = (a?: Date, b?: Date) =>
    onChange({ from: a && formatDate(a), to: b && formatDate(b) })

  const selected: DateRange | undefined = isSet
    ? { from: toDate(from ?? to), to: toDate(to ?? from) }
    : undefined

  return (
    <span className="inline-flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              chipClass,
              isSet ? 'rounded-r-none border-solid border-primary/35 bg-primary-soft font-medium text-foreground' : 'border-dashed text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-3.5" aria-hidden />
            {isSet ? `${label}: ${shown}` : label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="flex flex-wrap gap-1 border-b p-2">
            {presets(new Date()).map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  apply(p.from, p.to)
                  setOpen(false)
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={selected}
            defaultMonth={selected?.from}
            onSelect={(range) => apply(range?.from, range?.to ?? range?.from)}
          />
        </PopoverContent>
      </Popover>
      {isSet && (
        <button
          type="button"
          aria-label={`Clear ${label} filter`}
          className={cn(chipClass, 'rounded-l-none border-l-0 border-primary/35 bg-primary-soft px-1.5 text-muted-foreground')}
          onClick={() => onChange({ from: undefined, to: undefined })}
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  )
}
