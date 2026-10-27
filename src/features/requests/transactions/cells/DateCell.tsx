import { TextCell, type EditorProps, type ParseResult } from './TextCell'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDate(text: string): ParseResult {
  const t = text.trim()
  const m = DATE_RE.exec(t)
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    if (d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])) return { value: t }
  }
  return { error: 'Use yyyy-MM-dd' }
}

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
