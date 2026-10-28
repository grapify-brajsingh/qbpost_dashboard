# API requirements from the dashboard

**Date**: 2026-10-27 · **For**: the qbautopost API project (`D:\qb_post-issue-2`), to be turned into its own spec
and plan, as an amendment to `docs/saved-requests-postgres.md` (ticket #2) or as a follow-up ticket.
**From**: the dashboard design, `docs/superpowers/specs/2026-10-27-qbautopost-dashboard-design.md` in
https://github.com/grapify-brajsingh/qbpost_dashboard.

Everything in `saved-requests-postgres.md` is assumed as written. This file lists only what the dashboard needs **in
addition to** it, plus the answer to Q-82. Proposals marked *(suggested)* are for the API project to confirm or
replace. The requirement itself is what the dashboard depends on.

---

## Context the API project needs

- The daily user is one accountant (role **admin**) on their own PC on the office network. They clear about 10
  statements each morning, the largest about 200 rows.
- They check each statement against the **bank statement PDF in the original email**. The dashboard does not show the
  PDF. To find the right email, they need the **email subject and received date** on every saved request.
- Most fixes are payee or account. Sometimes an amount.

---

## R-1. Email subject and received time on every saved request (new)

**Need**: every saved request shows the subject and received time of the email it came from, in the list and in the
detail. The dashboard can search by subject and sort by received time.

**What changes**
1. **n8n sends the email metadata with the save.** This is a small n8n change beyond "only the URL" (SR-1). It follows
   from the owner asking for the subject and received date in the dashboard.
   *(suggested)* As an optional top-level object in the body:
   ```json
   { "reference": "…", "controlTotal": 0, "transactions": [ … ],
     "email": { "subject": "Chase statement – Aug 2026",
                "receivedUtc": "2026-10-27T07:12:44Z",
                "from": "alerts@chase.com",
                "messageId": "<abc123@mail.chase.com>" } }
   ```
   Headers were considered and rejected: subjects contain non-ASCII and would need RFC 2047 encoding in n8n.
2. **Stored as request metadata, not payload data.** New nullable columns on `saved_requests`: `email_subject`
   (text, max 998 chars, truncated beyond), `email_received_utc` (timestamptz), `email_from` (text),
   `email_message_id` (text). They are filled from `email` in the **original body at save**, and are never changed by
   an edit.
   *(suggested)* The `email` object stays in `original_body` and version 1 as received (byte-for-byte rule
   unchanged), but it is **excluded from**: binding to `SyncPostRequest` (already true: unknown fields are ignored,
   §10.14), the canonical hash for duplicate detection (§9), and the change list (§8.3). Edits that drop or alter
   `email` must not change the stored metadata.
3. **Missing or malformed `email`** (older n8n workflow, or a field of the wrong type): the save still succeeds, the
   columns stay null, and nothing is flagged. The dashboard shows "—".
4. **Returned** in `GET /saved-requests/{id}` and in list summary rows:
   ```json
   "email": { "subject": "…", "receivedUtc": "…", "from": "…", "messageId": "…" }   // or null
   ```
5. **List query** (§6.5):
   - `q` also matches `email_subject` (case-insensitive contains).
   - `sort` accepts `received` / `-received`. Rows with no received time sort as if received at `created_utc`
     *(suggested)*.
   - `receivedFrom` / `receivedTo` (dates, UTC) filters, like `createdFrom`/`createdTo`.
6. **Idempotency**: when n8n sends `Idempotency-Key`, the recommendation stays the email's Message-ID (§10.1).
   Nothing else changes.
7. OpenAPI: document `email` on the save body and on both response shapes, and the new query parameters.

**Acceptance**
- A save with `email` returns it on detail and list, and the subject is searchable.
- A save without `email` works exactly as today.
- Editing the payload never changes `email` metadata, the duplicate hash, or the change list because of `email`.
- `sort=received` orders by received time; `receivedFrom`/`To` filter by it.

## R-2. Serve the dashboard from the API (answers Q-82: same site, yes)

**Decision (owner, 2026-10-27)**: the accountant opens the dashboard in a browser on their own PC on the office
network. The **API serves the dashboard's built static files from the same origin** (for example
`https://qb-server:5443/`), so the `SameSite=Strict` refresh cookie works and **no CORS is needed**.

**What changes**
1. The API serves static files from a configured folder, *(suggested)* `Dashboard:Path`, default
   `C:\qb-autopost\dashboard`. The folder holds the output of the dashboard's `npm run build` (`index.html` +
   `assets/`).
2. **SPA fallback**: any `GET` that is **not** under `/api/` and does not match a file returns `index.html` (so
   `/requests/123` deep links work). Anything under `/api/` that is unknown stays a JSON `404` problem, never HTML.
3. These static routes need **no authentication** (they contain no data). The API-key middleware / caller resolver
   must let them through. Every `/api/` route is unchanged.
4. Caching: `index.html` gets `Cache-Control: no-cache`. Files under `assets/` (content-hashed names) get
   `Cache-Control: public, max-age=31536000, immutable`.
5. Security headers on the HTML *(suggested)*: `Content-Security-Policy: default-src 'self'; img-src 'self' data:;
   style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
   and `Referrer-Policy: no-referrer`.
6. If the folder is missing or empty, `/` returns a plain `404` (or a one-line "dashboard not installed" page), and
   the API keeps working.
7. **HTTPS on the office network**: the refresh cookie is `Secure`, so the dashboard must be reached over HTTPS with a
   certificate the accountant's browser trusts. The runbook needs a step for the server certificate (internal CA or
   a self-signed cert installed in the accountant PC's trust store) and for opening the port in the Windows firewall
   **for the office network only**.
8. Deploy: `deploy/` gains a step to copy a dashboard build into `Dashboard:Path`. Runbook documents the URL.

**Acceptance**
- `GET /` and `GET /requests/123` return the dashboard. `GET /api/v1/nope` returns a JSON 404.
- Signing in from another PC on the network over HTTPS keeps the session across a page reload (refresh cookie works).
- No CORS headers are emitted.

## R-3. Long-running post over a browser connection (confirm)

The dashboard calls `POST /saved-requests/{id}/post` with a 10-minute client timeout and never retries it.
**Confirm** that Kestrel or any proxy in front does not cut the connection earlier for a large statement (about 500
rows), and that a client disconnect does **not** cancel the post (§10.5). If a server-side limit exists, document it
so the dashboard can match it.

## R-4. Small contract confirmations the dashboard relies on

Each of these is already implied by the spec. Please make it explicit in the OpenAPI document and the tests:

1. `GET /saved-requests/{id}` returns `ETag` and it is readable by the browser (same origin, so no
   `Access-Control-Expose-Headers` needed under R-2).
2. `GET /saved-requests/stats` returns counts for **every** status plus `needsAttention` and `duplicate`, so the
   dashboard can show tab counts without extra calls. *(suggested shape)*
   `{ "byStatus": { "pending": 7, "posting": 0, "posted": 120, "partial": 0, "unknown": 1, "discarded": 3 },
   "needsAttention": { "pending": 2, "all": 4 }, "duplicate": { "pending": 1, "all": 3 } }`.
   The dashboard's "Needs attention" and "Possible duplicates" tabs show **pending** requests only, so it needs the
   pending-only flag counts. The list's `status` + `needsAttention`/`duplicate` filters must combine (AND).
3. The validation snapshot carries `versionNumber`, so the dashboard can tell a stale snapshot (already in §6.4).
4. `409 already-posting` / `already-posted` include the winning `attemptId` and who started it.
5. `412 edited-by-someone-else` includes `rowVersion`, `updatedUtc` and `updatedBy { id, name }`.
6. `GET /quickbooks/lists` is reachable with `lists:read` by every role (already in §11.3), and its shape (accounts,
   vendors, customers, `syncedUtc`) is in the OpenAPI document.
7. `TxnKind` is in the OpenAPI document as an enum (it is today: `Check`, `CcCharge`, `CcCredit`, `Deposit`, `Skip`).
8. `GET /saved-requests/{id}/attempts/{attemptId}` for `posted` and `partial` includes the per-row `txnId` list as in
   validate-and-post §6.1.
9. **`GET /saved-requests/{id}` exposes the matching ledger batch** when the request is `partial` or `unknown` and
   the last attempt has a `postId`, so the resolve dialog can show it **before** the admin chooses (§10.6 puts it only
   in the resolve response, which is too late). *(suggested shape)*
   `"ledgerBatch": { "postId": "api-zemen-2019-12", "status": "posted|partial|failed|…", "createdUtc": "…",
   "counts": { "submitted": 134, "posted": 120 } }`, or `null`.
10. **Refresh-token reuse grace** *(suggested)*: the dashboard coordinates refreshes across browser tabs, but a reload
    during a refresh can still present the just-rotated token. Accept the immediately previous token for a short
    window (for example 30 s) and return the **same** successor instead of revoking the whole family. A token reused
    after the window still revokes the family.
11. **`partial`**: validate-and-post is all-or-nothing, so please confirm whether a post by id can ever end
    `partial`. The dashboard renders it defensively either way.

---

# Dashboard v2 additions (2026-10-28)

**From**: `docs/superpowers/specs/2026-10-28-dashboard-v2-pages-design.md`. The owner reviewed the dashboard on the
fake API and asked for separate pages: a **Statements** page where every push from n8n is its own row, a statement
page where rows can be edited, added, deleted or marked **"don't post"**, a full **Audit trail** page ("who changed
which transaction and when"), and a Users page. R-5 to R-9 are what that needs from the API. The dashboard's fake API
(MSW) implements them exactly as written here until the real API catches up, so **please flag any shape you change**.

## R-5. Push ID: a GUID n8n sends with every push (new)

**Need**: the owner wants each push identified by a random GUID that n8n generates per request. The same bank
statement can be pushed several times a day; each push is a separate saved request and the dashboard shows the push
ID on every row.

1. n8n sends `pushId` (a UUID, any version) as a top-level body field on `POST /saved-requests`. *(suggested)*
   It may also send it as `Idempotency-Key`; they are independent. Malformed (not a UUID) → the save still succeeds,
   the column stays null, and the request is flagged `needsAttention` with read error `$.pushId: not a UUID`.
2. New nullable column `saved_requests.push_id` (`uuid`), **unique when not null**. A second save with a `pushId`
   that already exists returns the **existing** request with `200` (like an idempotent replay, §10.1), never a second
   row.
3. Like `email` (R-1): stays in `original_body` and version 1, is excluded from binding, the duplicate hash, and the
   change list. Edits never change it.
4. Returned as `pushId` (string or null) on detail and list rows. List `q` matches it (prefix, case-insensitive, with
   or without dashes).
5. Missing `pushId` (older n8n flows, or a request created in the dashboard) → null; the dashboard shows the
   `SR-…` ref instead.

**Acceptance**: a save with `pushId` returns it; repeating the same `pushId` returns the same request; searching by
the first 8 characters finds it.

## R-6. Per-row "don't post", and rows added in the dashboard (new)

**Need**: the accountant marks some real rows (e.g. a transfer between their own accounts) as **don't post**. The row
stays in the statement and in the history; it is not sent to QuickBooks.

1. **Row field `post`** (boolean, optional, default `true`) in the saved payload. Stored as part of the payload
   like any other field, so it is versioned and appears in the change list as
   `{ "op": "replace", "path": "$.transactions[i].post", "old": true, "new": false }`. A missing `post` means `true`;
   the change list must treat "missing" and `true` as equal.
2. **Post by id** (`POST /saved-requests/{id}/post`) and **validate**: rows with `post: false` are sent to
   validate-and-post with **`kind: "Skip"`** and are otherwise unchanged. The stored payload keeps the real kind.
   - **Please confirm** that a `Skip` row (a) still counts toward the `controlTotal` check (the control total is the
     bank statement's total and must not change because a row is skipped), (b) is reported under `skipped` /
     `counts.skipped`, never `held`, and (c) is never sent to QuickBooks. `DirectPlanner.WithCallerNames` returns
     early for `Skip`, and `QbXmlBuilder` skips it, so (c) looks true today; (a) and (b) need a test.
   - If a `Skip` row is not allowed through validate-and-post, the alternative is to drop `post:false` rows from the
     body **and** send `controlTotal` minus their sum. That writes a derived control total, which v1 anti-goals
     forbid unless it is shown to the user, so the dashboard prefers the `Skip` route.
3. A post where every row is `post: false` → `400 nothing-to-post`; the dashboard disables Post in that case anyway.
4. **Rows added in the dashboard** carry `externalId: "dash-<uuid>"`. The API must accept any `externalId` matching
   the existing rule, and keep comparing rows by `externalId` in the change list (§8.3). Please confirm that a
   payload where **some** rows lack `externalId` (older n8n rows) and some have one still diffs sensibly: the
   dashboard needs added and deleted rows reported as `add` / `remove`, not as every later row changing.
   *(suggested)* When n8n rows lack `externalId`, the API assigns `row-<n>` (1-based payload position) at save
   time, in version 1, before any edit. This is the one exception to "version 1 equals the bytes received"; the bytes
   stay in `original_body`.
5. `allowedActions` gains nothing new: marking don't post is an edit.

## R-7. Audit events: one feed for the Audit trail page (new)

**Need**: one page showing every operation by everyone, filterable, newest first: "who changed which transaction and
when". Today the data is spread over `saved_request_events`, `saved_request_versions.changes`, `post_attempts` and
`user_audit`.

1. **`GET /audit-events`** (scope: every role with `requests:read`; user events only for `users:manage`, others
   see request events only).
2. **Query**: `from`, `to` (UTC instants), `actor` (user id, or `api-client:<id>`), `requestId`, `reference`,
   `pushId`, `action` (repeatable), `q` (contains, case-insensitive, over old/new values, field names, reference and
   push id), `page`, `pageSize` (≤ 200, default 50). Sorted `at desc, id desc`.
3. **Response** (paged like §6.5):
   ```json
   { "items": [
       { "id": "ev-9182", "atUtc": "2026-10-28T14:20:11Z",
         "actor": { "id": "u-admin", "name": "Asha K", "kind": "user" },
         "action": "row-edited",
         "request": { "id": 123, "publicRef": "SR-000123", "reference": "chase-2026-08",
                      "pushId": "7f3a…", "emailSubject": "Chase statement – Aug 2026" },
         "row": { "externalId": "row-7", "index": 6 },
         "field": "payee", "old": "ABC Plumbing", "new": "ABC Plumbing LLC",
         "versionNumber": 3, "detail": null } ],
     "page": 1, "pageSize": 50, "total": 812 }
   ```
   `actor.kind` is `user` or `api-client` (name = client id, e.g. `n8n-mailbox`). `request` and `row` are null for
   user events. `old`/`new` are JSON values (string, number, boolean, object for whole rows) or null.
4. **Actions** (enum, in OpenAPI): `received`, `row-edited` (one event per changed field), `row-added`,
   `row-deleted`, `row-post-off`, `row-post-on`, `control-total-changed`, `validated`, `post-started`, `posted`,
   `post-failed` (any non-posted outcome, outcome in `detail`), `discarded`, `restored`, `resolved`,
   `user-created`, `user-role-changed`, `user-disabled`, `user-enabled`, `user-password-reset`, `user-unlocked`,
   `user-password-changed`, `user-signed-in`, `user-sign-in-failed`, `user-locked-out`.
5. **How it's built** *(suggested)*: a view or query over the existing append-only tables. Each version's
   `changes` list expands to one event per op (`replace` on a row field → `row-edited`, or `row-post-off/on` for
   `post`; `add`/`remove` on `$.transactions[i]` → `row-added`/`row-deleted`; `$.controlTotal` →
   `control-total-changed`). The `id` must be stable across calls (for example `v<versionId>-<opIndex>`,
   `e<eventId>`, `u<userAuditId>`). Nothing new is written; nothing is ever updated or deleted.
6. **`GET /audit-events.csv`**: same filters, all matching rows (cap 50,000; above that `413` with a problem telling
   the user to narrow the dates). Columns: time (UTC ISO), actor, action, reference, push id, SR ref, row, field,
   old, new. Values are CSV-escaped and **formula-injection safe** (a leading `=`, `+`, `-`, `@` is prefixed with
   `'`).
7. `GET /saved-requests/{id}` list rows gain `historyCount` (number of audit events for that request), so the
   Statements page can show "History 4" without another call.

## R-8. Statements page: list summary fields and filters (new)

On `GET /saved-requests` rows *(and `GET /saved-requests/{id}` where noted)*:

1. `pushId` (R-5), `email` (R-1), `historyCount` (R-7.7).
2. `validationSummary`: `{ "state": "ok|held|refused|unreadable|unavailable|none", "problemCount": 3,
   "validatedUtc": "…", "versionNumber": 2 }`. `problemCount` = row findings + request-level errors in the latest
   snapshot. `state: "none"` when never validated.
3. `postSummary` when the request has a posted or partial attempt: `{ "postId": "api-amex-2026-09",
   "postedCount": 61, "postedUtc": "…", "postedBy": { "id", "name" } }`, else null.
4. `skipCount`: number of rows with `post: false` in the current version.
5. `otherUnpostedPushes` (detail only): other requests with the **same `reference`** whose status is `pending`,
   `posting`, `partial` or `unknown`, as `[{ "id", "publicRef", "pushId", "receivedUtc", "status" }]`. The Post
   dialog warns from this.

New list query parameters (AND with everything in §6.5 and R-1):

6. `emailFrom` (contains, case-insensitive), `reference` (exact), `minTotal` / `maxTotal` (on `control_total`,
   inclusive), `hasErrors=true` (latest validation `problemCount > 0` or `needsAttention`), `sort` also accepts
   `total`, `-total`, `rows`, `-rows`.
7. `GET /saved-requests/stats` adds `hasErrors: { "pending": n, "all": n }`, same rule as the filter.

## R-9. Users: status filter and the row TxnIDs (small)

1. `GET /users` accepts `status` = `active` | `must-change-password` | `locked` | `disabled` (repeatable), and
   returns `lockedOutUntilUtc` and `mustChangePassword` on list rows, so the dashboard can show the status badge
   without a call per user.
2. `GET /audit-events?actor=<userId>` is how the user page shows that user's activity; `GET /users/{id}/audit` can
   stay as is.
3. Confirmation of R-4.8: the attempt detail for a posted attempt lists every row's `externalId`, `index` and
   `txnId`, so the Results sheet can show "row → TxnID".

## Not needed (decided)

- No bulk endpoints. About 10 statements a day doesn't justify them.
- No PDF or attachment storage. The accountant reads the PDF from email.
- No server push (SSE or WebSocket). The dashboard polls stats every 60 s and a posting request every 3 s.
- No merging of repeat pushes into one statement (v2): the owner wants each push as its own row.
- No editing or deleting of audit events, ever.
