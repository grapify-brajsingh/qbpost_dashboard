import { useState, type ReactNode } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface FilterOption {
  value: string
  label: string
}

interface FilterChipProps {
  label: string
  /** Current value; `undefined` means the chip is unset. */
  value?: string
  options?: readonly FilterOption[]
  /** Custom popover content, used instead of `options`. */
  children?: ReactNode
  onChange: (value: string | undefined) => void
}

export const chipClass =
  'inline-flex h-[30px] items-center gap-1.5 rounded-lg border bg-card px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Dashed "+ Label" when unset; solid "Label: value" with a clear button when set. */
export function FilterChip({ label, value, options, children, onChange }: FilterChipProps) {
  const [open, setOpen] = useState(false)
  const isSet = value !== undefined && value !== ''
  const shown = options?.find((o) => o.value === value)?.label ?? value

  return (
    <span className="inline-flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              chipClass,
              isSet ? 'rounded-r-none border-solid text-foreground' : 'border-dashed text-muted-foreground',
            )}
          >
            {isSet ? (
              `${label}: ${shown}`
            ) : (
              <>
                <PlusIcon className="size-3.5" aria-hidden />
                {label}
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          {options ? (
            <Command>
              <CommandInput placeholder={`Find ${label.toLowerCase()}`} />
              <CommandList>
                <CommandEmpty>No matches</CommandEmpty>
                <CommandGroup>
                  {options.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.label}
                      onSelect={() => {
                        onChange(o.value)
                        setOpen(false)
                      }}
                    >
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          ) : (
            children
          )}
        </PopoverContent>
      </Popover>
      {isSet && (
        <button
          type="button"
          aria-label={`Clear ${label} filter`}
          className={cn(chipClass, 'rounded-l-none border-l-0 px-1.5 text-muted-foreground')}
          onClick={() => onChange(undefined)}
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  )
}
