import { useEffect, useRef, useState } from 'react'
import { SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchBoxProps {
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}

const DEBOUNCE_MS = 250

/**
 * Debounced search input. What the user types is passed on exactly as typed
 * (inner and edge whitespace included); trimming for a query is the caller's choice.
 */
export function SearchBox({ value, onChange, placeholder, label }: SearchBoxProps) {
  const [text, setText] = useState(value ?? '')
  const [seen, setSeen] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Text typed but not yet passed on; null when nothing waits on the timer.
  const pending = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Follow outside changes (clear filters, back button), but not a caller that
  // echoes our own text back trimmed.
  if (value !== seen) {
    setSeen(value)
    if ((value ?? '').trim() !== text.trim()) {
      // The outside value wins: a pending keystroke must not re-apply the old search.
      clearTimeout(timer.current)
      pending.current = null
      setText(value ?? '')
    }
  }

  // Leaving the page within the debounce window must not lose the last keystrokes.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (pending.current !== null) onChangeRef.current(pending.current)
      pending.current = null
    },
    [],
  )

  return (
    <div className="relative w-full max-w-sm">
      <SearchIcon
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        className="pl-8"
        aria-label={label ?? placeholder ?? 'Search'}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          clearTimeout(timer.current)
          pending.current = next
          timer.current = setTimeout(() => {
            pending.current = null
            onChange(next)
          }, DEBOUNCE_MS)
        }}
      />
    </div>
  )
}
