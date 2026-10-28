import { formatRelative, formatTimestamp } from '@/lib/dates'

export function Timestamp({ utc }: { utc: string }) {
  return <span title={formatRelative(utc)}>{formatTimestamp(utc)}</span>
}
