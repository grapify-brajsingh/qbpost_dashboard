// In-memory state behind the MSW handlers. `mockDb.reset()` restores the fixtures and clears `mockControl`.
import type {
  Actor,
  AuditAction,
  RequestCompanyMatch,
  CompanySource,
  ExtractionCompany,
  Attempt,
  EmailMeta,
  QbLists,
  QbListSyncRun,
  Payload,
  RequestEvent,
  RequestStatus,
  UploadMeta,
  UserAuditRow,
  ValidationSnapshot,
  Version,
} from '@/api/schema'
import { buildCompanies, buildCompanyLists, COMPANY_ROOT, type CompanyRecord } from './fixtures/companies'
import { ACCOUNT_TYPES, buildListSyncs, buildQbLists } from './fixtures/lists'
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
  /** Null when cleared (set-company), as the API sends it (R-19.4). */
  validation: ValidationSnapshot | null
  duplicate: { of: number | null; reasons: string[]; acknowledgedBy: Actor | null }
  /** Ascending by id; the last one is the latest. */
  attempts: Attempt[]
  events: RequestEvent[]
  /** The company a statement is booked to (R-19); null until one is chosen. */
  companyId: number | null
  companySource: CompanySource | null
  /** How the printed business name matched (uploads only). */
  companyMatch: RequestCompanyMatch | null
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
  company: ExtractionCompany
  savedRequestId: number | null
}

export const DEFAULT_POST_DELAY_MS = 1500
/** How long the fake API "reads" a PDF; instant under vitest so tests stay fast. */
export const DEFAULT_EXTRACT_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 1500

/** How long the fake API "talks to QuickBooks" for a list sync. */
const DEFAULT_SYNC_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 800

const timers = new Set<ReturnType<typeof setTimeout>>()

export const mockDb = {
  requests: [] as RequestRecord[],
  users: [] as MockUser[],
  extractions: [] as ExtractionRecord[],
  userAudit: {} as Record<string, UserAuditRow[]>,
  lists: buildQbLists() as QbLists,
  /** QuickBooks type per account name (the API sends accounts as `{ name, type }`). */
  accountTypes: { ...ACCOUNT_TYPES } as Record<string, string>,
  /** Every list sync attempt, newest first (R-17). */
  listSyncs: [] as QbListSyncRun[],
  companies: [] as CompanyRecord[],
  companyRoot: { rootFolder: COMPANY_ROOT as string | null, lastScanUtc: null as string | null },
  /** Lists, account types and sync history of the companies other than the default (R-18). */
  companyLists: buildCompanyLists(),
  companyAudit: [] as {
    id: number
    action: AuditAction
    atUtc: string
    actor: Actor
    companyId: number | null
    detail: Record<string, unknown>
  }[],
  session: null as Session | null,
  counters: { attempt: 100, event: 1000, audit: 1, password: 1 },
  reset() {
    mockDb.requests = buildRequests()
    const maxEvent = Math.max(0, ...mockDb.requests.flatMap((r) => r.events.map((e) => e.id)))
    mockDb.users = buildUsers()
    mockDb.extractions = []
    mockDb.userAudit = {}
    mockDb.lists = buildQbLists()
    mockDb.accountTypes = { ...ACCOUNT_TYPES }
    mockDb.listSyncs = buildListSyncs(mockDb.lists)
    mockDb.companies = buildCompanies()
    mockDb.companyRoot = { rootFolder: COMPANY_ROOT, lastScanUtc: new Date(Date.now() - 5 * 60_000).toISOString() }
    mockDb.companyLists = buildCompanyLists()
    mockDb.companyAudit = []
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
  /** When true QuickBooks is closed: `POST /quickbooks/lists/sync` answers 409 quickbooks-not-open (R-16). */
  qbNotOpen: false,
  /** When true QuickBooks cannot be reached: `POST /quickbooks/lists/sync` answers 503 quickbooks-unavailable. */
  qbDown: false,
  /** Names "added in QuickBooks" since the last sync; the next successful sync picks them up. */
  qbAdded: { accounts: [] as string[], vendors: [] as string[], customers: [] as string[] },
  /** How long a list sync takes (QuickBooks is slow); instant under vitest. */
  syncDelayMs: DEFAULT_SYNC_DELAY_MS,
  /** When true the company root folder cannot be read: `POST /companies/scan` answers 503 company-root-unavailable. */
  companyRootMissing: false,
  /** The company file QuickBooks has open (file name); a check of any other company answers 409. */
  companyOpenElsewhere: null as string | null,
  /** When true the file is re-pointed while QuickBooks answers a check: 412 edited-by-someone-else (M17 5.1). */
  companyChangedDuringCheck: false,
  /** When true QuickBooks cannot open the company file: a check answers 503 company-file-unavailable. */
  companyFileUnavailable: false,
  /** When true the file of an active company is gone from disk: a check records file-not-found (200). */
  companyFileGone: false,
  /** Folder names the next scan finds. */
  scanAdds: [] as string[],
  /** The company match the next extraction reports. */
  nextMatch: null as ExtractionCompany | null,
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
    mockControl.qbNotOpen = false
    mockControl.qbDown = false
    mockControl.qbAdded = { accounts: [], vendors: [], customers: [] }
    mockControl.syncDelayMs = DEFAULT_SYNC_DELAY_MS
    mockControl.companyRootMissing = false
    mockControl.companyOpenElsewhere = null
    mockControl.companyChangedDuringCheck = false
    mockControl.companyFileUnavailable = false
    mockControl.companyFileGone = false
    mockControl.scanAdds = []
    mockControl.nextMatch = null
    timers.forEach(clearTimeout)
    timers.clear()
  },
}

mockDb.reset()
