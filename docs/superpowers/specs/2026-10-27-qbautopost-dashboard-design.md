# QbAutopost Dashboard — design

**Date**: 2026-10-27 · **Status**: draft for owner review
**Repo**: https://github.com/grapify-brajsingh/qbpost_dashboard (this project)
**Inputs**: `qbautopost-dashboard-brief.md` (in this repo) and the API contract
`D:\qb_post-issue-2\docs\saved-requests-postgres.md` (qbautopost repo, ticket #2). Where this design and the API spec
disagree on API behaviour, the API spec wins. Where they disagree on what the dashboard shows or how, this design wins.
**API changes this design depends on**: `docs/api-requirements-for-dashboard.md` (handed to the API project).

Marking: decisions made by the owner in conversation are stated plainly. *(builder's call)* marks a choice made while
writing this design. The owner can overrule any of them.

---

## 1. Intent

Bank and card statements arrive by email. n8n extracts the transactions and saves them to the QbAutopost API instead
of posting them straight to QuickBooks Desktop. This dashboard puts **a person between the email and the ledger**.

**The real user and their morning.** One accountant (who holds the **admin** role) opens the dashboard on their own PC
on the office network every morning and clears the statements that came in overnight. That's about **10 statements a
day**, and big ones have about **200 rows**. For each statement they:

1. find the matching email (using the **email subject and received date** shown in the dashboard) and open the bank
   statement PDF from it. The PDF stays in email; the dashboard does not show it;
2. compare the dashboard's rows against the PDF, top to bottom;
3. fix what n8n read wrong. Usually that's a **wrong payee or account**, and sometimes an **amount**;
4. press **Post**, and see exactly what happened.

Success means the accountant can clear the morning's statements quickly, and is never unsure whether something
reached QuickBooks.

## 2. Goals, non-goals, anti-goals

**Goals**
- A morning work queue: what's new, and what still needs a person.
- Fast, accurate row checking and fixing on statements up to about 500 rows (the API's limit), tuned for about 200.
- Posting with an unambiguous result, including the hard cases (partial, may-have-posted, busy, duplicate).
- Full traceability: original n8n body, every version with its change list, every post attempt, and the timeline.
- User management for the admin.

**Non-goals**
- Showing the statement PDF or the email in the dashboard.
- Bulk actions (with about 10 a day it isn't worth an API change).
- Undo of a posted request. The detail page shows `postId`, and undo stays with the existing API.
- Phone or tablet layouts. This is desktop only, and the minimum supported width is 1280 px.
- Creating a saved request by hand in the dashboard.
- Offline use.

**Anti-goals** (failure even if everything else works)
- **Posting the same request twice**, or making a double post one click away (for example by auto-retrying a post).
- **Posting a version the person did not see.** Every post sends `If-Match` with the ETag of what is on screen.
- The dashboard **silently writing `controlTotal`**, or rounding or recomputing any stored amount.
- Rendering payload strings as HTML (they come from emails and are untrusted).
- Storing the access token anywhere but memory.

## 3. Constraints

- **Stack (owner)**: React + shadcn/ui.
- **Hosting (owner, settles Q-82)**: the accountant uses a browser on their own PC on the office network. The API
  serves the built dashboard from the same origin (for example `https://qb-server:5443/`), so the `SameSite=Strict`
  refresh cookie works with no CORS. In development, the Vite dev proxy forwards `/api` to the API. The API change is
  in the API requirements file (R-2).
- **The API is not built yet.** Only the saved-request state machine exists on the API branch
  `feature/2-postgres-saved-requests`. The dashboard must be buildable and testable against **mocks** that follow
  the API spec (§9).
- Auth rules from the brief §4: access token in memory only; on `401`, refresh once and retry; on page load, refresh to
  restore the session.
- Button visibility comes from `allowedActions` on the request detail, never from local role or status rules.
  The API enforces permissions anyway.
- `TxnKind` values come from the OpenAPI document, never hard-coded in UI logic. Today they are `Check`, `CcCharge`,
  `CcCredit`, `Deposit` and `Skip`.

## 4. Tech choices *(builder's call unless noted)*

| Concern | Choice |
|---|---|
| Build | Vite + React 19 + TypeScript (strict) |
| UI | shadcn/ui on Tailwind CSS (owner), with light and dark mode following the OS, and a toggle |
| Routing | React Router (data-router not required) |
| Server state | TanStack Query: caching, polling, invalidation |
| Large table | TanStack Table + TanStack Virtual (200–500 editable rows stay smooth) |
| API types | `openapi-typescript` generated from `/api/v1/openapi.json`, plus `openapi-fetch` for calls. Until the API ships the new routes, types are hand-written in `src/api/types.ts` from the API spec and replaced by generated ones later. |
| Mocks | MSW (Mock Service Worker), used by the dev server (`npm run dev:mock`) and by tests |
| Tests | Vitest + React Testing Library + MSW. Playwright for a few end-to-end smoke paths against mocks. |
| Money | Amounts held as the JSON number the API sent; displayed with exactly 2 decimals; sums computed in integer cents to avoid float drift. |
| Dates | Payload `date` strings are shown as-is (`yyyy-MM-dd`), never parsed into a time zone. API timestamps (UTC ISO) are shown in local time. |

## 5. App shell and navigation

- Top bar: product name, **Requests**, **Users** (only when `/auth/me` scopes include `users:manage`), a database
  status light from `GET /health/database` (polled every 60 s; green/red with tooltip), the signed-in user's name with
  a menu (Change password, Sign out), and the theme toggle.
- Routes:
  - `/sign-in`, `/change-password`
  - `/requests` (list) and `/requests/:id` (detail, with tabs)
  - `/users`, `/users/:id` (admin)
- Unknown route → "not found" page with a link to Requests.

## 6. Screens

### 6.1 Sign in and password

- Email and password form. Error handling:
  - `401 invalid-credentials` → "Email or password is wrong."
  - `423 locked-out` → "Locked. Try again in N minutes." (N computed from `Retry-After`)
  - `503` → shows the problem's `detail`.
- After login, if `mustChangePassword` is true, the forced **change password** screen appears. It's the only screen
  reachable until the password is changed. Any `403 password-change-required` from any route also sends the user
  there.
- Change password: current, new, confirm. The new password needs at least 12 characters, checked before sending.
  Success → back to where they were going.
- Session restore on load: call `POST /auth/refresh`. Success → in. Failure → sign-in, then return to the URL they
  asked for.
- Sign out: `POST /auth/logout`, clear all cached data, go to sign-in.

### 6.2 Requests list: the morning queue

- **Default view (*builder's call*) is "To do"**: `status=pending` plus anything an admin must act on
  (`partial`, `unknown`), sorted **oldest email received first**, so the accountant works the queue in order.
- Preset tabs above the table, each with a count from `GET /saved-requests/stats`: **To do**, **Needs attention**,
  **Possible duplicates**, **Posting**, **Posted**, **Discarded**, **All**.
  *(builder's call)* "Needs attention" and "Possible duplicates" mean **pending requests with that flag**
  (`status=pending&needsAttention=true`, `status=pending&duplicate=true`), because a flag on a posted or discarded
  request isn't work. Their counts come from the per-status flag counts asked for in API R-4.2, so tab counts always
  match the rows shown. The "N new" pill watches the To-do count.
- Filters: free-text search (`q`: reference, `SR-…`, payee, memo, and email subject; see R-1), received date range,
  and source.
- Columns: Ref (`SR-000123`), **Email subject**, **Received** (local time), Reference, Rows, Control total (2 dp,
  right-aligned), Status badge, Flags (needs attention, possible duplicate of `SR-…`), Last attempt outcome, and
  Updated (when and by whom).
- Server paging, 25 per page. Clicking a row opens the detail page.
- **New arrivals (*builder's call*)**: while the list is open, stats are polled every 60 s. When the To-do count goes
  up, a "N new — show" pill appears; clicking it reloads the list. Rows never move on their own.
- Empty "To do" shows "All clear. Nothing waiting."

### 6.3 Request detail

**Header** (always visible above the tabs):
- `SR-000123`, status badge, flags. "Possible duplicate of SR-000117 (same-reference)" links to the other request and
  shows its status.
- **Email subject** and **received** (local time), shown prominently because the accountant uses them to find the
  email. Plus reference, source, created and updated (who, when), and `postId` once present.
- A banner for any status that blocks work: `posting` ("Posting… started by X at T"), `posted` (locked, with
  `postId`), `partial` and `unknown` (with an admin call to action), and `discarded` (with the reason).
- Action buttons, driven only by `allowedActions`: **Save changes**, **Validate**, **Post**, **Discard**, **Restore**,
  **Resolve**. Actions not in the list are hidden.

**Tabs**: Transactions (default) · Versions · Attempts · History.

#### 6.3.1 Transactions tab: inline editing (owner chose inline over a side panel)

- **Validation panel** above the table: snapshot state (`ok`, `held`, `refused`, `unreadable`, `unavailable`),
  counts, and "checked N min ago" from `validatedUtc`, with a **Re-validate** button. Request-level `errors` are listed
  here (for example a control-total mismatch). `unknownNames` are listed as chips.
- **Table**: one row per transaction, **in payload order** (the PDF's order), with a sticky header and virtualised
  rows. Columns: #, Date, Kind, Payee, Account, Line account, Amount, Check no, Ref no, Memo, Last 4, External id.
  Narrow columns (Check no, Ref no, Last 4, External id) can be hidden from a column menu. Visibility is remembered per
  browser.
- **Row problems**: rows with a validation finding (matched by `index`, with `externalId` as a cross-check) get a
  red left edge and an icon. Hovering or focusing shows `reason`, `detail` and `candidates`. Clicking a candidate fills
  the relevant cell. A **"Only rows with problems"** toggle filters the table. Read errors on an unreadable payload
  (JSON paths such as `$.transactions[3].kind`) mark the matching cell.
- **Editing (editors and admins, status `pending`, and `edit` in `allowedActions`)**:
  - Click or press Enter on a cell to edit it. Tab and Shift+Tab move between cells, Esc cancels the cell, and
    arrow keys move between cells when not editing.
  - **Payee**: a searchable combobox fed by `GET /quickbooks/lists`. It searches **customers** when the row's kind is
    `Deposit` and **vendors** otherwise (that is how the API resolves payees). Free text is still allowed, but a name
    not in the list is flagged "not in QuickBooks" right away.
  - **Account / Line account**: searchable combobox over accounts. Free text is allowed but flagged the same way.
  - **Kind**: a select with values from the OpenAPI `TxnKind` enum. A value that isn't in the enum (for example
    `Cheque` in an unreadable payload) is shown as-is, flagged, and replaceable.
  - **Amount**: a numeric input accepting at most 2 decimals. It's stored as a JSON number.
  - **Date**: a text input with a date picker. It must be `yyyy-MM-dd`.
  - Changed cells are tinted until saved. The table toolbar shows "N unsaved changes", with **Discard changes** and
    **Save changes**.
  - **Add row** (at the end) and **Delete row** (row menu, with confirmation) exist but are low-key. They're rare.
    Rows marked for deletion appear struck through until saved.
  - **Every field the dashboard doesn't edit is preserved.** That includes unknown extra fields on rows and at the
    top level (API spec §10.14). The save sends the full payload: the loaded payload with only the edited cells
    changed.
- **Totals bar** (sticky under the table): **Sum of rows**, **Control total** (editable field), and the difference,
  shown in red when it isn't zero. It updates live as amounts change. The dashboard **never** writes the sum into
  `controlTotal`.
- **Save**: `PUT /saved-requests/{id}` with `If-Match` (from the detail's ETag) and an optional note (a small input
  next to Save, placeholder "What did you fix? (optional)"). On success, the returned record replaces the screen,
  including the new validation snapshot and ETag.
  - `412` → a dialog: "Changed by {name} {time ago}. Your edits are kept here; reload to see theirs." The options are
    *Reload (lose my edits)* and *Copy my edits* (to the clipboard as JSON) *(builder's call: no merge UI)*.
  - `409 not-editable` → reload and show the new status.
  - `400`/`413` → show the problem `detail`; edits stay on screen.
- **Leaving with unsaved edits** (route change or tab close) asks for confirmation.
- **Post is disabled while there are unsaved edits** ("Save first"), so what's posted is always what's on screen
  and saved.
- **Unreadable payload fallback (*builder's call*)**: if the payload is so broken that it can't be shown as a table
  (`transactions` missing or not an array, or the payload not shaped like an object with rows), the tab shows a
  **raw JSON editor** (monospace text area with a parse check) instead of the table, with the read errors listed
  above it. Saving sends the parsed JSON.

#### 6.3.2 Posting

- **Post** opens a confirm dialog: the email subject, row count, control total, and validation state. If the snapshot
  isn't `ok` or is stale (older than the current version), the dialog says so but still allows posting. The API
  re-validates anyway.
- **Duplicate**: if the request is flagged, the dialog also shows the other request (ref, status, link) and needs a
  "Yes, post anyway" checkbox. The request is sent with `confirmDuplicate: true`. A `409 duplicate-unconfirmed`
  response opens the same confirmation.
- On confirm: the Post button is disabled immediately, and a blocking progress state shows ("Posting N rows to
  QuickBooks… this can take a few minutes. You can leave this page; the post keeps running."). The request uses a
  **10-minute client timeout** and is **never retried automatically**.
- **Recovery**: if the call times out or the page is reopened while the status is `posting`, the detail page polls
  `GET /saved-requests/{id}` every 3 s until the status changes, then shows the outcome from the latest attempt.
- Outcome display (in place, plus a toast):

| Response | Shown as |
|---|---|
| `200` posted | Success banner with `postId`; Attempts tab shows `TxnID` per row. Request locked. |
| `200` partial | Warning: "Some rows posted, some didn't." Lists held rows; admin gets **Resolve**. |
| `200` failed | Error: "Nothing was posted." Request is back to `pending`. |
| `200` with status `unknown` | Warning: "QuickBooks may have posted this. Check QuickBooks before resolving." Admin gets **Resolve**. |
| `422` | "Nothing was sent." Findings are applied to the table rows (same display as validation). |
| `400` | The errors, listed; editable. |
| `409 busy` | "QuickBooks is busy. Try again in N seconds." The Post button re-enables after `Retry-After`. |
| `409 already-posting` / `already-posted` | Reload; a banner says who pressed Post and links their attempt. |
| `412` | "This changed since you opened it." Reload. |
| `503` | The problem's `detail`; "Try again later." |

#### 6.3.3 Discard, restore, resolve

- **Discard**: dialog with a required reason (1–500 chars).
- **Restore** (admin): confirm dialog.
- **Resolve** (admin, `partial` or `unknown`): dialog that first shows the last attempt's `postId`, its counts and
  per-row results, and the ledger batch from `GET /saved-requests/{id}` (`ledgerBatch`, API R-4.9). It then reminds the
  admin to check QuickBooks. Choices are **Posted** or **Not posted**, with a required note. If `ledgerBatch` is
  absent (older API), the dialog shows `postId` only and still works.
- **`partial` (*builder's call*)**: validate-and-post is all-or-nothing (its §5.1), so `partial` should never occur.
  The dashboard renders it defensively: warning banner, held rows listed, and Resolve offering only **Posted (accept
  as is)**, with the note "post any remaining rows outside the dashboard". No "create from remaining rows" feature.

#### 6.3.4 Versions tab

- List of versions: number, who, when, note, change count. Selecting one shows its **change list as plain
  sentences** *(builder's call; no side-by-side diff)*, for example "Row 2 (row-7) payee: ABC PLUMBING → ABC Plumbing
  LLC", "Control total: 4,820.17 → 4,784.17", "Row 13 added", "Row 8 removed" with expandable details.
- **View original**: shows `GET /{id}/original` as pretty-printed, read-only JSON (raw text also available), with a
  copy button.

#### 6.3.5 Attempts tab

- One row per attempt (newest first): outcome badge, HTTP status, version sent, who, started and finished time,
  counts. Expanding an attempt loads `/attempts/{attemptId}` and shows:
  - posted rows with their `TxnID`s (index, externalId, kind, account, amount, txnId);
  - held findings (as in validation);
  - for errors, the problem `title`/`detail`;
  - resolution (who, when, note) if resolved.

#### 6.3.6 History tab

- A vertical timeline from `/events`: icon and sentence per event kind (created, flagged duplicate, edited,
  validated, post started, post finished, discarded, restored, resolved), with actor and local time. Unknown event
  kinds are shown generically, not dropped.

### 6.4 Users (admin)

- List with search, role filter, and "show disabled". Columns: name, email, role, status (active, disabled, locked
  until …), last login.
- **Create user**: email, display name, role. On `201`, a dialog shows the **temporary password once**, with a copy
  button and "You won't see this again." `409` → "That email already exists."
- **User page**: change role or display name, disable or enable (`PATCH` with `If-Match`; `409 last-admin` → explained
  message), **Reset password** (shows the new temporary password once), **Unlock**, and the audit list.
- The admin cannot disable themselves (the button is hidden for self; the API refuses anyway).

## 7. Cross-cutting behaviour

- **Auth client**: one fetch wrapper adds the bearer token. On `401` it makes a single refresh call (shared if several
  requests fail at once), retries the original call once, and on refresh failure clears state and goes to sign-in.
  **Post is exempt from retry-after-refresh** *(builder's call)*: if a post gets `401`, the dashboard refreshes the
  session and then reloads the request rather than re-sending the post. That keeps "never retry a post" absolute.
  (A `401` means the API rejected the call before posting, but the rule stays simple.)
- **Several tabs (*builder's call*)**: the API rotates refresh tokens, and reusing a revoked one signs the user out
  everywhere. So refresh is coordinated **across tabs** with the Web Locks API (`navigator.locks`, one lock name):
  inside the lock, a tab first checks a `BroadcastChannel` message or a fresh token from another tab before calling
  `/auth/refresh` itself. The new access token is broadcast to other tabs. Opening the duplicate in a new tab, or
  leaving a post running in one tab, must not sign anyone out. Tests cover two tabs refreshing at once. (The API
  requirements also ask for a short reuse grace as a safety net, R-4.10.)
- **Errors**: every problem response shows `title`/`detail` in a toast or inline. Code branches on `status` plus the
  documented code. Unknown errors show "Something went wrong" with the request's `requestId` if present.
- **Untrusted text**: all payload, email-subject and note strings are rendered as React text. Lint bans
  `dangerouslySetInnerHTML`.
- **Formatting**: money uses `en-US`-style grouping, 2 decimals, right-aligned, tabular numerals *(builder's call on
  locale)*. Timestamps are local, with relative time on hover.
- **Accessibility**: keyboard reachable everywhere (the table especially), visible focus, labels on all inputs, and
  status conveyed by text as well as colour.
- **Refreshing data**: detail data is refetched when the tab regains focus, unless there are unsaved edits.

## 8. Project layout *(builder's call)*

```
src/
  api/          client (fetch wrapper, auth, problem parsing), types, query hooks per resource
  auth/         session context, sign-in, change-password, route guards
  features/
    requests/   list, detail, transactions table, posting, versions, attempts, history
    users/
  components/   shadcn/ui and shared pieces (StatusBadge, Money, Timestamp, ProblemAlert)
  lib/          money (cents math), dates, format
  mocks/        MSW handlers + fixtures modelled on the API spec examples
```

## 9. Testing

- **Unit**: money math (sum in cents, 2-dp display, no rounding of stored values), payload edit-preservation
  (unknown fields survive an edit round trip), change-list sentence formatting, mapping post responses to the outcomes
  in the table above, and the auth refresh-once logic (including that a post is never re-sent).
- **Component** (RTL + MSW): sign-in errors, forced password change, list presets and counts, inline editing with the
  totals bar, `412` dialog, the post flow for every response row in §6.3.2, polling recovery from `posting`, buttons
  following `allowedActions`, and temporary-password-shown-once.
- **E2E smoke** (Playwright on the mock server): sign in → open a request → fix a payee → save → post → see TxnIDs.
- **Mocks** are the contract until the API ships. When the API's `openapi.json` includes the new routes, generated
  types replace hand-written ones, and the build must still pass.

## 10. Delivery

- The production build (`npm run build`) outputs static files the API serves (API requirement R-2). The dashboard
  uses relative `/api/v1` URLs only, so it works under whatever host name the server has.
- `.env` is not needed in production. In development, `VITE_API_PROXY_TARGET` (default `https://localhost:5443`) sets
  the dev proxy target.

## 11. Left to the builder

- Exact visual styling within shadcn/ui defaults, icon choices, and wording of messages (keep it plain).
- Internal component breakdown and state handling inside the transactions table.
- Mock fixture contents (cover every status, flag and attempt outcome).

## 12. Open items

- **API requirements R-1…R-4** (`docs/api-requirements-for-dashboard.md`) must land in the API for the email subject,
  received date, hosting, and sorting to work against the real API. Until then, mocks provide them.
