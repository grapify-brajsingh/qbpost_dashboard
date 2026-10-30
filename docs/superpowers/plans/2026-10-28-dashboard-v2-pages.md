# Dashboard v2 (pages, statements, audit trail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the v1 dashboard into a multi-page app with a left sidebar: Statements (one row per push), a statement
page with don't-post / add / delete / inline edit and a reconciliation meter, a History/Results/Versions sheet, an
Audit trail page, restyled Users, and My account, all filterable through the URL, in the approved shadcn look.

**Architecture:** Same stack and layers as v1 (`src/api` → query hooks → `src/features/*` pages; MSW fake API in
`src/mocks`). The fake API grows to the R-5..R-9 shapes first, so every UI task builds against agreed data. v1's
request detail logic (draft, save, post, dialogs) is reused, not rewritten; the list page, top bar and detail tabs
are replaced.

**Tech Stack:** Vite 6, React 19, TS strict, Tailwind 4 + shadcn/ui (new-york), React Router 7, TanStack
Query/Table/Virtual, MSW 2, Vitest + RTL, Playwright. New deps: `@fontsource-variable/geist`, `react-day-picker`,
`date-fns` (shadcn Calendar needs both).

**Spec:** `docs/superpowers/specs/2026-10-28-dashboard-v2-pages-design.md` (v2) on top of
`docs/superpowers/specs/2026-10-27-qbautopost-dashboard-design.md` (v1). API shapes:
`docs/api-requirements-for-dashboard.md` R-5..R-9 — the fake API implements them **exactly as written there**.
Approved sketch: `.superpowers/brainstorm/2337-1793171651/content/design-v2.html` (look and copy reference).

## Global Constraints

- All v1 anti-goals: never post twice (post never retried, `noAuthRetry`, 10-min timeout); never post a version the
  user didn't see (`If-Match` pinned at dialog open, Post disabled while dirty); never write `controlTotal`; never
  round stored amounts (sums in integer cents via `src/lib/money.ts`); unknown payload fields preserved; untrusted
  strings rendered as text only (`react/no-danger` stays on).
- Audit entries are never editable or deletable in the UI. "Don't post" never removes data.
- **The reconciliation meter compares the sum of ALL rows (including `post: false`) with the control total.** Table
  filters never change the meter, the counts, or the saved payload.
- A row's `post` missing means `true`; missing and `true` are equal everywhere (draft dirty check, counts, diffs).
- Rows added in the dashboard get `externalId: "dash-" + crypto.randomUUID()`.
- Every page's filters live in the URL query string; malformed values are ignored, never thrown.
- Tokens: primary `#0e7490` light / `#22d3ee` dark; sidebar `#0b1220` in both themes; ok emerald, warn amber,
  problem rose; radius 10px surfaces, 8px controls; font Geist (bundled via `@fontsource-variable/geist`, **no
  Google Fonts link** — R-2's CSP is `default-src 'self'`); tabular figures for numbers and times.
- Copy: sentence case, plain verbs, the button names what happens ("Post 133 rows", "Delete row", "Add row").
- Routes: `/statements`, `/statements/:id`, `/audit`, `/users`, `/users/:id`, `/account`; `/`, `/requests`,
  `/requests/:id` redirect to the `/statements` equivalents (same id, query string kept).
- Users nav and routes need scope `users:manage`; Audit trail is visible to every role.
- Run `npm test`, `npm run lint`, `npm run build` green before every commit.

## Review Focus

1. A statement with `email: null` and `pushId: null` (dashboard-made or old n8n) → list and header show "—" and the
   `SR-…` ref, nothing crashes. *(Task 6 test)*
2. Hostile strings in audit `old`/`new` (`<img onerror>`, `=cmd|…`, 10 kB values, objects for whole rows) → rendered
   as text, truncated with a tooltip, never as HTML. *(Task 10 test)*
3. A filter is active on the statement table while rows are switched off → meter, "N of M rows will post" and the
   Post dialog still count every row. *(Task 8 test)*
4. Every row switched to don't post → Post disabled with "Every row is marked don't post". *(Task 9 test)*
5. Garbage in the URL (`?minTotal=abc&receivedFrom=2026-13-45&tab=nope`) → ignored, page renders with defaults.
   *(Task 5 test)*

---

## File structure

```
src/api/schema.ts                         + PushId fields, AuditEvent, AuditAction, ValidationSummary, PostSummary…
src/api/queries/requests.ts               ListParams gains R-8.6 filters
src/api/queries/audit.ts                  NEW useAuditEvents, auditCsvHref
src/mocks/fixtures/requests.ts            pushIds, repeat push of one reference, post:false rows
src/mocks/handlers/requestHelpers.ts      summary fields, filters, stats.hasErrors, Skip on post
src/mocks/handlers/audit.ts               NEW /audit-events and /audit-events.csv
src/mocks/audit.ts                        NEW deriveAuditEvents(db, viewer) — pure
src/index.css                             tokens, Geist
src/components/ui/{sidebar,sheet,switch,calendar,toggle-group,avatar,pagination}.tsx   NEW (shadcn add)
src/components/filters/                   NEW FilterChip, DateRangeChip, SearchBox, ClearFilters, useUrlFilters
src/layout/AppSidebar.tsx, CommandMenu.tsx, Breadcrumb.tsx, AppShell.tsx (rewritten)
src/features/statements/list/             NEW StatementsPage, StatementsTable, statusTabs.ts
src/features/statements/sheet/            NEW StatementSheet, ResultsTab, HistoryTimeline (VersionsTab reused)
src/features/statements/detail/           NEW StatementPage, StatementHeader, ReconciliationMeter, RowToolbar, rowFilters.ts
src/features/requests/transactions/       draft.ts (post flag, breakdown), TxTable/columns (Post switch, delete)
src/features/requests/posting/PostDialog   counts, skipped, other-unposted-push warning
src/features/audit/                       NEW AuditPage, AuditTable, auditSentence.ts, groupByDay.ts
src/features/users/                       restyled UsersPage, CreateUserDialog, UserPage uses AuditTable
src/features/account/AccountPage.tsx      NEW
```

v1 files removed by Task 13 once nothing imports them: `features/requests/list/*`, `features/requests/detail/RequestDetailPage.tsx`
(+ `RequestHeader`, `ActionBar` if fully replaced), `layout/TopBar.tsx`, `features/requests/history/HistoryTab.tsx`.

---

### Task 1: Fake API and types for R-5, R-6, R-8, R-9

**Files:**
- Modify: `src/api/schema.ts`, `src/api/queries/requests.ts`, `src/api/queries/users.ts`, `src/mocks/db.ts`,
  `src/mocks/fixtures/requests.ts`, `src/mocks/handlers/requestHelpers.ts`, `src/mocks/handlers/requests.ts`,
  `src/mocks/handlers/users.ts`, `src/mocks/payloadRules.ts`
- Test: `src/mocks/handlers/requests.v2.test.ts`, `src/mocks/handlers/users.v2.test.ts`

**Interfaces:**
- Produces (schema.ts):
  - `RequestSummary` gains `pushId: string | null`, `historyCount: number`, `validationSummary: ValidationSummary`,
    `postSummary: PostSummary | null`, `skipCount: number`.
  - `RequestDetail` gains `otherUnpostedPushes: OtherPush[]`.
  - `interface ValidationSummary { state: ValidationSnapshot['state'] | 'none'; problemCount: number; validatedUtc: string | null; versionNumber: number | null }`
  - `interface PostSummary { postId: string; postedCount: number; postedUtc: string; postedBy: Actor }`
  - `interface OtherPush { id: number; publicRef: string; pushId: string | null; receivedUtc: string | null; status: RequestStatus }`
  - `Stats` gains `hasErrors: { pending: number; all: number }`.
  - `Txn` gains `post?: boolean`.
  - `User` list rows carry `lockedOutUntilUtc` and `mustChangePassword` (add if missing); `type UserStatus = 'active' | 'must-change-password' | 'locked' | 'disabled'`.
- Produces (queries): `ListParams` (in `features/requests/list/queue.ts` today — move it to `src/api/queries/requests.ts` and re-export) gains
  `emailFrom?: string; reference?: string; minTotal?: number; maxTotal?: number; hasErrors?: boolean`; `sort` accepts
  `total|-total|rows|-rows`. `UsersParams` gains `status?: UserStatus[]`.

- [ ] **Step 1: Write failing handler tests** (`fetch` against the MSW node server already started in `src/test/setup.ts`, signed in as admin the way existing handler-driven tests do)

```ts
it('list rows carry pushId, historyCount, validationSummary, postSummary, skipCount')
  // expect(row.pushId).toMatch(/^[0-9a-f-]{36}$/) for n8n fixtures; one fixture has pushId null
  // posted fixture: postSummary.postedCount === its posted rows; pending: postSummary === null
  // validationSummary.problemCount === findings + errors of the snapshot; never-validated → state 'none', 0
it('filters: emailFrom, reference, minTotal/maxTotal inclusive, hasErrors, sort=-total')
it('stats.hasErrors counts pending and all with problemCount > 0 or needsAttention')
it('detail.otherUnpostedPushes lists the other pending push with the same reference, not itself, not posted/discarded ones')
it('save with an existing pushId returns the existing request with 200')
it('save assigns row-<n> externalIds to rows without one, in version 1')
it('post sends post:false rows as Skip: they count toward controlTotal and come back under counts.skipped')
it('post with every row post:false → 400 nothing-to-post')
it('a version whose only change is post:true→missing is not a change')     // missing === true
it('GET /users?status=locked returns only locked users; rows carry lockedOutUntilUtc and mustChangePassword')
```

- [ ] **Step 2: Run** `npx vitest run src/mocks/handlers` — expect FAIL (fields undefined).
- [ ] **Step 3: Implement.** Fixtures: give every n8n fixture a fixed `pushId` (literal UUIDs, deterministic), add a
  **second push of an existing reference** (`chase-2026-08`, pending, different pushId, received 5 h later, 1 more
  row), and mark one transfer row `post: false` in one pending fixture. `historyCount` = length of
  `deriveAuditEvents` for that request — until Task 2 lands, count `events.length + sum of version change ops`;
  Task 2 replaces it with the real derivation. Post handler: map `post:false` rows to `kind: 'Skip'` before
  `engineOutcome`; skipped rows count toward the control-total check and land in `counts.skipped`.
- [ ] **Step 4: Run** `npx vitest run` — all PASS (fix v1 tests broken only by new required fields in fixtures).
- [ ] **Step 5: Commit** `feat(mocks): push id, don't-post rows, list summaries and filters (R-5, R-6, R-8, R-9)`

### Task 2: Fake audit-events API (R-7) and `useAuditEvents`

**Files:**
- Create: `src/mocks/audit.ts`, `src/mocks/handlers/audit.ts`, `src/api/queries/audit.ts`
- Modify: `src/api/schema.ts`, `src/mocks/handlers/index.ts`, `src/mocks/handlers/requestHelpers.ts` (historyCount)
- Test: `src/mocks/audit.test.ts`, `src/mocks/handlers/audit.test.ts`

**Interfaces:**
- Produces (schema.ts): `AUDIT_ACTIONS` const array with exactly the R-7.4 values; `type AuditAction`;
  `interface AuditEvent { id: string; atUtc: string; actor: { id: string; name: string; kind: 'user' | 'api-client' }; action: AuditAction; request: { id: number; publicRef: string; reference: string | null; pushId: string | null; emailSubject: string | null } | null; row: { externalId: string | null; index: number | null } | null; field: string | null; old: unknown; new: unknown; versionNumber: number | null; detail: Record<string, unknown> | null }`
- Produces (mocks/audit.ts): `deriveAuditEvents(viewerRole: Role): AuditEvent[]` — pure over `mockDb`, sorted
  `atUtc desc, id desc`, ids stable (`v<reqId>.<version>-<opIndex>`, `e<reqId>-<eventIndex>`, `u<userAuditIndex>`).
- Produces (queries/audit.ts): `interface AuditParams { from?: string; to?: string; actor?: string; requestId?: number; reference?: string; pushId?: string; action?: AuditAction[]; q?: string; page?: number; pageSize?: number }`;
  `useAuditEvents(params: AuditParams)` → `UseQueryResult<Page<AuditEvent>>`, key `['audit', params]`;
  `auditCsvHref(params: AuditParams): string` → `/api/v1/audit-events.csv?…` (same query builder).

- [ ] **Step 1: Failing tests**

```ts
// mocks/audit.test.ts
it('expands a replace on a row field into one row-edited event with field, old, new, row.externalId')
it('maps $.transactions[i].post false→ row-post-off, true → row-post-on')
it('maps add/remove on $.transactions[i] to row-added / row-deleted with the whole row as new / old')
it('maps $.controlTotal replace to control-total-changed')
it('created event → received with actor.kind api-client for n8n')
it('posted attempt → posted; held/refused/failed/unknown attempts → post-failed with detail.outcome')
it('user audit rows appear only for admin viewers')
it('ids are stable across two calls')
// handlers/audit.test.ts
it('filters by actor, action (repeatable), requestId, reference, pushId, from/to, q over old/new/field')
it('pages 50 by default, rejects pageSize > 200 with 400')
it('csv: header row, filters applied, a value starting with = + - @ is prefixed with \'')
```

- [ ] **Step 2: Run** `npx vitest run src/mocks` — FAIL.
- [ ] **Step 3: Implement** handler `GET ${API}/audit-events` (paginate with existing `paginate`) and
  `GET ${API}/audit-events.csv` (`text/csv`, columns per R-7.6). Point `historyCount` at
  `deriveAuditEvents('admin').filter(e => e.request?.id === r.id).length`.
- [ ] **Step 4: Run** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat(mocks): audit events feed and CSV (R-7)`

### Task 3: Look: tokens, Geist, new shadcn components

**Files:**
- Modify: `src/index.css`, `package.json`, `src/main.tsx`
- Create (via `npx shadcn@latest add sidebar sheet switch calendar toggle-group avatar pagination`):
  `src/components/ui/{sidebar,sheet,switch,calendar,toggle-group,avatar,pagination}.tsx`, `src/hooks/use-mobile.ts`
- Create: `src/components/StatusDot.tsx`, `src/components/PushId.tsx`
- Test: `src/components/PushId.test.tsx`

**Interfaces:**
- Produces: CSS variables `--primary`, `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--success`,
  `--warning`, `--destructive` (+ `-soft` variants for badges) set for `:root` and `.dark`, values from the sketch's
  `:root` / `[data-theme="dark"]` blocks; Tailwind theme exposes `bg-success-soft text-success` etc.
- `<PushId value={string | null} fallback={string} />` — shows `first4…last3`, full value in a tooltip, copy button
  (`navigator.clipboard.writeText`), renders `fallback` when null.
- `<StatusDot tone="ok" | "warn" | "bad" | "new" />` for badges and the new-arrival dot.

- [ ] **Step 1: Failing test** `PushId`: shortens `7f3a2b10-…-…c21` to `7f3a…c21`; copy writes the full id; null → fallback text.
- [ ] **Step 2: Run** `npx vitest run src/components` — FAIL.
- [ ] **Step 3: Implement.** `npm i @fontsource-variable/geist react-day-picker date-fns`; import the font in
  `main.tsx`; set `font-family: "Geist Variable", system-ui` and `font-variant-numeric: tabular-nums` on
  `.num, td, time`. Keep next-themes `class` strategy.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build` — PASS; dist still only `index.html` + `assets/`.
- [ ] **Step 5: Commit** `feat(ui): v2 tokens, Geist, sidebar/sheet/switch/calendar components`

### Task 4: Shell: sidebar, breadcrumb, routes, Ctrl K, My account

**Files:**
- Create: `src/layout/AppSidebar.tsx`, `src/layout/CommandMenu.tsx`, `src/layout/Breadcrumb.tsx`,
  `src/features/account/AccountPage.tsx`
- Modify: `src/layout/AppShell.tsx`, `src/router.tsx`, `src/auth/ChangePasswordPage.tsx` (extract the form as
  `ChangePasswordForm` so both pages use it)
- Test: `src/layout/AppShell.test.tsx` (rewrite), `src/features/account/AccountPage.test.tsx`

**Interfaces:**
- Consumes: `useStats` (badge = pending count; admins add partial + unknown), `useSession`, `hasScope`.
- Produces: `<AppShell>` with `<SidebarProvider>`; `<Breadcrumb>` reads route `handle.crumb` (`string` or
  `(data) => string`; statement page sets its crumb through `useBreadcrumb(title: string)` context);
  `<CommandMenu>` opened by Ctrl/⌘+K and by the sidebar search button, searching `useRequestsList({ q, pageSize: 8 })`
  (debounced 200 ms) and static page entries.

- [ ] **Step 1: Failing tests**

```ts
it('sidebar shows Statements, Audit trail, My account; Users only with users:manage')
it('Statements badge shows the to-review count from stats')
it('active nav item follows the route, including /statements/:id')
it('/requests/5?x=1 redirects to /statements/5?x=1; / and /requests go to /statements')
it('Ctrl+K opens the command menu; typing a reference lists the statement; Enter navigates')
it('My account shows name, email, role and changes the password (12+ chars checked first)')
it('sign out from the sidebar footer clears the session and goes to /sign-in')
it('below 900px the sidebar is a menu button that opens it as a sheet')   // shadcn Sidebar collapsible="icon"
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; the database health light moves into the top bar's right side;
  theme switch (Light / Dark / Match computer) lives on My account plus a quick toggle in the sidebar footer.
- [ ] **Step 4: Run** `npm test` — PASS (temporarily point `/statements` at the v1 `RequestsPage` and
  `/statements/:id` at `RequestDetailRoute` until Tasks 6 and 9 replace them).
- [ ] **Step 5: Commit** `feat(shell): left sidebar, breadcrumb, command menu, My account, v2 routes`

### Task 5: URL filter state and filter chips

**Files:**
- Create: `src/components/filters/useUrlFilters.ts`, `FilterChip.tsx`, `DateRangeChip.tsx`, `SearchBox.tsx`,
  `ClearFilters.tsx`, `index.ts`
- Test: `src/components/filters/useUrlFilters.test.tsx`, `src/components/filters/FilterChip.test.tsx`

**Interfaces:**
- Produces:
  - `type FilterSpec = Record<string, { kind: 'text' | 'date' | 'number' | 'bool' | 'enum' | 'enumList'; values?: readonly string[] }>`
  - `useUrlFilters<S extends FilterSpec>(spec: S): { values: FilterValues<S>; set(patch: Partial<FilterValues<S>>): void; clear(): void; activeCount: number }`
    — reads/writes `useSearchParams`, `replace: true` for typing (`text`), `push` for everything else; any `set`
    resets `page` to 1; invalid values (bad date `yyyy-MM-dd`, NaN number, unknown enum) read as `undefined`.
  - `<FilterChip label options|children value onChange />` — dashed "+ Label" when unset, solid "Label: value ✕"
    when set (shadcn Popover + Command for options).
  - `<DateRangeChip label from to onChange />` — shadcn Calendar `mode="range"`, presets Today / Yesterday / Last 7
    days / This month.
  - `<SearchBox value onChange placeholder />` — debounced 250 ms, keeps whitespace inside the value (v1 bug fix).
  - `<ClearFilters onClear disabled />`.

- [ ] **Step 1: Failing tests**

```ts
it('round-trips text, date, number, bool, enumList through the URL')
it('ignores ?minTotal=abc&receivedFrom=2026-13-45&tab=nope and keeps other params')   // Review Focus 5
it('set() resets page to 1; clear() removes only spec keys')
it('FilterChip shows "+ Status" dashed when unset and "Status: Posted ✕" when set; ✕ clears it')
it('DateRangeChip preset "Last 7 days" sets from/to as yyyy-MM-dd in local time')
```

- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(filters): URL-backed filter state and chips`

### Task 6: Statements page

**Files:**
- Create: `src/features/statements/list/StatementsPage.tsx`, `StatementsTable.tsx`, `statusTabs.ts`,
  `lastSeen.ts`
- Modify: `src/router.tsx` (`/statements` → `StatementsPage`)
- Test: `src/features/statements/list/StatementsPage.test.tsx`, `statusTabs.test.ts`, `lastSeen.test.ts`

**Interfaces:**
- Consumes: `useRequestsList`, `useStats`, Task 5 filters, `PushId`, `StatusBadge`, `Money`, `Timestamp`;
  `openStatementSheet(id, tab)` from Task 7 (until Task 7 lands, the buttons call a no-op prop `onOpenSheet`).
- Produces: `type StatusTab = 'review' | 'errors' | 'posted' | 'discarded' | 'all'`;
  `STATUS_TABS`, `paramsFor(tab, isAdmin): ListParams` (review = `pending` + admins `partial`,`unknown`, sort
  `-received`; errors = `pending` + `hasErrors`; posted; discarded; all), `countFor(tab, stats, isAdmin): number`.
  `lastSeen.read(): string | null`, `lastSeen.markNow()` — `localStorage` key `qbpost.statements.lastSeen`, every
  access in try/catch.
- Filters spec: `tab` enum, `q` text, `receivedFrom`/`receivedTo` date, `reference` text, `emailFrom` text,
  `minTotal`/`maxTotal` number, `duplicate` bool, `sort` enum, `page` number.

- [ ] **Step 1: Failing tests**

```ts
it('shows one row per push: two chase-2026-08 rows with different push ids')
it('columns: received time + date, subject + sender, reference + push id, rows, total, status, validation, History N, Results')
it('validation cell: "No problems" / "3 problems" / "Not checked" / "61 TxnIDs" for posted')
it('row with email null and pushId null shows "—" and the SR ref, no crash')                 // Review Focus 1
it('tab counts come from stats; Has errors uses stats.hasErrors.pending')
it('typing in search sets ?q= and refetches; Clear filters empties every chip')
it('rows received after lastSeen get the new dot; leaving the page marks now')
it('row click navigates to /statements/:id; History button does not navigate and calls onOpenSheet(id, "history")')
it('empty To review shows "All clear. Nothing waiting."')
it('Received, Total and Rows headers sort (?sort=-total etc.); default is -received')
```

- [ ] **Step 2–4:** run (FAIL), implement (keep v1 new-arrivals pill: reuse `NewArrivalsPill`), run (PASS).
- [ ] **Step 5: Commit** `feat(statements): Statements page with tabs, filters and push rows`

### Task 7: Statement sheet (Results, History, Versions)

**Files:**
- Create: `src/features/statements/sheet/StatementSheet.tsx`, `ResultsTab.tsx`, `HistoryTimeline.tsx`,
  `useStatementSheet.ts`
- Modify: `StatementsPage.tsx` (wire buttons), `src/features/requests/attempts/AttemptsTab.tsx` (export the
  attempt list body as `AttemptList` for reuse)
- Test: `src/features/statements/sheet/StatementSheet.test.tsx`

**Interfaces:**
- Consumes: `useRequest`, `useAttempts`, `useAttempt`, `useAuditEvents({ requestId })`, v1 `VersionsTab`,
  `auditSentence` (Task 10 — until then `HistoryTimeline` renders `action` + `field: old → new`; Task 10 swaps in
  `auditSentence`).
- Produces: `useStatementSheet(): { open(id: number, tab: SheetTab): void; close(): void }` backed by URL params
  `sheet=<id>&sheetTab=results|history|versions` (so Back closes it); `type SheetTab = 'results' | 'history' | 'versions'`;
  `<StatementSheet />` mounted once per page that uses the hook.

- [ ] **Step 1: Failing tests**

```ts
it('opens from a Statements row on the requested tab and keeps the list visible')
it('Results, not posted: latest validation state, who/when, each problem with its row number, control-total check')
it('Results, posted: posted by/when/counts/batch and the row → TxnID table, first 10, "Show all 61"')
it('Results lists attempts newest first, including refused ones')
it('History: timeline of this statement\'s audit events newest first; "Open in Audit trail" → /audit?requestId=<id>')
it('Versions tab renders the v1 version list and original body viewer')
it('Esc and browser Back close the sheet')
```

- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(statements): History / Results / Versions sheet`

### Task 8: Draft: don't post, add with id, change breakdown; reconciliation meter

**Files:**
- Modify: `src/features/requests/transactions/draft.ts`, `draft.test.ts`
- Create: `src/features/statements/detail/ReconciliationMeter.tsx`, `ReconciliationMeter.test.tsx`

**Interfaces:**
- Produces (draft.ts):
  - `setPost(d: Draft, rowKey: string, post: boolean): Draft` — stores `post: false`, and **removes the key** (not
    `true`) when switched back on a row that had no `post` field; dirty iff different from loaded with missing ≡ true.
  - `isPosting(row: Txn): boolean` → `row.post !== false`.
  - `addRow(d: Draft, row?: Partial<Txn>): Draft` — appended row gets `externalId: 'dash-' + crypto.randomUUID()`
    unless given.
  - `changeBreakdown(d: Draft): { edits: number; added: number; deleted: number; postOff: number; postOn: number }`
    — `edits` counts cells except `post`; `dirtyCount` stays the sum.
  - `postStats(d: Draft): { total: number; posting: number; skipped: number; skippedCents: number; allCents: number }`
    over non-deleted rows (base + added).
- Produces: `<ReconciliationMeter allCents controlTotal postStats />` — "Sum of all rows", bar width
  `min(100, all/control)`, "133 of 135 rows will post (2 marked don't post, 2,262.00)", "Control total X, never
  changed by the app", and "Matches to the cent" / "Short by X" / "Over by X"; control total null → "No control
  total" in rose.

- [ ] **Step 1: Failing tests**

```ts
it('setPost(false) then setPost(true) on a row without post leaves no post key and no dirty cell')
it('setPost(false) on a loaded post:false row is not dirty; draftToPayload keeps post:false')
it('addRow gives dash-<uuid> externalId and keeps unknown fields on other rows')
it('changeBreakdown counts 1 edit, 1 added, 1 post-off separately')
it('postStats counts every non-deleted row; skipped rows stay in allCents')
it('meter matches to the cent when all rows (including skipped) equal control; short/over otherwise')
it('meter ignores table filters: it takes postStats of the whole draft')               // Review Focus 3
```

- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(draft): don't-post flag, dashboard row ids, reconciliation meter`

### Task 9: Statement page

**Files:**
- Create: `src/features/statements/detail/StatementPage.tsx`, `StatementHeader.tsx`, `RowToolbar.tsx`,
  `rowFilters.ts`, `AddTransactionDialog.tsx`, `DeleteRowDialog.tsx`
- Modify: `src/features/requests/transactions/columns.tsx`, `TxTable.tsx`, `SaveBar.tsx`, `TransactionsTab.tsx`
  (becomes the table body used by `StatementPage`), `src/router.tsx` (`/statements/:id` keyed by id, v1
  `RequestDetailRoute` pattern)
- Test: `src/features/statements/detail/StatementPage.test.tsx`, `rowFilters.test.ts`; update
  `TransactionsEdit.test.tsx` for the new columns

**Interfaces:**
- Consumes: Task 8 draft functions and meter, Task 7 `useStatementSheet`, v1 `useDraft`, `UnsavedGuard`,
  `PostDialog`, `ValidationPanel` content (moves into the Results tab; the page keeps the per-row problem marks),
  Discard/Restore/Resolve dialogs (now in the header ⋯ menu), `useBreadcrumb`.
- Produces: `rowFilters.ts`: `interface RowFilter { q?: string; post?: 'post' | 'skip'; kind?: string[]; from?: string; to?: string; problem?: boolean; edited?: boolean }`,
  `filterRows(rows: DisplayRow[], f: RowFilter, ctx: { findings: Set<string>; dirtyKeys: Set<string>; editedInVersions: Set<string> }): DisplayRow[]`
  (keys = rowKey). URL params: `rq`, `rpost`, `rkind`, `rfrom`, `rto`, `rproblem`, `redited`, `row` (externalId to
  scroll to + highlight 2 s).

- [ ] **Step 1: Failing tests**

```ts
it('header: subject as title, received, from, reference, push id, status; History/Results open the sheet')
it('Post switch off greys and strikes the row, updates meter text and the save bar "1 marked don\'t post"')
it('click a payee cell, type "abc", pick "ABC Plumbing LLC" from the list, Enter → tinted cell with "was ABC Plumbing"')
it('Tab keeps the change and edits the next cell; Esc cancels')
it('Add transaction dialog appends a row tagged new with a dash- id; Delete opens the confirm that mentions Post')
it('row filters hide rows only: meter, counts and the saved payload are unchanged; "Showing 2 of 6 rows (filtered)"')
it('Edited filter shows dirty rows and rows changed in earlier versions')
it('?row=row-7 scrolls to and highlights row 7; unknown row → toast "Row row-7 was deleted in version N"')
it('save bar: "3 unsaved changes" + breakdown; Undo changes resets; Post disabled while dirty')
it('every row switched off → Post disabled with "Every row is marked don\'t post"')      // Review Focus 4
it('⋯ menu shows Discard/Restore/Resolve only per allowedActions')
it('/statements/1 → /statements/2 does not carry draft or post state over')
```

- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(statements): statement page with don't post, add, delete and row filters`

### Task 10: Audit trail page

**Files:**
- Create: `src/features/audit/AuditPage.tsx`, `AuditTable.tsx`, `auditSentence.ts`, `groupByDay.ts`, `ValueDiff.tsx`
- Modify: `src/router.tsx` (`/audit`), `src/features/statements/sheet/HistoryTimeline.tsx` (use `auditSentence`)
- Test: `src/features/audit/AuditPage.test.tsx`, `auditSentence.test.ts`, `groupByDay.test.ts`

**Interfaces:**
- Consumes: `useAuditEvents`, `auditCsvHref`, Task 5 filters, `useUsers` (actor options, admins only; others get
  "Me" and "n8n").
- Produces: `auditSentence(e: AuditEvent): string` (plain text, e.g. "Changed payee on row 7", "Marked row 3 don't
  post", "Added row 135", "Posted 61 rows (batch api-amex-2026-09)", "Reset the password for eli@example.com");
  `groupByDay(events, now): { label: string; items: AuditEvent[] }[]` with labels "Today, 28 Oct", "Yesterday, 27
  Oct", then "Mon, 20 Oct" in local time; `<ValueDiff old new />` — strings/numbers/booleans shown, objects (whole
  rows) as `date · kind · payee · account · amount`, old struck through rose, new emerald, each truncated at 80
  chars with the full text in a tooltip, **text only**; `<AuditTable events showStatement? />` reused by the user
  page.
- Filters: `q`, `actor`, `from`/`to` (date range → UTC instants at local midnight), `requestId`, `reference`,
  `action` (enumList of `AUDIT_ACTIONS`), `page`.

- [ ] **Step 1: Failing tests**

```ts
it('groups by local day with Today / Yesterday labels, newest first')
it('row-edited shows field, old struck through and new; row-added shows the row in one line')
it('hostile old/new (<img src=x onerror=alert(1)>, "=cmd|calc", 10 kB) render as text, truncated with a tooltip')  // Review Focus 2
it('statement cell links to /statements/:id; row cell links to /statements/:id?row=<externalId>')
it('filters round-trip through the URL; Export CSV href carries the same filters')
it('viewer role does not see user events or the user filter options beyond Me and n8n')
it('pages 50 per page')
it('every AUDIT_ACTIONS value has a sentence (no fallback to the raw enum)')
```

- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(audit): Audit trail page`

### Task 11: Post dialog additions

**Files:**
- Modify: `src/features/requests/posting/PostDialog.tsx`, `Posting.test.tsx`

**Interfaces:**
- Consumes: `RequestDetail.otherUnpostedPushes`, `postStats` (Task 8) computed from the **saved** payload (Post is
  only enabled when not dirty).
- Produces: dialog title "Post N rows to QuickBooks?", body "X will post. M rows marked don't post are skipped." (the
  second sentence only when M > 0), amber callout per R-8.5 listing each other push ("Push b91e…04d arrived at
  09:11 and isn't posted. Make sure you're not posting the same statement twice."), confirm button "Post N rows".
  v1 duplicate warning, pinned ETag, no retry, and recovery stay unchanged.

- [ ] **Step 1: Failing tests** — title and button carry the posting count; skipped sentence only when skipped > 0;
  other-push callout lists each other push with a link that opens it in a new tab; the request body sent is still the
  saved version with `If-Match` from dialog open.
- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(posting): post dialog counts skipped rows and warns about other pushes`

### Task 12: Users restyle and user activity

**Files:**
- Modify: `src/features/users/UsersPage.tsx`, `CreateUserDialog.tsx`, `UserPage.tsx`, `userStatus.ts`
- Test: `src/features/users/users.v2.test.tsx` (update existing users tests in place where they overlap)

**Interfaces:**
- Consumes: `useUsers({ q, role, status, page })` (R-9), `AuditTable` (Task 10), `useAuditEvents({ actor: id })`.
- Produces: filters `q`, `role` (enumList), `status` (enumList of `UserStatus`) in the URL; one column with avatar
  (initials), name, email; badges Active / Must set password / Locked out / Disabled; inline actions Reset password,
  Unlock (locked only), Enable (disabled only), Edit; New user dialog with a role `ToggleGroup` and one line per
  role ("Admins manage users and can resolve posts.", "Editors can fix and post statements.", "Viewers can only
  look."); user page shows the user's activity with `AuditTable`.

- [ ] **Step 1: Failing tests** — status filter sends `status=locked`; Unlock only on locked rows; creating a user shows
  the one-time password dialog that closes only on Done (v1); user page lists that user's audit events.
- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(users): filters, inline actions, activity from the audit feed`

### Task 13: Remove v1 leftovers, end-to-end, docs

**Files:**
- Delete: v1 files listed under *File structure* once `npx tsc -b` shows nothing imports them, with their tests
  (move any still-relevant assertions into the v2 tests first).
- Modify: `e2e/smoke.spec.ts`, `README.md`
- Test: `e2e/v2.spec.ts`

- [ ] **Step 1: Write `e2e/v2.spec.ts`**: sign in as `asha@example.com` / `correct horse battery` → Statements shows
  two `chase-2026-08` rows → filter Reference `chase-2026-08` → open the pending one → change row 7 payee to "ABC
  Plumbing LLC" through the list → switch row 3 Post off → Save → Validate → Post 133-style dialog → Post → Results
  sheet shows TxnIDs → Audit trail shows "Changed payee on row 7" and "Marked row 3 don't post" by Asha K.
- [ ] **Step 2: Run** `npm run e2e` — FAIL until wiring is right; fix; PASS.
- [ ] **Step 3:** delete v1 leftovers; `npm test && npm run lint && npm run build && npm run e2e` all green; dist has
  only `index.html` + `assets/`.
- [ ] **Step 4:** README: pages, routes, mock users table, "what the fake API assumes (R-5..R-9)".
- [ ] **Step 5: Commit** `chore: remove v1 list/detail, v2 end-to-end test and README`

---

## Status and results (recorded 2026-10-28, retroactively)

Added after the work, from the git history. **The step checkboxes above were left as they are** (steps not
re-verified one by one). What is recorded is which commit delivered each task and what changed it later.

| Task | Delivered in | Follow-up fixes | Today |
|---|---|---|---|
| 1 Fake API and types, R-5/6/8/9 | `07f9fd5` | — | in use |
| 2 Fake audit-events API (R-7) | `61bee58` | `aaf56c2` push-id filter, sentences, invalidation | in use; also feeds the Home page |
| 3 Look: tokens, Geist, shadcn components | `fbe52b2` | — | tokens **replaced** by the ledger UI refresh (`5950cb4`, spec `2026-10-28-ui-refresh-ledger-spec.md`); components in use |
| 4 Shell: sidebar, breadcrumb, routes, Ctrl K, My account | `0d38045` | `bb2c929` stale command results, breadcrumb trail | in use; `/` now the Home page instead of a redirect (`5950cb4`) |
| 5 URL filter state and chips | `bd9b65e` | `a094432` SearchBox flush | in use |
| 6 Statements page | `cfb3658` | `fe02b81` tests re-homed | in use |
| 7 Statement sheet | `01fe1f5` | — | in use |
| 8 Draft: don't post, ids, meter | `9db1835` | — | in use |
| 9 Statement page | `d135991` | `707f977` row heights, multi-kind filter, subject title, editable control total | in use |
| 10 Audit trail page | `a51d97e` | `aaf56c2` | in use |
| 11 Post dialog additions | `b764c7d` | `2de1d4a` counts from the opened version | in use |
| 12 Users restyle and activity | `4349f7b` | — | in use |
| 13 Remove v1 leftovers, e2e, docs | `6fb02a9` | — | done |
| Final review | `c85bdb4` | audit export via api client, unknown actions, push id detection, control total blur, post dialog snapshot, page param, filter count, partial results, breadcrumb, dead v1 code | — |

**Verification today** (2026-10-28): lint and build pass; 432 Vitest tests, with one full run all green and other
full runs showing 1–2 load-related timeouts in `StatementPage.test.tsx` that pass when the file runs alone.
`e2e/v2.spec.ts` was updated for the Home landing page but not run on 2026-10-28.

## Fix 2026-10-30: statement-level validation problems and the reference

Spec: section 16 of `specs/2026-10-28-dashboard-v2-pages-design.md`. No API change, so
`docs/api-requirements-for-dashboard.md` is untouched unless step 1 finds otherwise.

**Files.** Create `src/lib/reference.ts` (+ test), `src/features/statements/detail/ValidationProblems.tsx` (+ test),
`src/features/statements/detail/ReferenceField.tsx`. Modify `StatementPage.tsx`, `StatementHeader.tsx`,
`TransactionsTab.tsx`, `findings.ts`, `draft.ts` (+ test), `SaveBar.tsx`, `PostDialog.tsx`, `upload/emptyFields.ts`
(+ test), `upload/ReviewEditor.tsx`, `mocks/payloadRules.ts`, `StatementPage.test.tsx`, `e2e-integration/review.spec.ts`.

**Tasks.**

- [x] 1. Confirm against the Docker API that a PUT changing `payload.reference` also updates the record's `reference`
      and clears the refusal after Validate. Depends on nothing. If it does not, stop and update the spec and the API
      requirements doc.
- [x] 2. `reference.ts`: rule and message; unit tests (spaces, 64 and 65 characters, allowed symbols, empty).
- [x] 3. Mock: refuse a bad reference with the API's message. Needs 2.
- [x] 4. `ValidationProblems` panel on the page, reading `errors` and the `-1` findings. Needs 3. Acceptance 1 to 3.
- [x] 5. Draft `top.reference`: `setReference`, `draftToPayload`, `dirtyCount`, `changeBreakdown`. Unknown fields keep
      surviving. Needs 2.
- [x] 6. Move the draft-owning boundary so the header can edit the reference: pass a reference slot into `TableEditor`
      output rather than moving the draft up, matching how `validate` and `post` are passed. Needs 5.
- [x] 7. `ReferenceField` and the Save block. Needs 5, 6. Acceptance 4 to 7.
- [x] 8. `PostDialog` lists the messages. Needs 4.
- [x] 9. `saveBlocker` and `ReviewEditor`. Needs 2. Acceptance 5.
- [x] 10. Integration e2e: refused statement, fix reference, validate, post against the simulated QuickBooks.

**Tests.** Unit for 2, 5, 9; page tests with `renderApp` for 4, 7, 8, including a viewer role; one `e2e-integration` flow.

**Verification.** `npm run lint`, `npm run build`, `npm test`, then rebuild the `web` container and check
`/statements/30` in the browser. Record the output here, including any `StatementPage.test.tsx` timeouts.

**Milestones.**

- [x] Reason visible on the page
- [x] Reference editable; a statement with a bad reference fixed and posted in e2e (statement 30 itself left as it is)
- [x] Upload review blocks bad references
- [x] Lint, build, test and e2e recorded here (one upload e2e test still fails, see results)

**Results (2026-10-30).** `npm run lint` clean. `npm run build` passes. `npm test`: 57 files, 610 tests, all passing on the
final run; an earlier run had one timeout in `AppShell.test.tsx` that passes alone. Integration e2e against the rebuilt
`web` container: 15 passed, 1 failed.

- **Failure, not from this change**: `upload.spec.ts:27` expects an audit row for picking `Bank Service Charges` on the
  fee, but version 1 stored by the API already holds that `lineAccount`, so the pick changes nothing and no event is
  written. The test's expectation is out of date. Left as it is, outside this plan.
- **Step 1** read in the API (`EfSavedRequestStore.cs:311`) and proved by the new e2e flow: a PUT changes the record's
  reference and clears the refusal.
- **Step 6** uses a portal: `StatementPage` holds the header's slot element and `TableEditor` renders `ReferenceField`
  into it, so the draft stays where it was.
- **Differs from the spec as first written**: no separate Save block (spec section 16 updated).
- **Browser check**: `/statements/30` shows the panel on load with no console errors. Its reference was not changed and
  it was not posted: the value is the accountant's choice.
- **Side effect**: the e2e runs seeded test statements into the local Docker database (Statements count 25 to 44).
