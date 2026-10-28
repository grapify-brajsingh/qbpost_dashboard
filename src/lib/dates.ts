const pad = (n: number) => String(n).padStart(2, '0')

export function formatTimestamp(utcIso: string): string {
  const d = new Date(utcIso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
]

export function formatRelative(utcIso: string, now: Date = new Date()): string {
  const t = new Date(utcIso).getTime()
  if (Number.isNaN(t)) return ''
  const diffSec = Math.round((t - now.getTime()) / 1000)
  const abs = Math.abs(diffSec)
  for (const [unit, secs] of UNITS) {
    if (abs >= secs || unit === 'second') return rtf.format(Math.trunc(diffSec / secs), unit)
  }
  return ''
}
