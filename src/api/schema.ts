// Hand-written API types (to be replaced by generated ones). Field names follow the API spec
// (saved-requests-postgres.md §6.2, §6.4, §7, §8.3, §11) and docs/api-requirements-for-dashboard.md R-1/R-4.

/** The only list of transaction kinds. Mirrors the OpenAPI `TxnKind` enum. */
export const TXN_KINDS = ['Check', 'CcCharge', 'CcCredit', 'Deposit', 'Skip'] as const
export type TxnKind = (typeof TXN_KINDS)[number]

export type RequestStatus = 'pending' | 'posting' | 'posted' | 'partial' | 'unknown' | 'discarded'
export type AttemptOutcome =
  | 'in-progress'
  | 'posted'
  | 'partial'
  | 'failed'
  | 'held'
  | 'refused'
  | 'busy'
  | 'unavailable'
  | 'error'
  | 'unknown'
export type Action = 'edit' | 'validate' | 'post' | 'discard' | 'restore' | 'resolve'
export type Role = 'admin' | 'editor' | 'viewer'

/** Deliberately loose: stored payloads may be unreadable or carry extra fields. */
export interface Payload {
  reference?: unknown
  controlTotal?: unknown
  transactions?: unknown
  [k: string]: unknown
}

export interface Txn {
  externalId?: string
  kind?: string
  date?: string
  amount?: number
  account?: string
  lineAccount?: string
  payee?: string
  checkNo?: string
  refNumber?: string
  memo?: string
  last4?: string
  /** Missing means true. `false` sends the row to QuickBooks as `Skip` (R-6). */
  post?: boolean
  [k: string]: unknown
}

export interface Finding {
  index: number
  externalId?: string | null
  reason: string
  detail?: string
  candidates?: string[]
}

export interface ValidationSnapshot {
  state: 'ok' | 'held' | 'refused' | 'unreadable' | 'unavailable'
  validatedUtc?: string
  versionNumber?: number
  counts?: Record<string, number>
  validation?: Finding[]
  errors?: string[]
  unknownNames?: { accounts: string[]; vendors: string[]; customers: string[] }
  reason?: string
}

export interface Actor {
  id: string
  name: string
  email?: string
}

export interface EmailMeta {
  subject: string | null
  receivedUtc: string | null
  from?: string | null
  messageId?: string | null
}

/** Where an uploaded statement came from (R-14.4). Null for statements saved by n8n. */
export interface UploadMeta {
  fileName: string
  sizeBytes: number
  sha256: string
  model: string
  promptVersion: string
  extractedUtc: string
}

export type DuplicateReason = 'same-file' | 'same-reference' | 'overlapping-rows' | 'same-payload'

/** A statement an upload may repeat (R-13.9). A warning only. */
export interface PossibleDuplicate {
  id: number
  publicRef: string
  reference: string | null
  status: RequestStatus
  receivedUtc: string | null
  source: 'email' | 'upload' | 'other'
  reasons: DuplicateReason[]
}

/** `POST /statement-extractions` answer (R-13.7): the rows read from a PDF, nothing saved yet. */
export interface Extraction {
  extractionId: string
  file: { name: string; sizeBytes: number; sha256: string; pageCount: number }
  model: string
  promptVersion: string
  extractedUtc: string
  expiresUtc: string
  isBankStatement: boolean
  payload: Payload
  possibleDuplicates?: PossibleDuplicate[]
}

export interface ValidationSummary {
  state: ValidationSnapshot['state'] | 'none'
  problemCount: number
  validatedUtc: string | null
  versionNumber: number | null
}

export interface PostSummary {
  postId: string
  postedCount: number
  postedUtc: string
  postedBy: Actor
}

export interface OtherPush {
  id: number
  publicRef: string
  pushId: string | null
  receivedUtc: string | null
  status: RequestStatus
}

export interface RequestSummary {
  id: number
  publicRef: string
  status: RequestStatus
  rowVersion: number
  source: { kind: string; id: string; name: string }
  reference: string | null
  controlTotal: number | null
  transactionCount: number
  currentVersion: number
  needsAttention: boolean
  duplicate: {
    flagged: boolean
    of: number | null
    ofRef?: string | null
    ofStatus?: RequestStatus | null
    reasons: string[]
    acknowledgedBy: Actor | null
  }
  validation: Omit<ValidationSnapshot, 'validation'>
  lastAttempt: {
    id: number
    outcome: AttemptOutcome
    httpStatus: number | null
    finishedUtc: string | null
  } | null
  postId: string | null
  email: EmailMeta | null
  /** Set for statements uploaded from the dashboard (R-14.4); missing on an older API means null. */
  upload?: UploadMeta | null
  pushId: string | null
  historyCount: number
  validationSummary: ValidationSummary
  postSummary: PostSummary | null
  skipCount: number
  discardReason?: string | null
  created: { utc: string; by: Actor }
  updated: { utc: string; by: Actor }
  allowedActions: Action[]
}

export interface RequestDetail extends RequestSummary {
  payload: Payload
  readErrors: string[]
  otherUnpostedPushes: OtherPush[]
  validation: ValidationSnapshot
  ledgerBatch?: {
    postId: string
    status: string
    createdUtc: string
    counts: Record<string, number>
  } | null
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

/** An unpaged list (versions, attempts): the API wraps it so fields can be added later. */
export interface Items<T> {
  items: T[]
}

export interface Stats {
  byStatus: Record<RequestStatus, number>
  needsAttention: { pending: number; all: number }
  duplicate: { pending: number; all: number }
  hasErrors: { pending: number; all: number }
}

export interface VersionSummary {
  number: number
  created: { utc: string; by: Actor }
  note: string | null
  changeCount: number
}

export interface Change {
  op: 'add' | 'remove' | 'replace'
  path: string
  old?: unknown
  new?: unknown
}

export interface Version extends VersionSummary {
  payload: Payload
  changes: Change[]
}

export interface Attempt {
  id: number
  versionNumber: number
  outcome: AttemptOutcome
  httpStatus: number | null
  postId: string | null
  counts: Record<string, number> | null
  error: string | null
  startedUtc: string
  finishedUtc: string | null
  startedBy: Actor
  resolvedBy?: Actor | null
  resolvedUtc?: string | null
  resolutionNote?: string | null
  result?: unknown
}

export interface PostedRow {
  index: number
  externalId?: string
  txnId: string
  kind: string
  account: string
  amount: number
}

export interface RequestEvent {
  id: number
  kind: string
  detail: Record<string, unknown> | null
  atUtc: string
  actor: Actor
}

export interface Me {
  id: string
  email: string
  displayName: string
  role: Role
  mustChangePassword: boolean
  scopes: string[]
}

export type UserStatus = 'active' | 'must-change-password' | 'locked' | 'disabled'

export interface User {
  id: string
  email: string
  displayName: string
  role: Role
  disabled: boolean
  lockedOutUntilUtc: string | null
  mustChangePassword: boolean
  lastLoginUtc: string | null
  /**
   * On `GET /users` rows only (R-15): the user's ETag value without the quotes, so a row action can send `If-Match`.
   * Single-user answers carry the `ETag` header instead.
   */
  rowVersion?: string
}

export interface UserAuditRow {
  id: number
  kind: string
  actor: Actor
  detail: Record<string, unknown> | null
  atUtc: string
}

/** QuickBooks names as the dashboard uses them: account names only. */
export interface QbLists {
  accounts: string[]
  vendors: string[]
  customers: string[]
  syncedUtc: string | null
  /** Newest sync attempt (R-16); null when none is known. */
  lastSync?: QbListSync | null
  /** Next automatic sync (R-16); null when the schedule is off. */
  nextSyncUtc?: string | null
  /** List sizes, derived from the arrays by `toQbLists`. */
  counts?: QbListCounts
}

/** The newest QuickBooks list sync attempt (R-16). `message` is a fixed sentence without a time. */
export interface QbListSync {
  trigger: 'schedule' | 'dashboard' | 'api' | 'import'
  outcome: 'ok' | 'failed' | 'skipped'
  reason: string | null
  startedUtc: string
  finishedUtc: string
  requestedBy: { id: string; displayName: string } | null
  message: string
}

export interface QbListCounts {
  accounts: number
  vendors: number
  customers: number
}

/** `GET /quickbooks/lists` as the API sends it: each account carries its QuickBooks type (null when unknown). */
export interface QbListsResponse extends Omit<QbLists, 'accounts' | 'counts'> {
  accounts: { name: string; type: string | null }[]
}

/** One QuickBooks list sync attempt in the history (R-17); fields as `lastSync`. */
export interface QbListSyncRun extends QbListSync {
  id: number
  /** Names stored by this attempt; null unless `outcome` is ok. */
  counts: QbListCounts | null
  /** True on the attempt whose lists are in use (the newest ok). */
  current: boolean
}

/** `GET /quickbooks/lists/syncs` filters (R-17); an empty set means "any". */
export interface QbListSyncFilters {
  trigger: QbListSync['trigger'][]
  outcome: QbListSync['outcome'][]
  page: number
}

/** `POST /quickbooks/lists/sync` 200 (R-16): the lists body for the fresh lists plus their sizes. */
export interface QbListsSyncResponse extends QbListsResponse {
  counts: QbListCounts
}

/** `GET /dashboard/summary` (R-11): the Home period figures in one call. Previous-period fields are null without a compare range. */
export interface DashboardSummary {
  range: { from: string; to: string; tz: string; bucket: 'day' | 'week' }
  counts: { received: number; posted: number; postFailed: number; discarded: number }
  previous: DashboardSummary['counts'] | null
  posted: { rows: number; amount: number; previousRows: number | null; previousAmount: number | null }
  timeToPost: { medianMinutes: number; p90Minutes: number; statements: number } | null
  /** One entry per day (or Monday week) in `tz`, empty ones included, oldest first. */
  series: { start: string; received: number; posted: number; postFailed: number }[]
}

/** The only list of audit actions (R-7.4). Mirrors the OpenAPI enum. */
export const AUDIT_ACTIONS = [
  'received',
  'row-edited',
  'row-added',
  'row-deleted',
  'row-post-off',
  'row-post-on',
  'control-total-changed',
  'validated',
  'post-started',
  'posted',
  'post-failed',
  'discarded',
  'restored',
  'resolved',
  'user-created',
  'user-role-changed',
  'user-disabled',
  'user-enabled',
  'user-password-reset',
  'user-unlocked',
  'user-password-changed',
  'user-signed-in',
  'user-sign-in-failed',
  'user-locked-out',
  // Added by the API beyond R-7.4 (its v2 spec §14, Q-97).
  'flagged-duplicate',
  'request-edited',
  'user-session-revoked',
  'user-other',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** One entry of the audit feed (R-7.3). `request` and `row` are null for user events. */
export interface AuditEvent {
  id: string
  atUtc: string
  /** `system` and `anonymous` are API additions (v2 spec §14, Q-97). */
  actor: { id: string; name: string; kind: 'user' | 'api-client' | 'system' | 'anonymous' }
  action: AuditAction
  request: {
    id: number
    publicRef: string
    reference: string | null
    pushId: string | null
    emailSubject: string | null
  } | null
  row: { externalId: string | null; index: number | null } | null
  field: string | null
  old: unknown
  new: unknown
  versionNumber: number | null
  detail: Record<string, unknown> | null
}
