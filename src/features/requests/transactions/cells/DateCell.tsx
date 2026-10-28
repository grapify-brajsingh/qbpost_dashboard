import { parseDate } from './parse'
import { TextCell, type EditorProps } from './TextCell'

/** A yyyy-MM-dd text input with the browser's date picker next to it. */
export function DateCell({ initial, ...rest }: EditorProps & { initial: unknown }) {
  return (
    <TextCell
      label="Date"
      initial={typeof initial === 'string' ? initial : ''}
      parse={parseDate}
      extra={(setText) => (
        <input
          type="date"
          aria-label="Pick a date"
          tabIndex={-1}
          className="h-7 w-5 shrink-0 cursor-pointer bg-transparent text-transparent"
          onChange={(e) => e.target.value && setText(e.target.value)}
        />
      )}
      {...rest}
    />
  )
}
