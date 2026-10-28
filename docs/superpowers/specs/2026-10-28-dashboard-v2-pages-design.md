# QbAutopost Dashboard v2: pages, statements, audit trail — design

**Date**: 2026-10-28 · **Status**: approved by the owner (2026-10-28), after the clickable sketch
`.superpowers/brainstorm/2337-1793171651/content/design-v2.html`.
**Builds on**: `docs/superpowers/specs/2026-10-27-qbautopost-dashboard-design.md` (v1). Everything in v1 still holds
unless this document changes it. The anti-goals in v1 §2 hold without exception.
**API side**: `docs/api-requirements-for-dashboard.md`, R-5 to R-9 are new for this design.
> **Partly superseded (note added 2026-10-28)**: §4 "Look and feel" (teal primary, slate neutrals, dark sidebar,
> 10px radius) is replaced by `2026-10-28-ui-refresh-ledger-spec.md`. In §5, `/` no longer redirects to `/statements`:
> it is the Home page (`2026-10-28-home-dashboard-spec.md`), first item in the Work group. Everything else holds.

---

## 1. Intent

The owner looked at v1 running on the fake API and found it too much like one long page. The accountant needs:

- separate pages reached from a **left-side menu**, with **filters on every page**;
- a **Statements** page where each push from n8n is its own row (owner: "2 pushes as separate rows", even when the
  same statement is pushed twice in a day);
- a **statement page** with that push's transactions, where they can **edit, add, delete, and mark rows "don't
  post"** (owner: "mark as don't post", not delete, for real rows that stay out of QuickBooks);
- a complete, filterable **Audit trail** of every operation, answering "who changed which transaction and when"
  (owner's words);
- from each Statements row, quick access to its **history** and its **post results and validation errors**;
- a **Users** page to create and manage users;
- the look of **shadcn/ui** components, "more user friendly, high-tech and visually appealing".

## 2. Vocabulary

| UI word | API object | Notes |
|---|---|---|
| **Statement** (row on the Statements page) | one saved request (`/saved-requests/{id}`) | One push from n8n. Two pushes of the same bank statement are two statements, linked by `reference`. |
| **Push ID** | `pushId` (new, API R-5) | A random GUID n8n generates for every push. Shown shortened (`7f3a…c21`), full on hover and copy. |
| **Reference** | payload `reference` | Names the bank statement, e.g. `chase-2026-08`. Shared by repeat pushes. |
| **Transaction** / row | `transactions[i]` | Identified by `externalId`. |
| **Don't post** | row field `post: false` (new, API R-6) | Row stays in the statement, is not sent to QuickBooks. |
| **TxnID** | `txnId` in a post result | QuickBooks id per posted row. |

## 3. Goals, non-goals, anti-goals

**Goals**: the seven needs in §1; every page filterable; every operation visible in the audit trail with who, when,
and old → new value.

**Non-goals**: grouping repeat pushes into one merged statement (owner chose separate rows); bulk actions; showing the
PDF; real-time push (polling stays as v1).

**Anti-goals** (v1, unchanged): never post twice; never post a version the person didn't see; never write
`controlTotal` silently; never round stored amounts; preserve unknown fields; render untrusted text as text only.
New for v2: **an audit entry is never editable or deletable from the dashboard**, and **"don't post" never removes
data**.

## 4. Look and feel *(owner approved the sketch)*

- **Components**: shadcn/ui throughout (already in the project). Add: Sidebar, Sheet, Switch, Command (exists),
  Calendar + Popover date-range picker, Toggle group, Pagination, Avatar.
- **Tokens**: cool slate neutrals, one **teal** primary (`#0e7490` light, `#22d3ee` dark), status colours emerald
  (ok), amber (warn), rose (problem). Dark sidebar (`#0b1220`) in both themes. Radius 10px for surfaces, 8px for
  controls. Exact values: the sketch's `:root` and `[data-theme="dark"]` blocks; the builder maps them onto the
  shadcn CSS variables.
- **Type**: Geist (shadcn's default family), tabular figures for every number and time.
- **One memorable element**: the reconciliation meter on the statement page (§7.2). Everything else stays quiet.
- Light and dark themes, keyboard focus visible, reduced motion respected, usable at 900px wide (the sidebar collapses
  to an icon rail, then to a menu button below 900px).

## 5. Shell and navigation

- **Left sidebar**:
  - Brand mark and name.
  - **Search or jump to… (Ctrl K)**: a Command menu that finds statements by subject, reference or push ID, and pages
    by name.
  - **Work** group: **Statements** (badge = count of statements to review), **Audit trail**.
  - **Admin** group (only with `users:manage`): **Users**.
  - **My account**.
  - Footer: avatar, name, role, theme switch, sign out.
- **Top bar**: breadcrumb (e.g. Statements / Chase statement, Aug 2026) and the database health light (v1).
- **Routes**:
  - `/sign-in`, `/change-password` (v1)
  - `/statements`, `/statements/:id`
  - `/audit`
  - `/users`, `/users/:id` (admin)
  - `/account`
  - `/` and the v1 `/requests`, `/requests/:id` redirect to the `/statements` equivalents.
- **Filters live in the URL** query string on every page, so a filtered view can be bookmarked, reloaded and shared,
  and Back restores it. Each page has **Clear filters**.

## 6. Statements page (`/statements`)

- **Status tabs** with counts (segmented control): **To review** (pending, plus partial/unknown for admins, as v1
  "To do"), **Has errors** (pending with validation problems or needs-attention), **Posted**, **Discarded**, **All**.
  Counts from `GET /saved-requests/stats`.
- **Filters**: search box (subject, reference, push ID, `SR-…`), and add-on chips: **Received** date range,
  **Reference**, **Sender** (email from), **Amount range** (control total), **Possible duplicate**. Active chips are
  solid with ✕; unset ones are dashed "+ Name".
- **Columns**: Received (time, date under it; a glowing dot when new since the user last looked), Email subject
  (sender under it), Reference with push ID under it, Rows, Total (control total), Status badge, **Validation**
  ("No problems", "N problems", "Not checked", or "N TxnIDs" when posted), and two buttons: **History N** and
  **Results**.
- Row click opens `/statements/:id`. The two buttons open the **statement sheet** (§8) on that tab without leaving the
  list.
- Paging 25 per page, sort by received (newest first by default; column headers sortable for Received, Total, Rows).
- v1 behaviours kept: new-arrivals pill, polling stats every 60 s, "All clear" empty state.
- **"New since you last looked"**: the last time the user opened the Statements page is kept per browser
  (`localStorage`); rows received after it get the dot. *(builder's call; no API needed)*

## 7. Statement page (`/statements/:id`)

Replaces v1's request detail. v1 §6.3.1–6.3.3 rules (inline editing, save with `If-Match`, conflicts, posting,
discard/restore/resolve, unreadable payload fallback) all still apply. What changes:

### 7.1 Header

Email subject as the page title. Meta line: received, from, reference, push ID (copy button), status badge, flags.
Buttons on the right: **History**, **Results** (open the sheet, §8), and a **⋯** menu with Discard / Restore /
Resolve per `allowedActions`. Status banners as v1.

### 7.2 Reconciliation meter

A full-width card above the table:

- **Left**: "Sum of all rows" (large).
- **Middle**: a bar filling toward the control total, and under it "133 of 135 rows will post (2 marked don't post,
  2,262.00)" and "Control total 45,951.17, never changed by the app".
- **Right**: "Matches to the cent" (green) or "Short by 10.00" / "Over by 10.00" (rose).

**The meter compares the sum of all rows, including don't-post rows, with the control total.** The control total is
the bank statement's total; marking a transfer "don't post" does not change what the bank says. *(builder's call,
following API R-6: don't-post rows are sent to validate-and-post as `Skip` and still count toward the control
total.)* Sums use integer cents (v1).

### 7.3 Toolbar and filters

Search (payee, memo, account), chips **Post / Don't post**, **Kind**, **Date** range, **Has a problem**, **Edited**
(changed and unsaved, or changed since version 1), and the **Add transaction** button (primary). Filters hide rows only;
they never change what is saved or posted, and the meter always counts every row. A line under the table says
"Showing 5 of 135 rows (filtered)".

### 7.4 Table

- Columns: **Post** (switch), #, Date, Kind, Payee, Account, Line account, Memo, Amount, delete button. Narrow
  columns from v1 (Check no, Ref no, Last 4, External id) remain hideable.
- **Post switch** off → the row is greyed and struck through, still editable, and counted in "marked don't post".
  It's a draft change like any edit (saved with Save, audited as `post: true → false`).
- **Inline editing exactly as the sketch**: hover shows a tint and ✎; click edits in place; payee/account/kind open a
  searchable list of QuickBooks names (customers for Deposit rows, vendors otherwise, v1 rule); Enter or Tab keeps,
  Esc cancels; a changed cell stays tinted with "was <old value>" under it until saved.
- **Add transaction** opens a dialog (date, kind, payee, account, line account, amount, memo; same validation as the
  cells). The new row is appended, tagged **new** until saved, and gets an `externalId` of `dash-<uuid>`
  *(builder's call; API R-6 allows dashboard-made ids)*.
- **Delete** (trash) opens a confirmation that says "Use this only for a row that shouldn't exist. To keep it but
  leave it out of QuickBooks, switch off Post instead." Deleted rows show struck through with "deleted" until saved.
- Row problems from validation: red left edge and the reason under the cell (v1 behaviour, sketch styling).

### 7.5 Save bar

Fixed to the bottom: "N unsaved changes" with a breakdown ("1 edit, 1 added row, 1 marked don't post"), **Undo
changes**, **Validate**, **Save**, **Post to QuickBooks** (primary). Post stays disabled while there are unsaved
changes (v1).

### 7.6 Post dialog

As v1, plus: "Post 133 rows to QuickBooks? 45,951.17 will post; 2 rows marked don't post are skipped." and an amber
warning when **another push with the same reference is not posted or discarded** ("Push b91e…04d arrived at 09:11.
Make sure you're not posting the same statement twice."). The button names the count: "Post 133 rows".

## 8. Statement sheet (History, Results, Versions)

A shadcn **Sheet** from the right, opened from a Statements row or the statement header. Title: subject and push ID.
Tabs:

- **Results**: the latest validation (state, when and by whom, the list of problems with row numbers, and the
  control-total check), then post attempts newest first (v1 Attempts tab content). For a posted statement: posted by,
  when, counts, ledger batch, and the **row → TxnID** table (first 10, "Show all N").
- **History**: this statement's audit entries, newest first, as a timeline: actor, sentence with old → new values,
  time. "Open in Audit trail" goes to `/audit?statement=<id>`.
- **Versions**: v1 Versions tab (version list, change list, original body viewer).

## 9. Audit trail page (`/audit`)

- Read-only, newest first, grouped by day ("Today, 28 Oct", "Yesterday, 27 Oct", then dates).
- **Filters**: search (payee, value, push ID), **User** (including "n8n" for API clients), **Date** range,
  **Statement** (reference or push), **Action**. All in the URL.
- **Columns**: Time, Who (avatar + name), Statement (reference + push ID, links to the statement), Row (links to the
  statement page scrolled to that row with it highlighted), Action badge, Change.
- **Actions shown**: received, edited (one entry per changed field), row added, row deleted, marked don't post,
  marked post, validated, post started, posted, post failed, discarded, restored, resolved, and user events (user
  created, role changed, disabled, enabled, password reset, unlocked, signed in, sign-in failed, locked out).
- **Change** column: field name, the old value struck through in rose, the new value in emerald. Added/deleted rows
  show the row in one line.
- Paging 50 per page; **Export CSV** downloads the current filtered result (server-generated, API R-7).
- Source: `GET /audit-events` (API R-7). Until the API has it, the fake API serves it.

## 10. Users (`/users`, `/users/:id`)

v1 §6.4 kept. Changes: filters **search**, **Role**, **Status** (active, must set password, locked out, disabled) as
chips; avatar + name + email in one column; inline row actions (Reset password, Unlock, Enable); **New user** dialog
with a role toggle group and a one-line description of each role, then the one-time password dialog (v1 rules: shown
once, closes only on Done). The user page shows that user's audit entries using the Audit trail table, filtered to
them.

## 11. My account (`/account`)

Profile (read-only name, email, role, "Only an admin can change these"), **Change password** (v1 rules, 12+
characters), **Appearance** (Light / Dark / Match computer). Replaces the user menu in the v1 top bar.

## 12. Data the dashboard needs that the API doesn't have yet

Listed in `docs/api-requirements-for-dashboard.md` R-5 to R-9: push ID; row `post` flag and how post-by-id treats it;
a global audit-events endpoint with filters and CSV; list summary fields and filters for the Statements page; user
status filter. **Until the API delivers them, the fake API (MSW) implements them exactly as written there**, so the
dashboard is built and tested against the agreed shapes.

### 12.1 Settled details (from the builder check)

- **Audit entries are derived by the API**, not sent by the dashboard: the API expands each saved version's change
  list into one event per field (R-7.5). Save stays the v1 `PUT` with `If-Match`; nothing new is sent.
- **Row identity** is `externalId`. The API assigns `row-<n>` to n8n rows that lack one (R-6.4); dashboard rows get
  `dash-<uuid>`. An audit Row link opens the statement scrolled to that row and highlighted; if the row no longer
  exists (deleted later), the link opens the statement and a toast says "Row row-7 was deleted in version 4".
- **Tab counts** come from `GET /saved-requests/stats` (v1 shape plus `hasErrors`, R-8.7). "To review" = `pending`
  (+ `partial` and `unknown` for admins), summed from `byStatus` as v1 does.
- **Validation column** uses `validationSummary` on list rows (R-8.2); the Results tab uses the full snapshot from
  `GET /saved-requests/{id}`.
- **Who sees the Audit trail**: every signed-in role sees request events; user events (sign-ins, user changes) only
  appear for `users:manage`. The page itself is visible to all roles.
- **Who** on a user event is the **actor** (the admin who reset a password, or the user who signed in); the subject
  user is named in the Change column.
- **"Edited" filter** = rows with unsaved draft changes, plus rows touched in any saved version, taken from the
  versions' change lists (`GET /saved-requests/{id}/versions`, already used by the Versions tab).
- **Redirects**: `/requests/:id` → `/statements/:id`, same id.

## 13. Testing

As v1 (Vitest + RTL, Playwright smoke, MSW). New coverage:

- Post switch: toggling marks the draft dirty, survives save, and the meter and counts follow; the meter always uses
  all rows.
- Add and delete rows: new `externalId`, unknown fields on other rows preserved, delete confirmation.
- Filters: each page's filters round-trip through the URL; clearing works; table filters never affect the meter or
  the saved payload.
- Audit page: grouping by day, each action's sentence, diff rendering as text (hostile strings stay text), CSV link
  carries the filters.
- Sheet: opens from a list row on the right tab; shows TxnIDs for posted statements.
- Post dialog: other-unposted-push warning.
- Sidebar: Users hidden without `users:manage`; Ctrl K finds a statement.
- Playwright: sign in → Statements → filter → open statement → edit payee via the list → mark a row don't post → save
  → validate → post → see TxnIDs in Results → see the edits on the Audit trail page.

## 14. Left to the builder

Component file layout; exact chip and table spacing; how the sidebar collapses; how many audit rows to load per
page beyond 50; sorting UI details; empty-state copy (in the interface's voice: what's empty and what to do).

## 15. Calls I made (owner to check)

1. History, Results and Versions open in a **side sheet**, not separate pages; the statement page has no tabs.
2. The meter compares **all rows** (including don't post) with the control total, and don't-post rows go to
   QuickBooks as `Skip` (API R-6).
3. CSV export on the Audit trail, the "Edited" filter, and the other-unposted-push warning were added by me.
4. `/requests` URLs from v1 redirect to `/statements`.
5. "New since you last looked" is per browser, not per user.
