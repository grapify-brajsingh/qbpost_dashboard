// R-7: the audit feed and its CSV export, both derived from the append-only mock tables.
import { http, HttpResponse } from 'msw'
import { AUDIT_ACTIONS, type AuditAction, type AuditEvent } from '@/api/schema'
import { deriveAuditEvents } from '../audit'
import { API, authenticate, paginate, problem } from './common'

const CSV_CAP = 50_000

const text = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v))

/** Applies the R-7.2 filters; a string is a 400 detail. */
function filterEvents(url: URL, role: Parameters<typeof deriveAuditEvents>[0]): AuditEvent[] | string {
  const p = url.searchParams
  const instant = (name: string): number | null | string => {
    const v = p.get(name)
    if (v === null) return null
    const t = Date.parse(v)
    return Number.isNaN(t) ? `${name} must be a UTC instant.` : t
  }
  const from = instant('from')
  const to = instant('to')
  if (typeof from === 'string') return from
  if (typeof to === 'string') return to
  const actions = p.getAll('action')
  if (actions.some((a) => !AUDIT_ACTIONS.includes(a as AuditAction))) return 'Unknown action.'
  const requestIdRaw = p.get('requestId')
  const requestId = requestIdRaw === null ? null : Number(requestIdRaw)
  if (requestId !== null && !Number.isInteger(requestId)) return 'requestId must be an integer.'
  const actor = p.get('actor')
  const reference = p.get('reference')
  const pushId = p.get('pushId')?.toLowerCase().replace(/-/g, '')
  const q = p.get('q')?.toLowerCase()

  return deriveAuditEvents(role).filter((e) => {
    const t = Date.parse(e.atUtc)
    if ((from !== null && t < from) || (to !== null && t > to)) return false
    if (actor && e.actor.id !== actor) return false
    if (requestId !== null && e.request?.id !== requestId) return false
    if (reference && e.request?.reference !== reference) return false
    if (pushId && e.request?.pushId?.toLowerCase().replace(/-/g, '') !== pushId) return false
    if (actions.length && !actions.includes(e.action)) return false
    if (q) {
      const hay = [text(e.old), text(e.new), e.field ?? '', e.request?.reference ?? '', e.request?.pushId ?? '']
      if (!hay.some((h) => h.toLowerCase().includes(q))) return false
    }
    return true
  })
}

/** CSV-escapes a value and neutralises spreadsheet formulas by prefixing `'` (R-7.6). */
export function csvCell(value: unknown): string {
  let s = text(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_HEADER = ['time (UTC)', 'actor', 'action', 'reference', 'push id', 'SR ref', 'row', 'field', 'old', 'new']

export const auditHandlers = [
  http.get(`${API}/audit-events`, ({ request }) => {
    const auth = authenticate(request, 'requests:read')
    if ('error' in auth) return auth.error
    const url = new URL(request.url)
    const events = filterEvents(url, auth.user.role)
    if (typeof events === 'string') return problem(400, 'invalid-query', 'Invalid query', events)
    const page = paginate(events, url, { default: 50, max: 200 })
    return 'error' in page ? page.error : HttpResponse.json(page)
  }),

  http.get(`${API}/audit-events.csv`, ({ request }) => {
    const auth = authenticate(request, 'requests:read')
    if ('error' in auth) return auth.error
    const events = filterEvents(new URL(request.url), auth.user.role)
    if (typeof events === 'string') return problem(400, 'invalid-query', 'Invalid query', events)
    if (events.length > CSV_CAP) {
      return problem(413, 'too-many-rows', 'Too many rows', `More than ${CSV_CAP} events match. Narrow the dates.`)
    }
    const lines = [CSV_HEADER, ...events.map((e) => [
      e.atUtc, e.actor.name, e.action, e.request?.reference, e.request?.pushId, e.request?.publicRef,
      e.row?.externalId ?? e.row?.index, e.field, e.old, e.new,
    ])]
    return new HttpResponse(lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n', {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="audit-events.csv"' },
    })
  }),
]
