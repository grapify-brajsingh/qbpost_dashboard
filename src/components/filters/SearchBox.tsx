import { useEffect, useRef, useState } from 'react'
import { SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchBoxProps {
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}

const DEBOUNCE_MS = 250

/**
 * Debounced search input. What the user types is passed on exactly as typed
 * (inner and edge whitespace included); trimming for a query is the caller's choice.
 */
export function SearchBox({ value, onChange, placeholder, label, className }: SearchBoxProps) {
  const [text, setText] = useState(value ?? '')
  const [seen, setSeen] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // What the user last typed, to tell an outside change from our own echo.
  const typed = useRef(value ?? '')

  // Follow outside changes (clear filters, back button), but not a caller that
  // echoes our own text back trimmed.
  if (value !== seen) {
    setSeen(value)
    if ((value ?? '').trim() !== text.trim()) setText(value ?? '')
  }

  // The outside value wins: a pending keystroke must not re-apply the old search.
  // Nothing is flushed on unmount: that would navigate over the route being left.
  useEffect(() => {
    if ((value ?? '').trim() !== typed.current.trim()) {
      clearTimeout(timer.current)
      typed.current = value ?? ''
    }
  }, [value])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className={cn('relative w-full sm:max-w-sm', className)}>
      <SearchIcon
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        className="h-8 bg-card pl-8 text-[13px] md:text-[13px]"
        aria-label={label ?? placeholder ?? 'Search'}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          clearTimeout(timer.current)
          typed.current = next
          timer.current = setTimeout(() => onChange(next), DEBOUNCE_MS)
        }}
      />
    </div>
  )
}
