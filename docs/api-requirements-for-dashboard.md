# API requirements from the dashboard

**Date**: 2026-10-27 · **Last updated**: 2026-10-28 (Home dashboard, R-10 to R-12; see [Changelog](#changelog))
**For**: the qbautopost API project (`D:\qb_post-issue-2`), to be turned into its own spec
and plan, as an amendment to `docs/saved-requests-postgres.md` (ticket #2) or as a follow-up ticket.
**From**: the dashboard designs in https://github.com/grapify-brajsingh/qbpost_dashboard:
`docs/superpowers/specs/2026-10-27-qbautopost-dashboard-design.md` (v1),
`docs/superpowers/specs/2026-10-28-dashboard-v2-pages-design.md` (v2) and
`docs/superpowers/specs/2026-10-28-home-dashboard-spec.md` (Home).

Everything in `saved-requests-postgres.md` is assumed as written. This file lists only what the dashboard needs **in
addition to** it, plus the answer to Q-82. Proposals marked *(suggested)* are for the API project to confirm or
replace. The requirement itself is what the dashboard depends on.

---

## Tracker

One row per requirement. **Mock API** is the dashboard's fake API (MSW, `src/mocks/`), which implements the shapes in
this file so the dashboard can be built and tested before the real API exists. **API status** is owned by the API
project: please update it here (or tell the dashboard project) as each item moves. Every item is **Open** until the API
project confirms it; nothing below has been confirmed yet.

Status values: **Open** (not started or not yet answered) · **Accepted** (agreed, shape may still change) ·
**In progress** · **Done** (released, in OpenAPI) · **Rejected** (with the reason in the item).

| ID | Requirement | Kind | Added | Needed by (dashboard) | Mock API | API status |
|---|---|---|---|---|---|---|
| R-1 | Email subject and received time on every saved request | New fields + filters | 2026-10-27 (v1) | Statements list and search, statement page, Home queue ages | Implemented | Open |
| R-2 | Serve the dashboard's static files from the API (same origin) | New hosting | 2026-10-27 (v1) | Deployment; refresh cookie (`SameSite=Strict`) | n/a (Vite dev proxy) | Open |
| R-3 | Long-running post is not cut off or cancelled | Confirm | 2026-10-27 (v1) | Post dialog | n/a | Open |
| R-4 | Eleven small contract confirmations (ETag, stats shape, 409/412 bodies, ledger batch, refresh-token grace, …) | Confirm (+ 2 small additions: 4.9, 4.10) | 2026-10-27 (v1) | Every page | Items 1–9 implemented; 10 (refresh grace) and 11 (`partial`) not modelled | Open |
| R-5 | `pushId` GUID from n8n on every push | New field | 2026-10-28 (v2) | Statements list, statement page, audit filter | Implemented | Open |
| R-6 | Per-row "don't post" (`post: false` → `Skip`) and dashboard-added rows | New field + behaviour | 2026-10-28 (v2) | Statement page, Post | Implemented | Open |
| R-7 | `GET /audit-events` feed and `GET /audit-events.csv` | **New endpoints** | 2026-10-28 (v2) | Audit trail, user page, **Home** (period figures, flow chart, recent activity) | Implemented | Open |
| R-8 | Statements list summary fields and new filters; `stats.hasErrors` | New fields + filters | 2026-10-28 (v2) | Statements list, **Home** ("Has errors") | Implemented | Open |
| R-9 | Users `status` filter; row TxnIDs on attempt detail | New filter + confirm | 2026-10-28 (v2) | Users page, Results sheet | Implemented | Open |
| R-10 | Contracts the Home page relies on today (audit totals, time filters, event semantics, queue list) | Confirm | 2026-10-28 (Home) | **Home** | Implemented | Open |
| R-11 | `GET /dashboard/summary`: period counts, series, posted value, time to post in one call | **New endpoint** *(suggested)* | 2026-10-28 (Home) | **Home** (replaces 8 + up to 10 calls; adds posted value) | Not implemented | Open |
| R-12 | Statements list: filter and sort by posted time; time-zone-aware received filters | New filters *(nice to have)* | 2026-10-28 (Home) | **Home** drill-downs, Statements list | Not implemented | Open |

### APIs the dashboard needs built

The endpoints and parameters that do **not** exist in `saved-requests-postgres.md` today. Everything else the
dashboard calls (auth, saved-request detail, versions, attempts, post, validate, discard/restore/resolve, users,
QuickBooks lists) is already in that spec.

| Endpoint / change | Requirement | Used by | Priority |
|---|---|---|---|
| `GET /audit-events` (filters `from`, `to`, `actor`, `requestId`, `reference`, `pushId`, `action`, `q`; paged; exact `total`) | R-7, R-10 | Audit trail, user page, Home | **Must**: Home and Audit trail cannot work without it |
| `GET /audit-events.csv` | R-7.6 | Audit trail export | Must |
| `GET /saved-requests/stats` adds `hasErrors` (and the R-4.2 shape) | R-4.2, R-8.7 | Sidebar badge, Statements tabs, Home "Right now" | Must |
| `GET /saved-requests` new fields (`email`, `pushId`, `historyCount`, `validationSummary`, `postSummary`, `skipCount`) and filters (`receivedFrom/To`, `emailFrom`, `reference`, `minTotal/maxTotal`, `hasErrors`, `sort=received|total|rows`) | R-1, R-5, R-7.7, R-8 | Statements list, Home queue | Must |
| `GET /saved-requests/{id}` adds `otherUnpostedPushes`, `ledgerBatch` | R-8.5, R-4.9 | Post dialog, resolve dialog | Must |
| `POST /saved-requests` accepts `email`, `pushId` | R-1, R-5 | (n8n) | Must |
| Row field `post` honoured by validate and post | R-6 | Statement page, Post | Must |
| `GET /users?status=` | R-9.1 | Users page | Should |
| Static files + SPA fallback | R-2 | Deployment | Must (before go-live) |
| `GET /dashboard/summary` | R-11 | Home | Should: Home works without it, with more calls and no posted value |
| `GET /saved-requests?postedFrom=&postedTo=&sort=posted`, time-zone-aware received filters | R-12 | Home drill-downs | Could |

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
   `posted` events carry `detail.postedCount` and `detail.postId`; user events carry `detail.userId`, `detail.email`
   and `detail.displayName` of the user concerned (plus `detail.role` for created and role-changed).
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

---

# Home dashboard additions (2026-10-28)

**From**: `docs/superpowers/specs/2026-10-28-home-dashboard-spec.md`. The dashboard now opens on a **Home** page at `/`
after sign-in. It shows the live queue (to review, has errors, possible duplicates, needs a decision), what moved in the
last 7 / 30 / 90 days (received, posted, post failures, discarded, each against the period before), a per-day chart of
received against posted, all statements by status, the queue's waiting times and its oldest statements, and the latest
audit entries.

**Home is built on endpoints already listed above** (R-4.2 stats, R-7 audit feed, R-8 list), so it needs **no new
endpoint to ship**. R-10 lists exactly what it relies on, so those details do not change underneath it. R-11 and R-12
are improvements: fewer calls, and figures the current API cannot give at all.

## R-10. What the Home page relies on today (confirm)

The Home page computes its period figures from the audit feed. Please confirm each point, and keep it true:

1. **`total` is exact.** `GET /audit-events` returns in `total` the number of **all** events matching the filters,
   whatever `pageSize` is, and accepts `pageSize=1`. Home reads 8 totals this way on every load (4 actions × this
   period and the previous one), e.g. `GET /audit-events?action=posted&from=…&to=…&pageSize=1`.
2. **Filters combine.** `from` and `to` are UTC instants and **both inclusive**. A repeated `action` means "any of these"
   and is AND-ed with `from`/`to` (and every other filter).
3. **Event semantics.** These four actions are counted as statements moving, so each must be emitted exactly once per
   occurrence, timed when it happened:
   - `received`: once per saved request, `atUtc` = the time it was saved (not the email's received time);
   - `posted`: once per attempt that finished `posted`, `atUtc` = when the attempt finished;
   - `post-failed`: once per attempt that finished with any other outcome (held, refused, busy, unavailable, error,
     unknown, partial), `atUtc` = when it finished; `post-started` is never counted;
   - `discarded`: once per discard (a restore and a second discard is a second event).
4. **Role filtering applies to `total` too.** Viewers and editors never see `user-*` events, and their totals never
   count them.
5. **Paging is stable** for the flow chart. Home pages through `action=received&action=posted` for the period,
   200 at a time (newest first, `at desc, id desc`), for at most 10 pages. If the feed holds more, the chart says so
   rather than showing partial bars as complete.
6. **The queue list.** `GET /saved-requests?status=pending[&status=partial&status=unknown]&sort=received&pageSize=100`
   returns the oldest statements first. `received` falls back to `created` when there is no email time (R-1.5), and
   `pageSize` up to 100 is accepted.
7. **Cost.** On load, Home makes 8 count calls, 1–10 feed pages, 1 list call, 1 audit page and the shared stats call
   (polled every 60 s). With about 10 statements a day this is small, but the count calls should be index-backed
   *(suggested: an index on the audit source tables' event time and kind)* so a `pageSize=1` count stays fast as the
   history grows.

**Acceptance**: for any range, `total` for `action=X&from&to&pageSize=1` equals the number of rows the same filter
returns across all pages, and a posted attempt adds exactly one `posted` event at its finish time.

## R-11. `GET /dashboard/summary`: the Home figures in one call (new, suggested)

**Need**: today Home makes up to 18 calls for its period band and chart (8 counts + up to 10 feed pages), cannot show **how much money** was posted,
and cannot show **how long statements wait** before they are posted. Both are real questions for the accountant, and
neither can be answered from the current endpoints. The audit feed has no amounts, and the list cannot filter or sort
by post time.

1. **Request** (scope `requests:read`, every role):
   `GET /dashboard/summary?from=…&to=…&compareFrom=…&compareTo=…&bucket=day|week&tz=Asia/Kolkata`
   - `from`, `to`, `compareFrom`, `compareTo`: UTC instants, inclusive; the compare pair is optional.
   - `bucket`: `day` or `week` (weeks start Monday). `tz`: an IANA time zone for bucket boundaries, so a "day" is the
     accountant's day, not a UTC day. Default `UTC`.
   - `400 invalid-query` if `to < from`, or the range is longer than 366 days.
2. **Response** *(suggested shape)*:
   ```json
   {
     "range": { "from": "2026-09-29T00:00:00+05:30", "to": "2026-10-28T09:41:00+05:30" },
     "counts":   { "received": 41, "posted": 37, "postFailed": 3, "discarded": 2 },
     "previous": { "received": 35, "posted": 39, "postFailed": 1, "discarded": 2 },
     "posted": {
       "rows": 1180,
       "amount": 248391.27,
       "previousRows": 1204,
       "previousAmount": 251002.10
     },
     "timeToPost": { "medianMinutes": 1260, "p90Minutes": 4320, "statements": 37 },
     "series": [
       { "start": "2026-09-29", "received": 2, "posted": 1, "postFailed": 0 },
       { "start": "2026-09-30", "received": 0, "posted": 0, "postFailed": 0 }
     ]
   }
   ```
   - `counts` and `previous` use exactly the R-10.3 event semantics, so the numbers equal what the audit feed shows
     (the Home figures link to the audit trail filtered the same way).
   - `posted.rows`: rows actually sent to QuickBooks by attempts that finished `posted` in the range (not `Skip` rows).
     `posted.amount`: the sum of those rows' `amount`, exactly as stored, with no rounding beyond the stored 2
     decimals. It is **not** the sum of control totals, which include skipped rows.
   - `timeToPost`: for statements whose **first** successful post finished in the range, the time from received
     (`email.receivedUtc`, else `created`) to that post. Median and 90th percentile in minutes, plus how many
     statements it covers. `null` when there are none.
   - `series`: one entry per bucket in the range, **including empty ones**, in time order. Same counting rules as
     `counts`.
   - `previous*` fields are `null` when `compareFrom`/`compareTo` are not sent.
3. **No user events, no per-person figures.** This is a throughput summary, not a productivity report.
4. **Dashboard behaviour once it exists**: Home switches its period band and chart to this one call, adds a
   **Posted value** figure and a **Time to post** figure, and keeps the R-10 audit-feed path as a fallback for an older
   API (detected by a `404` on this endpoint).

**Acceptance**: for the same range, `counts` equals the R-10 audit totals; `series` sums to `counts`;
`posted.amount` equals the sum of `amount` over the TxnID rows of the posted attempts in range; day buckets follow
`tz`.

## R-12. Statements list: posted-time filter and time-zone-aware dates (new, nice to have)

1. `GET /saved-requests` accepts `postedFrom` / `postedTo` (filter on `postSummary.postedUtc`) and `sort=posted` /
   `-posted`. Then Home's **Posted** figure can open the Statements list ("what was posted this week") instead of
   the audit trail, which lists post attempts rather than statements.
2. `receivedFrom` / `receivedTo` are UTC calendar dates (R-1.5), but Home groups waiting time by the accountant's
   **local** day. Near midnight, a "waiting since today" drill-down can then differ by a row or two from the bar that
   opened it. *(suggested)* Accept either an optional `tz` (IANA) that makes the date filters local, or UTC instants
   in `receivedFrom` / `receivedTo`. Plain dates without `tz` keep today's meaning.

**Acceptance**: `postedFrom=2026-10-27&postedTo=2026-10-27&tz=Asia/Kolkata` returns exactly the statements whose post
finished on that local day.

## Not needed (decided)

- No bulk endpoints. About 10 statements a day doesn't justify them.
- No PDF or attachment storage. The accountant reads the PDF from email.
- No server push (SSE or WebSocket). The dashboard polls stats every 60 s and a posting request every 3 s.
- No merging of repeat pushes into one statement (v2): the owner wants each push as its own row.
- No editing or deleting of audit events, ever.
- No per-user productivity figures on the Home page (R-11.3).

---

## Changelog

Newest first. Requirement IDs are never reused; a dropped requirement stays in the file, marked **Rejected**, with
the reason.

| Date | Change | Requirements | Source |
|---|---|---|---|
| 2026-10-28 | Added the **Tracker** (status per requirement, plus a table of the APIs the dashboard needs built) and this **Changelog**. Header now lists all three dashboard designs. | all | — |
| 2026-10-28 | **Home dashboard additions**: R-10 confirms the contracts Home relies on (exact audit `total` with `pageSize=1`, inclusive time filters, one event per received / posted / failed / discarded, queue list paging). R-11 proposes `GET /dashboard/summary` (period counts, series, posted rows and amount, time to post). R-12 proposes posted-time filters and time-zone-aware received filters. Home needs no new endpoint to ship. | R-10, R-11, R-12 | `docs/superpowers/specs/2026-10-28-home-dashboard-spec.md` |
| 2026-10-28 | R-7.3: `posted` events carry `detail.postedCount` and `detail.postId`; user events carry the subject user's `userId`, `email`, `displayName` (and `role` for created / role-changed). | R-7 | commit `aaf56c2` |
| 2026-10-28 | **Dashboard v2 additions**: push ID (R-5), per-row don't post and dashboard-added rows (R-6), audit feed and CSV (R-7), Statements list fields and filters (R-8), Users status filter and row TxnIDs (R-9). "Not needed" list extended (no merging of repeat pushes, no audit edits). | R-5 – R-9 | commit `902ec80`, `docs/superpowers/specs/2026-10-28-dashboard-v2-pages-design.md` |
| 2026-10-27 | First version: email metadata (R-1), serve the dashboard from the API (R-2, answers Q-82), long-running post (R-3), contract confirmations (R-4). | R-1 – R-4 | commit `8b3c331`, `docs/superpowers/specs/2026-10-27-qbautopost-dashboard-design.md` |
