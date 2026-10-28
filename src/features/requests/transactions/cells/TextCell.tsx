import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** `next`/`prev`: the edit was committed with Tab/Shift+Tab and focus moves on. */
export type Move = 'next' | 'prev'

export interface EditorProps {
  onCommit: (value: unknown, move?: Move) => void
  onCancel: () => void
}

export type ParseResult = { value: unknown } | { error: string }

interface Props extends EditorProps {
  label: string
  initial: string
  parse?: (text: string) => ParseResult
  align?: 'right'
  /** Extra controls inside the editor (for example a date picker); focusing them does not commit. */
  extra?: (setText: (t: string) => void) => ReactNode
}

/**
 * A text input editor. Enter commits, Tab/Shift+Tab commit and move, Esc cancels, leaving the cell commits.
 * A value that does not parse keeps the editor open with the message.
 */
export function TextCell({ label, initial, parse = (t) => ({ value: t }), align, extra, onCommit, onCancel }: Props) {
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)
  const wrapper = useRef<HTMLDivElement>(null)

  function commit(move?: Move): boolean {
    if (done.current) return true
    const r = parse(text)
    if ('error' in r) {
      setError(r.error)
      return false
    }
    done.current = true
    onCommit(r.value, move)
    return true
  }

  return (
    <div
      ref={wrapper}
      className="relative flex items-center gap-1"
      onBlur={(e) => {
        if (wrapper.current?.contains(e.relatedTarget as Node | null)) return
        if (!commit() && !done.current) {
          done.current = true
          onCancel()
        }
      }}
    >
      <input
        aria-label={label}
        aria-invalid={error !== null}
        autoFocus
        className={cn(
          'h-7 w-full min-w-0 rounded border bg-background px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
          align === 'right' && 'text-right tabular-nums',
          error && 'border-destructive',
        )}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Tab') {
            e.preventDefault()
            commit(e.shiftKey ? 'prev' : 'next')
          } else if (e.key === 'Escape') {
            e.preventDefault()
            done.current = true
            onCancel()
          }
        }}
      />
      {extra?.((t) => {
        setText(t)
        setError(null)
      })}
      {error && (
        <span role="alert" className="absolute top-full left-0 z-20 mt-0.5 rounded bg-destructive px-1.5 py-0.5 text-xs whitespace-nowrap text-white">
          {error}
        </span>
      )}
    </div>
  )
}
