import { parseAmountInput } from '@/lib/money'
import { TextCell, type EditorProps, type ParseResult } from './TextCell'

function parseAmount(text: string): ParseResult {
  const n = parseAmountInput(text)
  if (n !== null) return { value: n }
  return { error: /\.\d{3,}\s*$/.test(text) ? 'Up to 2 decimals' : 'Enter an amount like 1234.56' }
}

/** Amounts are stored as JSON numbers with at most 2 decimals. */
export function AmountCell({ initial, ...rest }: EditorProps & { initial: unknown }) {
  const text = typeof initial === 'number' ? String(initial) : typeof initial === 'string' ? initial : ''
  return <TextCell label="Amount" initial={text} align="right" parse={parseAmount} {...rest} />
}
