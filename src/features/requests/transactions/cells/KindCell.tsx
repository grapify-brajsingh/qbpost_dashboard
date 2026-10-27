import { useRef } from 'react'
import { TXN_KINDS } from '@/api/schema'
import { cellText, isKnownKind } from '../columns'
import type { EditorProps } from './TextCell'

/** A select over TXN_KINDS. A value outside the enum shows as a disabled placeholder until it is replaced. */
export function KindCell({ initial, onCommit, onCancel }: EditorProps & { initial: unknown }) {
  const done = useRef(false)
  const known = isKnownKind(initial)
  const finish = (fn: () => void) => {
    if (done.current) return
    done.current = true
    fn()
  }
  return (
    <select
      aria-label="Kind"
      autoFocus
      className="h-7 w-full rounded border bg-background px-1 text-sm focus-visible:ring-2 focus-visible:ring-ring"
      value={known ? (initial as string) : ''}
      onChange={(e) => finish(() => onCommit(e.target.value))}
      onBlur={() => finish(onCancel)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          finish(onCancel)
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const move = e.key === 'Tab' ? (e.shiftKey ? 'prev' : 'next') : undefined
          finish(() => (known ? onCommit(initial, move) : onCancel()))
        }
      }}
    >
      {!known && (
        <option value="" disabled>
          {cellText(initial)}
        </option>
      )}
      {TXN_KINDS.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </select>
  )
}
