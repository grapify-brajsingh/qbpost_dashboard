// Derives the R-7 audit feed from the append-only mock tables. Nothing is stored; ids are stable.
import type { Actor, AuditAction, AuditEvent, Change, Payload, Role } from '@/api/schema'
import { mockDb, type RequestRecord } from './db'
import { publicRef } from './handlers/requestHelpers'
import { rowsOf } from './payloadRules'

const USER_ACTIONS: Record<string, AuditAction> = {
  created: 'user-created',
  'role-changed': 'user-role-changed',
  disabled: 'user-disabled',
  enabled: 'user-enabled',
  'password-reset': 'user-password-reset',
  unlocked: 'user-unlocked',
  'password-changed': 'user-password-changed',
  login: 'user-signed-in',
  'login-failed': 'user-sign-in-failed',
  'locked-out': 'user-locked-out',
}

const REQUEST_EVENT_ACTIONS: Record<string, AuditAction> = {
  created: 'received',
  validated: 'validated',
  'post-started': 'post-started',
  discarded: 'discarded',
  restored: 'restored',
  resolved: 'resolved',
}

const API_PREFIX = 'api-client:'

function actorOf(a: Actor): AuditEvent['actor'] {
  return a.id.startsWith(API_PREFIX)
    ? { id: a.id, name: a.id.slice(API_PREFIX.length), kind: 'api-client' }
    : { id: a.id, name: a.name, kind: 'user' }
}

const ROW_PATH = /^\$\.transactions\[(\d+)\](?:\.(.+))?$/

function rowAt(payload: Payload | undefined, index: number): { externalId: string | null; index: number } {
  const row = payload ? rowsOf(payload)[index] : undefined
  return { externalId: typeof row?.externalId === 'string' ? row.externalId : null, index }
}

type Parts = Pick<AuditEvent, 'action' | 'row' | 'field' | 'old' | 'new'>

function partsOf(c: Change, now: Payload, before: Payload | undefined): Parts {
  const m = ROW_PATH.exec(c.path)
  if (m) {
    const i = Number(m[1])
    const field = m[2] ?? null
    if (field === null && c.op === 'add') return { action: 'row-added', row: rowAt(now, i), field, old: null, new: c.new ?? null }
    if (field === null && c.op === 'remove') return { action: 'row-deleted', row: rowAt(before, i), field, old: c.old ?? null, new: null }
    const row = rowAt(now, i)
    if (field === 'post') {
      return { action: c.new === false ? 'row-post-off' : 'row-post-on', row, field, old: c.old ?? null, new: c.new ?? null }
    }
    return { action: 'row-edited', row, field, old: c.old ?? null, new: c.new ?? null }
  }
  if (c.path === '$.controlTotal') return { action: 'control-total-changed', row: null, field: 'controlTotal', old: c.old ?? null, new: c.new ?? null }
  return { action: 'row-edited', row: null, field: c.path.replace(/^\$\./, ''), old: c.old ?? null, new: c.new ?? null }
}

function requestEvents(r: RequestRecord): AuditEvent[] {
  const payload = r.versions[r.versions.length - 1].payload
  const reference = typeof payload.reference === 'string' ? payload.reference : null
  const request = { id: r.id, publicRef: publicRef(r.id), reference, pushId: r.pushId, emailSubject: r.email?.subject ?? null }
  const base = { request, row: null, field: null, old: null, new: null, versionNumber: null, detail: null }
  const out: AuditEvent[] = []

  r.versions.forEach((v, vi) => {
    const before = vi > 0 ? r.versions[vi - 1].payload : undefined
    v.changes.forEach((c, opIndex) => {
      out.push({ ...base, id: `v${r.id}.${v.number}-${opIndex}`, atUtc: v.created.utc, actor: actorOf(v.created.by), versionNumber: v.number, ...partsOf(c, v.payload, before) })
    })
  })
  r.events.forEach((e, i) => {
    const action = REQUEST_EVENT_ACTIONS[e.kind]
    if (!action) return // edited (covered by version ops), flagged-duplicate, post-finished (covered by attempts)
    out.push({ ...base, id: `e${r.id}-${i}`, atUtc: e.atUtc, actor: actorOf(e.actor), action, detail: e.detail })
  })
  for (const a of r.attempts) {
    if (a.outcome === 'in-progress') continue
    const action: AuditAction = a.outcome === 'posted' ? 'posted' : 'post-failed'
    const detail: Record<string, unknown> = { attemptId: a.id, outcome: a.outcome, httpStatus: a.httpStatus, postId: a.postId }
    out.push({ ...base, id: `p${r.id}-${a.id}`, atUtc: a.finishedUtc ?? a.startedUtc, actor: actorOf(a.startedBy), action, versionNumber: a.versionNumber, detail })
  }
  return out
}

function userEvents(): AuditEvent[] {
  return Object.entries(mockDb.userAudit).flatMap(([userId, rows]) =>
    rows.flatMap((row): AuditEvent[] => {
      const action = USER_ACTIONS[row.kind]
      if (!action) return []
      return [{
        id: `u${row.id}`, atUtc: row.atUtc, actor: actorOf(row.actor), action, request: null, row: null,
        field: null, old: null, new: null, versionNumber: null, detail: { ...row.detail, userId },
      }]
    }),
  )
}

/** Every audit event the viewer may see, newest first (`atUtc` desc, then `id` desc). */
export function deriveAuditEvents(viewerRole: Role): AuditEvent[] {
  const all = [...mockDb.requests.flatMap(requestEvents), ...(viewerRole === 'admin' ? userEvents() : [])]
  return all.sort((a, b) => (a.atUtc === b.atUtc ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.atUtc < b.atUtc ? 1 : -1))
}
