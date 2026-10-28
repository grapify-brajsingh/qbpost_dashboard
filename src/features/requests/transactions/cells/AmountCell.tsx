import { parseAmount } from './parse'
import { TextCell, type EditorProps } from './TextCell'

/** Amounts are stored as JSON numbers with at most 2 decimals. */
export function AmountCell({ initial, ...rest }: EditorProps & { initial: unknown }) {
  const text = typeof initial === 'number' ? String(initial) : typeof initial === 'string' ? initial : ''
  return <TextCell label="Amount" initial={text} align="right" parse={parseAmount} {...rest} />
}
