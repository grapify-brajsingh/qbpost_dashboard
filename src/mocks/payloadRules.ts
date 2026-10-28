// Pure helpers that stand in for the API's reading, validation, diffing and duplicate rules.
import { TXN_KINDS } from '@/api/schema'
import type { Change, Finding, Payload, PostedRow, QbLists, Txn, ValidationSnapshot } from '@/api/schema'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** Rows dated before this are held as `date-too-old`. */
export const OLDEST_DATE = '2026-01-01'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A row with `post: false` is sent to validate-and-post as `Skip`; a missing `post` means true (R-6). */
export const isSkipped = (r: Txn) => r.kind === 'Skip' || r.post === false

/** R-5.1: a bad `pushId` does not stop the save or the post; it only flags the request. */
export function pushIdErrors(payload: unknown): string[] {
  if (!isObj(payload) || payload.pushId === undefined || payload.pushId === null) return []
  return typeof payload.pushId === 'string' && UUID_RE.test(payload.pushId) ? [] : ['$.pushId: not a UUID']
}

/** Everything the API reports as `readErrors`: binding errors plus the push id check. */
export const allReadErrors = (payload: unknown): string[] => [...readErrorsOf(payload), ...pushIdErrors(payload)]

/** Binding errors, one per JSON path (the API's `read_errors`). Empty means the payload is readable. */
export function readErrorsOf(payload: unknown): string[] {
  if (!isObj(payload)) return ['$: expected a JSON object']
  const errors: string[] = []
  if (payload.controlTotal !== undefined && typeof payload.controlTotal !== 'number') {
    errors.push(`$.controlTotal: '${String(payload.controlTotal)}' is not a number`)
  }
  const tx = payload.transactions
  if (tx !== undefined && !Array.isArray(tx)) {
    errors.push('$.transactions: expected an array')
    return errors
  }
  ;(tx as unknown[] | undefined)?.forEach((row, i) => {
    if (!isObj(row)) {
      errors.push(`$.transactions[${i}]: expected an object`)
      return
    }
    const p = `$.transactions[${i}]`
    if (row.kind !== undefined && !(TXN_KINDS as readonly unknown[]).includes(row.kind)) {
      errors.push(`${p}.kind: '${String(row.kind)}' is not a TxnKind`)
    }
    if (row.date !== undefined && !(typeof row.date === 'string' && DATE_RE.test(row.date))) {
      errors.push(`${p}.date: '${String(row.date)}' is not a yyyy-MM-dd date`)
    }
    if (row.amount !== undefined && typeof row.amount !== 'number') {
      errors.push(`${p}.amount: '${String(row.amount)}' is not a number`)
    }
  })
  return errors
}

export function rowsOf(payload: Payload): Txn[] {
  return Array.isArray(payload.transactions) ? (payload.transactions as Txn[]) : []
}

export const toCents = (n: number) => Math.round(n * 100)

export function sumCents(payload: Payload): number {
  return rowsOf(payload).reduce((s, r) => s + (typeof r.amount === 'number' ? toCents(r.amount) : 0), 0)
}

/** Request-level refusals that do not need the lists (control total). */
export function controlTotalErrors(payload: Payload): string[] {
  if (typeof payload.controlTotal !== 'number') return ['controlTotal is missing']
  const sum = sumCents(payload)
  return toCents(payload.controlTotal) === sum
    ? []
    : [
        `controlTotal ${payload.controlTotal.toFixed(2)} does not match the sum of amounts ${(sum / 100).toFixed(2)}`,
      ]
}

/** The offline validation snapshot (spec §6.4). */
export function computeValidation(
  payload: Payload,
  lists: QbLists,
  versionNumber: number,
  validatedUtc: string,
): ValidationSnapshot {
  const readErrors = readErrorsOf(payload)
  if (readErrors.length) {
    return { state: 'unreadable', validatedUtc, versionNumber, errors: readErrors }
  }
  const rows = rowsOf(payload)
  const findings: Finding[] = []
  const unknown = { accounts: new Set<string>(), vendors: new Set<string>(), customers: new Set<string>() }
  rows.forEach((row, index) => {
    const base = { index, externalId: row.externalId ?? null }
    const missing = (['kind', 'date', 'amount', 'account'] as const).filter((k) => row[k] === undefined || row[k] === '')
    if (missing.length) {
      findings.push({ ...base, reason: 'missing-field', detail: `Missing: ${missing.join(', ')}` })
      return
    }
    if (isSkipped(row)) return
    if (row.date! < OLDEST_DATE) {
      findings.push({ ...base, reason: 'date-too-old', detail: `${row.date} is before ${OLDEST_DATE}` })
    }
    if (!lists.accounts.includes(row.account!)) {
      unknown.accounts.add(row.account!)
      findings.push({ ...base, reason: 'unknown-account', detail: `"${row.account}" is not in QuickBooks` })
    }
    const pool = row.kind === 'Deposit' ? lists.customers : lists.vendors
    if (row.payee && !pool.includes(row.payee)) {
      ;(row.kind === 'Deposit' ? unknown.customers : unknown.vendors).add(row.payee)
      findings.push({ ...base, reason: 'unknown-payee', detail: `"${row.payee}" is not in QuickBooks` })
    }
    if (row.kind !== 'Deposit' && !row.lineAccount) {
      findings.push({
        ...base,
        reason: 'no-account-rule',
        detail: 'No rule maps this payee to an expense account',
        candidates: lists.accounts.filter((a) => !/\d{4}$/.test(a)).slice(0, 3),
      })
    }
  })
  const errors = controlTotalErrors(payload)
  const heldRows = new Set(findings.map((f) => f.index)).size
  const skipped = rows.filter((r) => isObj(r) && isSkipped(r)).length
  return {
    state: errors.length ? 'refused' : findings.length ? 'held' : 'ok',
    validatedUtc,
    versionNumber,
    counts: { submitted: rows.length, postable: rows.length - heldRows - skipped, held: heldRows, skipped },
    validation: findings,
    errors,
    unknownNames: {
      accounts: [...unknown.accounts],
      vendors: [...unknown.vendors],
      customers: [...unknown.customers],
    },
  }
}

// ---- duplicates (spec §9) ----

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (isObj(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

/** `email` and `pushId` are request metadata, so they never take part in duplicate detection or diffs (R-1, R-5). */
function withoutMeta(payload: Payload): Payload {
  const { email: _email, pushId: _pushId, ...rest } = payload
  void _email
  void _pushId
  return rest
}

/** A row's `post: true` equals a missing `post` (R-6), so canonical text drops it. */
function withoutDefaultPost(payload: Payload): Payload {
  if (!Array.isArray(payload.transactions)) return payload
  return {
    ...payload,
    transactions: payload.transactions.map((r: unknown) => {
      if (!isObj(r) || r.post !== true) return r
      const { post: _post, ...row } = r
      void _post
      return row
    }),
  }
}

export const canonicalPayload = (p: Payload) => canonical(withoutDefaultPost(withoutMeta(p)))

const fingerprint = (r: Txn) => [r.kind, r.date, r.amount, r.account, r.checkNo ?? r.refNumber ?? '', r.payee ?? ''].join('|')

export function duplicateReasons(a: Payload, b: Payload): string[] {
  const reasons: string[] = []
  if (canonicalPayload(a) === canonicalPayload(b)) reasons.push('same-payload')
  if (typeof a.reference === 'string' && a.reference !== '' && a.reference === b.reference) reasons.push('same-reference')
  const theirs = new Set(rowsOf(b).filter(isObj).map(fingerprint))
  if (readErrorsOf(a).length === 0 && rowsOf(a).some((r) => theirs.has(fingerprint(r)))) {
    reasons.push('overlapping-rows')
  }
  return reasons
}

// ---- change list (spec §8.3) ----

const same = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a === b : canonical(a) === canonical(b))

function diffObject(path: string, a: Obj, b: Obj, out: Change[]) {
  for (const k of Object.keys(a)) {
    if (!(k in b)) out.push({ op: 'remove', path: `${path}.${k}`, old: a[k] })
    else if (!same(a[k], b[k])) out.push({ op: 'replace', path: `${path}.${k}`, old: a[k], new: b[k] })
  }
  for (const k of Object.keys(b)) if (!(k in a)) out.push({ op: 'add', path: `${path}.${k}`, new: b[k] })
}

/** Rows compare `post` with missing read as true, so `true` to `false` is a replace and `true` to missing is nothing. */
function diffRow(path: string, a: Obj, b: Obj, out: Change[]) {
  const { post: pa = true, ...restA } = a
  const { post: pb = true, ...restB } = b
  diffObject(path, restA, restB, out)
  if (!same(pa, pb)) out.push({ op: 'replace', path: `${path}.post`, old: pa, new: pb })
}

export function diffPayload(oldP: Payload, newP: Payload): Change[] {
  const out: Change[] = []
  const a = withoutMeta(oldP)
  const b = withoutMeta(newP)
  const { transactions: ta, ...restA } = a
  const { transactions: tb, ...restB } = b
  diffObject('$', restA, restB, out)
  if (!Array.isArray(ta) || !Array.isArray(tb)) {
    if (!same(ta, tb)) out.push({ op: 'replace', path: '$.transactions', old: ta, new: tb })
    return out
  }
  const byId = [...ta, ...tb].every((r) => isObj(r) && typeof r.externalId === 'string')
  if (byId) {
    const oldById = new Map((ta as Txn[]).map((r, i) => [r.externalId!, { r, i }]))
    const seen = new Set<string>()
    ;(tb as Txn[]).forEach((r, i) => {
      const prev = oldById.get(r.externalId!)
      if (!prev) out.push({ op: 'add', path: `$.transactions[${i}]`, new: r })
      else {
        seen.add(r.externalId!)
        diffRow(`$.transactions[${i}]`, prev.r, r, out)
      }
    })
    oldById.forEach(({ r, i }, id) => {
      if (!seen.has(id)) out.push({ op: 'remove', path: `$.transactions[${i}]`, old: r })
    })
    return out
  }
  const n = Math.max(ta.length, tb.length)
  for (let i = 0; i < n; i++) {
    if (i >= ta.length) out.push({ op: 'add', path: `$.transactions[${i}]`, new: tb[i] })
    else if (i >= tb.length) out.push({ op: 'remove', path: `$.transactions[${i}]`, old: ta[i] })
    else if (isObj(ta[i]) && isObj(tb[i])) diffRow(`$.transactions[${i}]`, ta[i], tb[i], out)
    else if (!same(ta[i], tb[i])) out.push({ op: 'replace', path: `$.transactions[${i}]`, old: ta[i], new: tb[i] })
  }
  return out
}

// ---- posting ----

/** Rows a post would send to QuickBooks, with mock TxnIDs. `Skip` rows are not posted. */
export function toPostedRows(payload: Payload, attemptId: number, only?: (index: number) => boolean): PostedRow[] {
  const out: PostedRow[] = []
  rowsOf(payload).forEach((r, index) => {
    if (isSkipped(r) || (only && !only(index))) return
    out.push({
      index,
      externalId: r.externalId,
      txnId: `${(0x8a000 + attemptId * 997 + index).toString(16).toUpperCase()}-${1698400000 + index}`,
      kind: r.kind ?? '',
      account: r.account ?? '',
      amount: r.amount ?? 0,
    })
  })
  return out
}
