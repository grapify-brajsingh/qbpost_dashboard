// In-memory state behind the MSW handlers. `mockDb.reset()` restores the fixtures and clears `mockControl`.
import type {
  Actor,
  Attempt,
  EmailMeta,
  QbLists,
  RequestEvent,
  RequestStatus,
  UserAuditRow,
  ValidationSnapshot,
  Version,
} from '@/api/schema'
import { QB_LISTS } from './fixtures/lists'
import { buildRequests } from './fixtures/requests'
import { buildUsers, type MockUser } from './fixtures/users'

export interface RequestRecord {
  id: number
  status: RequestStatus
  rowVersion: number
  source: { kind: string; id: string; name: string }
  created: { utc: string; by: Actor }
  updated: { utc: string; by: Actor }
  email: EmailMeta | null
  /** The body exactly as n8n sent it. */
  original: string
  /** Ascending by number; the last one is current. */
  versions: Version[]
  readErrors: string[]
  validation: ValidationSnapshot
  duplicate: { of: number | null; reasons: string[]; acknowledgedBy: Actor | null }
  /** Ascending by id; the last one is the latest. */
  attempts: Attempt[]
  events: RequestEvent[]
  postId: string | null
  discardReason: string | null
  ledgerBatch: { postId: string; status: string; createdUtc: string; counts: Record<string, number> } | null
}

/** Server-side stand-in for the HttpOnly refresh cookie. */
export interface Session {
  userId: string
  generation: number
}

export interface NextPost {
  status: number
  body: unknown
  delayMs?: number
}

export const DEFAULT_POST_DELAY_MS = 1500

const timers = new Set<ReturnType<typeof setTimeout>>()

export const mockDb = {
  requests: [] as RequestRecord[],
  users: [] as MockUser[],
  userAudit: {} as Record<string, UserAuditRow[]>,
  lists: QB_LISTS as QbLists,
  session: null as Session | null,
  counters: { attempt: 100, event: 1000, audit: 1, password: 1 },
  reset() {
    mockDb.requests = buildRequests()
    mockDb.users = buildUsers()
    mockDb.userAudit = {}
    mockDb.lists = structuredClone(QB_LISTS)
    mockDb.session = null
    mockDb.counters = { attempt: 100, event: 1000, audit: 1, password: 1 }
    mockControl.reset()
  },
}

export const mockControl = {
  /** Forces the outcome of the next post only. */
  nextPost: null as NextPost | null,
  /** When true the database-backed routes answer 503 database-unavailable. */
  databaseDown: false,
  /** Creates a session without going through login; returns the access token to send. */
  signInAs(userId: string): string {
    mockDb.session = { userId, generation: 1 }
    return `mock-token-${userId}-0`
  },
  endSession() {
    mockDb.session = null
  },
  /** Timer the handlers use for the post delay; `reset()` clears pending ones so tests leak nothing. */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        timers.delete(t)
        resolve()
      }, ms)
      timers.add(t)
    })
  },
  reset() {
    mockControl.nextPost = null
    mockControl.databaseDown = false
    timers.forEach(clearTimeout)
    timers.clear()
  },
}

mockDb.reset()
