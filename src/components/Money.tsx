import { formatMoney } from '@/lib/money'

export function Money({ value }: { value: number | null }) {
  return <span className="block text-right tabular-nums">{formatMoney(value)}</span>
}
