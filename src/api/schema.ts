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
  rowVersion: number
}

export interface UserAuditRow {
  id: number
  kind: string
  actor: Actor
  detail: Record<string, unknown> | null
  atUtc: string
}

export interface QbLists {
  accounts: string[]
  vendors: string[]
  customers: string[]
  syncedUtc: string | null
}
