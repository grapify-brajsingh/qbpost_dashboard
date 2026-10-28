import { useRef } from 'react'
import { TXN_KINDS } from '@/api/schema'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
    <NativeSelect
      aria-label="Kind"
      autoFocus
      size="sm"
      wrapperClassName="w-full"
      className="h-7 py-0 pr-7 pl-1.5 text-[13px] data-[size=sm]:h-7 data-[size=sm]:py-0"
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
        <NativeSelectOption value="" disabled>
          {cellText(initial)}
        </NativeSelectOption>
      )}
      {TXN_KINDS.map((k) => (
        <NativeSelectOption key={k} value={k}>
          {k}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
