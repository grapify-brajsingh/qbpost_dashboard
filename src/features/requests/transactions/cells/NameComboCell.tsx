import { useRef, useState } from 'react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cellText } from '../columns'
import type { EditorProps } from './TextCell'

const FREE = '\u0000free-text'

/** Shown next to a name that is not in the QuickBooks list (case-sensitive exact match). */
export function NotInQuickBooks() {
  return <span className="ml-1.5 shrink-0 rounded bg-amber-100 px-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">not in QuickBooks</span>
}

interface Props extends EditorProps {
  label: string
  list: string[]
  value: unknown
}

/**
 * A searchable list of QuickBooks names in a popover. Enter picks the highlighted name; text that matches no name
 * can still be used ("Use …"), and is then flagged in the cell. Tab commits the highlighted entry and moves on.
 */
export function NameComboCell({ label, list, value, onCommit, onCancel }: Props) {
  const current = cellText(value)
  const [text, setText] = useState('')
  const [selected, setSelected] = useState(current)
  const done = useRef(false)
  const finish = (fn: () => void) => {
    if (done.current) return
    done.current = true
    fn()
  }

  const typed = text.trim()
  const q = typed.toLowerCase()
  const matches = q ? list.filter((n) => n.toLowerCase().includes(q)) : list
  const free = typed && !list.includes(typed) ? typed : null

  function commitSelected(move?: 'next' | 'prev') {
    if (selected === FREE && free) finish(() => onCommit(free, move))
    else if (matches.includes(selected)) finish(() => onCommit(selected, move))
    else finish(onCancel)
  }

  return (
    <Popover open onOpenChange={(open) => !open && finish(onCancel)}>
      <PopoverAnchor asChild>
        <span className="block truncate">{current}</span>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-72 p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        <Command shouldFilter={false} value={selected} onValueChange={setSelected} label={label}>
          <CommandInput
            aria-label={label}
            placeholder={current || `Search ${label.toLowerCase()}`}
            value={text}
            onValueChange={setText}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault()
                commitSelected(e.shiftKey ? 'prev' : 'next')
              }
            }}
          />
          <CommandList>
            <CommandEmpty>No names</CommandEmpty>
            {matches.map((n) => (
              <CommandItem key={n} value={n} onSelect={() => finish(() => onCommit(n))}>
                {n}
              </CommandItem>
            ))}
            {free && (
              <CommandItem value={FREE} onSelect={() => finish(() => onCommit(free))}>
                Use “{free}”
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
