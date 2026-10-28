# QbAutopost Dashboard — brief for the React project

**Status**: draft, 2026-10-27. Starting material for the dashboard's own spec, **not** a design.
**API contract**: `D:\qb_post-issue-2\docs\saved-requests-postgres.md` in the `qbautopost` repo (ticket #2). Where the
two disagree, that spec is the source of truth. This brief only collects what the dashboard needs from it.
**Stack decided by the owner**: React with shadcn/ui.

---

## 1. What the dashboard is for

Bank and card statements arrive by email. An n8n workflow extracts the transactions and **saves** them to the
QbAutopost API. They no longer go straight into QuickBooks. The dashboard is where a person:

1. sees every saved request and which ones need attention,
2. reviews it and edits it if n8n read something wrong,
3. presses **Post**, which sends it to QuickBooks Desktop, and
4. sees exactly what happened: posted with `TxnID`s, validation errors, QuickBooks busy or down, and so on.

The original n8n payload is always kept, and every edit is recorded with who made it and when.

**What must never happen**: posting the same request twice, or posting a version the person did not see.

## 2. Users and roles

| Capability | admin | editor | viewer |
|---|---|---|---|
| View requests, versions, attempts, history | ✓ | ✓ | ✓ |
| Edit, re-validate, discard | ✓ | ✓ | – |
| Post to QuickBooks | ✓ | ✓ | – |
| Restore a discarded request; resolve `unknown` / `partial` | ✓ | – | – |
| Manage users | ✓ | – | – |

The UI should hide or disable what a user cannot do. **The API enforces it anyway**, so the UI is a convenience, not
the guard. Every request detail includes `allowedActions` (e.g. `["edit","validate","post","discard"]`), computed by
the API from the status and the user's role. Drive buttons from that list rather than re-implementing the rules.

## 3. Screens the API implies

These are suggestions, to be designed in the React spec.

1. **Sign in.** Email and password. Handles `invalid-credentials`, `locked-out` (with retry time), and
   `password-change-required` (forced change-password screen).
2. **Requests list.** A table with filters for status, needs attention, possible duplicate, date range, and
   free-text search (reference, `SR-000123`, payee, memo). Columns: ref, created (when and by whom), reference,
   transaction count, control total, status, flags, last attempt outcome. Header counts come from `GET
   /saved-requests/stats`. Paged on the server.
3. **Request detail.**
   - Header: status badge, flags (needs attention, possible duplicate of `SR-…`), source (n8n or a user),
     created/updated by.
   - **Validation panel**: the stored snapshot, showing its `validatedUtc` and a "re-validate" button. Each finding
     points at a row (`index`, `externalId`) with its `reason`, `detail`, and `candidates`.
   - **Transactions table**: the rows of the latest version, editable for editors and admins.
   - Actions: Edit / Save, Validate, Post, Discard (with a reason), and Restore / Resolve for admins.
4. **Versions and diff.** Version list (number, who, when, note). Selecting one shows its change list (`op`, `path`,
   `old`, `new`). "View original" shows the raw n8n body.
5. **Post attempts.** Each attempt with its outcome, HTTP status, version sent, who, when, counts, and the full
   result: `TxnID`s per row on success, findings on `held`.
6. **History / timeline.** Events: created, flagged duplicate, edited, validated, post started/finished, discarded,
   restored, resolved.
7. **Users (admin).** List, create (shows a one-time temporary password **once**), change role, disable/enable,
   reset password, unlock, per-user audit.

## 4. Authentication flow

- `POST /api/v1/auth/login` `{ email, password }` → `{ accessToken, expiresUtc, user }`, plus a **refresh cookie**
  (`HttpOnly`, `Secure`, `SameSite=Strict`, path `/api/v1/auth`).
- Keep the access token **in memory only**, never in localStorage. Send `Authorization: Bearer <token>`.
- The access token lasts about 15 minutes. On `401`, call `POST /api/v1/auth/refresh` once (the browser sends the
  cookie), then retry the original call. If refresh fails, go to sign-in. On page load, call refresh to restore the
  session.
- `POST /api/v1/auth/logout` on sign out. `GET /api/v1/auth/me` gives `{ id, email, displayName, role,
  mustChangePassword, scopes }`.
- **Same site required (open question Q-82)**: the refresh cookie is `SameSite=Strict`, so the dashboard must be
  served from the same site as the API (behind the same reverse proxy, or through the Vite dev proxy in development,
  e.g. `/api → https://qb-server:5443`). Raise it in the React spec if that cannot be true.

## 5. API the dashboard calls

All routes are under `/api/v1`. Errors are RFC 7807 problem details: `{ type, title, status, detail, … }`, plus
extension fields. Show `title`/`detail` to the user, and branch on `status` and the documented codes below.

### 5.1 Auth

| Call | Notes |
|---|---|
| `POST /auth/login` | `401 invalid-credentials`, `423 locked-out` (+`Retry-After`), `503` database down |
| `POST /auth/refresh` | `401` → sign in again |
| `POST /auth/logout` | |
| `GET /auth/me` | |
| `POST /auth/change-password` | `{ currentPassword, newPassword }`. Minimum 12 characters. |

### 5.2 Saved requests

| Call | Role | Notes |
|---|---|---|
| `GET /saved-requests?status=&needsAttention=&duplicate=&q=&createdFrom=&createdTo=&source=&sort=&page=&pageSize=` | all | `{ items, page, pageSize, total }` |
| `GET /saved-requests/stats` | all | counts per status and flag |
| `GET /saved-requests/{id}` | all | full record + latest `payload` + `validation` + `allowedActions`. Returns an `ETag` (keep it for edits/posts). |
| `GET /saved-requests/{id}/original` | all | raw body exactly as n8n sent it |
| `GET /saved-requests/{id}/versions` · `/versions/{n}` | all | list / one version with `changes` |
| `GET /saved-requests/{id}/attempts` · `/attempts/{attemptId}` | all | list / one attempt with full `result` |
| `GET /saved-requests/{id}/events` | all | timeline |
| `PUT /saved-requests/{id}` | editor, admin | body `{ payload, note? }`. **Header `If-Match: <ETag>` required.** `412` = someone else changed it (response names who/when → offer reload). `409 not-editable` = wrong status. |
| `POST /saved-requests/{id}/validate` | editor, admin | refreshes the validation snapshot |
| `POST /saved-requests/{id}/post` | editor, admin | body `{ confirmDuplicate?: boolean }`, send `If-Match`. See §6. |
| `POST /saved-requests/{id}/discard` | editor, admin | `{ reason }`, required, 1–500 chars. `409 not-discardable` if not pending. `If-Match` optional, honoured. |
| `POST /saved-requests/{id}/restore` | admin | `409 not-restorable` if not discarded. `If-Match` optional. |
| `POST /saved-requests/{id}/resolve` | admin | `{ outcome: "posted" \| "not-posted", note }`. The note is required (1–500). A partial request can only be resolved as `posted`; anything else is `409 not-resolvable`. |

History lists (`versions`, `attempts`, `events`) come back as `{ "items": [...] }`, newest first. Enum values in these responses are kebab-case (`in-progress`, `not-posted`). An attempt's `error` is short fixed text such as `post-outcome-unknown: TimeoutException`, never a raw server message.

### 5.3 Supporting

| Call | Role | Notes |
|---|---|---|
| `GET /quickbooks/lists` | all | accounts, vendors, customers, for edit dropdowns (account, lineAccount, payee) |
| `GET /health/database` | all | status indicator (database). Other `/health/*` routes are not available to dashboard users. |

### 5.4 Users (admin)

| Call | Notes |
|---|---|
| `GET /users?q=&role=&disabled=&page=&pageSize=` | |
| `POST /users` `{ email, displayName, role }` | `201` with `temporaryPassword`, **show once**. `409` email exists. |
| `GET /users/{id}` | |
| `PATCH /users/{id}` `{ displayName?, role?, disabled? }` | `If-Match` required. `409 last-admin`. |
| `POST /users/{id}/reset-password` | returns a new `temporaryPassword` |
| `POST /users/{id}/unlock` | |
| `GET /users/{id}/audit` | |

## 6. Posting: what the UI must handle

Post is **synchronous and can take minutes** for a large statement. The UI must:

- disable the Post button immediately on click and show progress;
- use a long timeout. If the call times out or the tab closes, the post **keeps running on the server**. Recover by
  polling `GET /saved-requests/{id}` every few seconds while `status === "posting"`;
- never retry a post automatically.

| Response | Meaning | UI |
|---|---|---|
| `200`, `status: posted` | All rows in QuickBooks | Success. Show `TxnID`s and `postId`. Request is now locked. |
| `200`, `status: partial` | Some rows landed and some did not | Warning. List held rows. Admin must resolve. |
| `200`, `status: failed` | Nothing landed | Error. Request is back to `pending`, unless QuickBooks did not answer. |
| `200`, request `status: unknown` | QuickBooks got the data but never answered | Warning: "may have posted". Locked until an admin checks QuickBooks and resolves it. |
| `422` | Validation: nothing sent | Show every finding against its row. Request stays editable. |
| `400` | Payload unreadable / control total wrong / dryRun present | Show the errors. Fix by editing. |
| `409 busy` | QuickBooks is in use | "Try again in a few seconds" (`Retry-After`). |
| `409 already-posting` / `already-posted` | Someone else pressed Post | Reload. Show their attempt. |
| `409 duplicate-unconfirmed` | Flagged as a possible duplicate | Show the other request and its status. Ask the user to confirm, then re-send with `confirmDuplicate: true`. |
| `412` | The request changed since you loaded it | Reload before posting. |
| `503` | Backup stale / QuickBooks down / rules missing / database down | Show `detail`. Retry later. |

Every post response carries `savedRequestId`, `attemptId`, and the request's new status as **`savedRequestStatus`**. The `status` field keeps its validate-and-post meaning: the HTTP number in problem bodies, or the post status in a 200.

A post that QuickBooks received but never confirmed (no response, or a timeout after sending) leaves the request **`unknown`**, never `pending`. Show it as "may have posted; an admin must check QuickBooks". The attempt detail (`GET /saved-requests/{id}/attempts/{attemptId}`) includes a `ledgerBatch` summary (batch id, status, counts, posted rows with `txnId`s) when a batch exists, which is what the admin uses to decide how to resolve.

## 7. Statuses and flags to render

| Status | Meaning |
|---|---|
| `pending` | Saved, waiting for review / post |
| `posting` | A post is running |
| `posted` | In QuickBooks (locked) |
| `partial` | Some rows in QuickBooks; admin must resolve |
| `unknown` | Server restarted mid-post; admin must check QuickBooks and resolve |
| `discarded` | Will never post (reason shown) |

Flags (shown alongside the status): **needs attention** (unreadable payload, or validation findings) and **possible
duplicate** (reasons: `same-payload`, `same-reference`, `overlapping-rows`, with a link to the other request).

Attempt outcomes: `in-progress`, `posted`, `partial`, `failed`, `held`, `refused`, `busy`, `unavailable`, `error`,
`unknown`.

## 8. Data shapes (abridged; the API spec has them in full)

**Payload** (what n8n sends, editable):

```json
{
  "reference": "zemen-2019-12",
  "controlTotal": 4820.17,
  "transactions": [
    { "externalId": "row-7", "kind": "Check", "date": "2026-08-05", "amount": 184.32,
      "account": "Chase Checking 4521", "lineAccount": "Repairs and Maintenance",
      "payee": "ABC Plumbing LLC", "checkNo": "1042", "refNumber": "1042",
      "memo": "INV 88213 plumbing repair unit 4", "last4": "4521" }
  ]
}
```

Required per row: `kind`, `date` (`yyyy-MM-dd`), `amount`, `account`. `controlTotal` must equal the sum of
amounts **to the cent**. The API never recalculates it, so when an editor changes an amount, the UI should show the
running sum next to `controlTotal` and the user must update it themselves. The UI may **display** the sum. It must
not silently write it into `controlTotal`.

`kind` values: take them from the API's OpenAPI document (`GET /api/v1/openapi.json`, `TxnKind`). Do not hard-code
them.

**Validation finding**: `{ index, externalId, reason, detail, candidates[] }`.
**Change**: `{ op: "add"|"remove"|"replace", path: "$.transactions[3].payee", old, new }`.

## 9. Non-functional notes

- **Render every payload string as text.** It comes from emails and is untrusted, so never use
  `dangerouslySetInnerHTML` on it.
- Money is displayed with 2 decimals. Never round or recompute stored amounts.
- Dates in payloads are plain dates (no time zone). Timestamps from the API are UTC ISO-8601; display them in the
  user's local time.
- Generate the API client from `/api/v1/openapi.json` if convenient (e.g. openapi-typescript).
- Undo from the dashboard is **out of scope** for now. A posted request shows its `postId`; undo is done with the
  existing API.

## 10. Open questions to settle in the React spec

1. Hosting: same site as the API (needed for the refresh cookie, Q-82)?
2. Editing UX: inline table editing or a row form? How are added and removed rows shown?
3. Diff presentation: field list vs side-by-side.
4. Notifications or auto-refresh for new requests arriving from n8n (polling interval)?
5. Bulk actions (e.g. discard several)? The API has none yet; adding them is an API change.
