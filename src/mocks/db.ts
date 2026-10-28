// In-memory state behind the MSW handlers. `mockDb.reset()` restores the fixtures and clears `mockControl`.
import type {
  Actor,
  Attempt,
  EmailMeta,
  QbLists,
  Payload,
  RequestEvent,
  RequestStatus,
  UploadMeta,
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
  /** The GUID n8n sent with the push (R-5); null when absent or malformed. */
  pushId: string | null
  /** Set when the statement was uploaded from the dashboard (R-14.4). */
  upload: UploadMeta | null
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

/** A short-lived R-13.6 record: what was read from one PDF. Never the PDF itself. */
export interface ExtractionRecord {
  id: string
  userId: string
  file: { name: string; sizeBytes: number; sha256: string; pageCount: number }
  model: string
  promptVersion: string
  payload: Payload
  extractedUtc: string
  expiresUtc: string
  savedRequestId: number | null
}

export const DEFAULT_POST_DELAY_MS = 1500
/** How long the fake API "reads" a PDF; instant under vitest so tests stay fast. */
export const DEFAULT_EXTRACT_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 1500

const timers = new Set<ReturnType<typeof setTimeout>>()

export const mockDb = {
  requests: [] as RequestRecord[],
  users: [] as MockUser[],
  extractions: [] as ExtractionRecord[],
  userAudit: {} as Record<string, UserAuditRow[]>,
  lists: QB_LISTS as QbLists,
  session: null as Session | null,
  counters: { attempt: 100, event: 1000, audit: 1, password: 1 },
  reset() {
    mockDb.requests = buildRequests()
    const maxEvent = Math.max(0, ...mockDb.requests.flatMap((r) => r.events.map((e) => e.id)))
    mockDb.users = buildUsers()
    mockDb.extractions = []
    mockDb.userAudit = {}
    mockDb.lists = structuredClone(QB_LISTS)
    mockDb.session = null
    mockDb.counters = { attempt: 100, event: maxEvent + 1, audit: 1, password: 1 }
    mockControl.reset()
  },
}

export const mockControl = {
  /** Forces the outcome of the next post only. */
  nextPost: null as NextPost | null,
  /** Forces the answer of the next `POST /statement-extractions` only. */
  nextExtraction: null as { status: number; body: Record<string, unknown> } | null,
  /** Delay before an extraction answers. */
  extractDelayMs: DEFAULT_EXTRACT_DELAY_MS,
  /** Makes every stored extraction expired, as if 24 hours had passed. */
  expireExtractions() {
    for (const x of mockDb.extractions) x.expiresUtc = new Date(Date.now() - 1000).toISOString()
  },
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
    mockControl.nextExtraction = null
    mockControl.extractDelayMs = DEFAULT_EXTRACT_DELAY_MS
    mockControl.databaseDown = false
    timers.forEach(clearTimeout)
    timers.clear()
  },
}

mockDb.reset()
