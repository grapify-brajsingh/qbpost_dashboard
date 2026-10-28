import { format, isSameDay, subDays } from 'date-fns'
import type { AuditEvent } from '@/api/schema'

export interface DayGroup {
  label: string
  items: AuditEvent[]
}

function labelFor(d: Date, now: Date): string {
  if (isSameDay(d, now)) return `Today, ${format(d, 'd MMM')}`
  if (isSameDay(d, subDays(now, 1))) return `Yesterday, ${format(d, 'd MMM')}`
  return format(d, 'EEE, d MMM')
}

/** Groups by local calendar day, newest day first and newest event first inside each day. */
export function groupByDay(events: readonly AuditEvent[], now: Date): DayGroup[] {
  const sorted = [...events].sort((a, b) => Date.parse(b.atUtc) - Date.parse(a.atUtc))
  const groups: DayGroup[] = []
  let last: Date | null = null
  for (const e of sorted) {
    const d = new Date(e.atUtc)
    if (Number.isNaN(d.getTime())) {
      const g = groups.find((x) => x.label === 'Unknown date')
      if (g) g.items.push(e)
      else groups.push({ label: 'Unknown date', items: [e] })
      continue
    }
    if (last !== null && isSameDay(d, last)) {
      groups[groups.length - 1].items.push(e)
    } else {
      groups.push({ label: labelFor(d, now), items: [e] })
      last = d
    }
  }
  return groups
}
