# QbAutopost Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the QbAutopost review-and-post dashboard so an accountant can clear the morning's saved bank statements: check rows against the PDF, fix payee/account/amount inline, post to QuickBooks, and see exactly what happened.

**Architecture:** Vite SPA served by the API from the same origin. One fetch wrapper owns auth (in-memory access token, cross-tab refresh coordination). TanStack Query holds server state; the transactions editor holds a local draft of the full payload. Every screen runs against MSW mocks built from the API spec, because the real API routes are not built yet.

**Tech Stack:** React 19, TypeScript 5.8 strict, Vite 6, Tailwind CSS 4 + shadcn/ui, React Router 7, TanStack Query 5, TanStack Table 8 + TanStack Virtual 3, openapi-fetch, MSW 2, Vitest 3 + React Testing Library + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-qbautopost-dashboard-design.md` (read it first; section numbers below refer to it). API contract: `D:\qb_post-issue-2\docs\saved-requests-postgres.md`. API additions: `docs/api-requirements-for-dashboard.md`.

## Global Constraints

- All API calls use relative URLs under `/api/v1`. Never an absolute host.
- Access token lives in memory only. No `localStorage`, `sessionStorage` or cookies for it. (`localStorage` is allowed only for column visibility and theme.)
- A post (`POST /saved-requests/{id}/post`) is **never** re-sent automatically. That includes after a `401`, a timeout or a network error.
- Every `PUT` and post sends `If-Match` with the ETag of the data on screen.
- The dashboard never writes the sum of rows into `controlTotal`, and never rounds or recomputes a stored amount.
- Payload, email-subject and note strings are rendered as React text only. ESLint rule `react/no-danger` is an error.
- Buttons for request actions come from `allowedActions` only. No role or status checks in UI code for request actions.
- `TxnKind` values come from one exported constant `TXN_KINDS` in `src/api/schema.ts`, which mirrors the OpenAPI enum (`Check`, `CcCharge`, `CcCredit`, `Deposit`, `Skip`). No other file lists them.
- Money: displayed with 2 decimals, `en-US` grouping, tabular numerals, right-aligned. Sums use integer cents.
- Payload `date` strings are shown as-is (`yyyy-MM-dd`). API timestamps (UTC ISO) are shown in local time.
- Post client timeout: 10 minutes. Posting poll: every 3 s. Stats poll: every 60 s. Health poll: every 60 s.
- Desktop only, minimum width 1280 px. Light and dark mode.
- Password minimum length: 12. Discard reason: 1–500 chars.

## Review Focus

1. **A second browser tab** refreshing at the same time must not sign the user out (rotated refresh token reused). Test in Task 4.
2. **Unsaved edits when Post is pressed**: Post is disabled until the draft is saved, so the posted version is the one on screen. Test in Task 10.
3. **Unknown fields in the payload** (top level and per row, including `email`) survive an edit-and-save round trip unchanged. Test in Task 9.
4. **Floating-point sums**: 0.1 + 0.2-style amounts across 200 rows must sum exactly to the cent. Test in Task 2.
5. **Reopening a request that is still `posting`** (tab closed mid-post) shows progress and then the outcome, without re-sending. Test in Task 10.

---

## File structure

```
src/
  main.tsx                       app bootstrap (QueryClient, Router, MSW in mock mode)
  router.tsx                     route table + guards
  index.css                      Tailwind + shadcn theme tokens
  api/
    schema.ts                    hand-written API types (to be replaced by generated ones) + TXN_KINDS
    problem.ts                   RFC 7807 parsing: ApiProblem, isProblem(), problemCode()
    client.ts                    apiFetch(): bearer token, 401 → refresh once → retry (posts exempt)
    session.ts                   token store + cross-tab refresh coordinator
    queries/                     one file per resource: auth.ts, requests.ts, lists.ts, users.ts, health.ts
  auth/                          SessionProvider, RequireAuth, SignInPage, ChangePasswordPage
  layout/                        AppShell, TopBar, DbHealthLight, ThemeToggle
  features/
    requests/
      list/                      RequestsPage, QueueTabs, RequestsFilters, RequestsTable, NewArrivalsPill
      detail/                    RequestDetailPage, RequestHeader, StatusBanner, ActionBar
      transactions/              TransactionsTab, ValidationPanel, TxTable, cells/*, TotalsBar, draft.ts, RawJsonEditor
      posting/                   PostDialog, usePost.ts, outcome.ts, PostingProgress
      dialogs/                   DiscardDialog, RestoreDialog, ResolveDialog, ConflictDialog
      versions/                  VersionsTab, changeSentence.ts, OriginalViewer
      attempts/                  AttemptsTab
      history/                   HistoryTab
    users/                       UsersPage, UserPage, CreateUserDialog, OneTimePasswordDialog
  components/
    ui/                          shadcn components (generated)
    StatusBadge.tsx, FlagChips.tsx, Money.tsx, Timestamp.tsx, ProblemAlert.tsx
  lib/
    money.ts, dates.ts
  mocks/
    browser.ts, server.ts, handlers/*.ts, fixtures/*.ts, db.ts (in-memory mock state)
  test/
    setup.ts, render.tsx (renderWithProviders)
e2e/
  smoke.spec.ts
```

---

### Task 1: Tooling: Tailwind, shadcn/ui, routing, query, tests, mocks, proxy

**Files:**
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `eslint.config.js`, `src/main.tsx`, `src/index.css`
- Delete: `src/App.tsx`, `src/App.css`, `src/assets/react.svg`, `public/vite.svg`
- Create: `components.json`, `src/router.tsx`, `src/test/setup.ts`, `src/test/render.tsx`, `src/mocks/browser.ts`, `src/mocks/server.ts`, `src/mocks/handlers/index.ts`, `vitest.config.ts`
- Test: `src/router.test.tsx`

**Interfaces:**
- Produces: `renderWithProviders(ui: ReactElement, opts?: { route?: string }): RenderResult & { user: UserEvent; queryClient: QueryClient }` in `src/test/render.tsx`. `handlers: HttpHandler[]` from `src/mocks/handlers/index.ts`. `server` (msw/node) from `src/mocks/server.ts`, started in `src/test/setup.ts` with `onUnhandledRequest: 'error'`. Path alias `@/` → `src/`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm i react-router@7 @tanstack/react-query@5 @tanstack/react-table@8 @tanstack/react-virtual@3 openapi-fetch
npm i -D tailwindcss@4 @tailwindcss/vite@4 vitest@3 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom msw@2 @playwright/test eslint-plugin-react openapi-typescript @types/node
```
Expected: installs with 0 vulnerabilities reported as high or critical.

- [ ] **Step 2: Configure Vite, Tailwind, alias, proxy, and shadcn**

`vite.config.ts`: plugins `react()` and `tailwindcss()`. Alias `@` → `./src`. `server.proxy['/api']` → `process.env.VITE_API_PROXY_TARGET ?? 'https://localhost:5443'` with `secure: false` and `changeOrigin: false`. Add `"baseUrl": "."` and `"paths": {"@/*": ["./src/*"]}` to both tsconfigs. Run `npx shadcn@latest init` (style new-york, base color neutral, CSS variables yes), then `npx shadcn@latest add button input label table tabs badge dialog alert-dialog dropdown-menu select command popover tooltip sonner checkbox textarea separator skeleton card`.

- [ ] **Step 3: Scripts and lint**

`package.json` scripts: `"dev:mock": "vite --mode mock"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"e2e": "playwright test"`, `"gen:api": "openapi-typescript http://localhost:5080/api/v1/openapi.json -o src/api/openapi.d.ts"`. In `eslint.config.js`, add `eslint-plugin-react` with `'react/no-danger': 'error'`.

- [ ] **Step 4: Bootstrap**

`src/main.tsx`: when `import.meta.env.MODE === 'mock'`, `await worker.start({ onUnhandledRequest: 'bypass' })` (generate `public/mockServiceWorker.js` with `npx msw init public --save`). Then render `<QueryClientProvider>` + `<RouterProvider router={router}/>` + `<Toaster/>`. QueryClient defaults: `retry: false` for mutations, `retry: 1` for queries, `refetchOnWindowFocus: true`. `src/router.tsx` holds placeholder routes for `/requests` ("Requests") and `*` (not found, with a link to `/requests`). `/` redirects to `/requests`.

- [ ] **Step 5: Write the failing test** `src/router.test.tsx`

```tsx
test('unknown route shows not found with a link to requests', async () => {
  renderWithProviders(<AppRoutes />, { route: '/nope' })
  expect(await screen.findByText(/not found/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /requests/i })).toHaveAttribute('href', '/requests')
})
```

- [ ] **Step 6: Run it, make it pass, then verify the whole toolchain**

Run: `npm test` → PASS. `npm run lint` → no errors. `npm run build` → succeeds.

- [ ] **Step 7: Commit** — `chore: tooling (tailwind, shadcn, router, query, vitest, msw, proxy)`

---

### Task 2: Money and date helpers

**Files:**
- Create: `src/lib/money.ts`, `src/lib/dates.ts`, `src/components/Money.tsx`, `src/components/Timestamp.tsx`
- Test: `src/lib/money.test.ts`, `src/lib/dates.test.ts`

**Interfaces:**
- Produces:
  - `toCents(amount: number): number` (`Math.round(amount * 100)`; a stored value is never changed, only measured).
  - `sumCents(amounts: unknown[]): number` (non-numbers are ignored).
  - `formatMoney(amount: number | null | undefined): string` (`'4,820.17'`, `'—'` for null/undefined).
  - `formatCents(cents: number): string`.
  - `parseAmountInput(text: string): number | null` (accepts `-`, digits, one `.`, at most 2 decimals, optional `,` grouping; otherwise `null`).
  - `formatTimestamp(utcIso: string): string` (local `yyyy-MM-dd HH:mm`).
  - `formatRelative(utcIso: string, now?: Date): string` (`'2 minutes ago'`, via `Intl.RelativeTimeFormat`).
  - `<Money value={number|null} />` (right-aligned, `tabular-nums`). `<Timestamp utc={string} />` (local text, relative time in `title`).

- [ ] **Step 1: Write failing tests**

```ts
test('sums 200 rows of 0.1 exactly', () => expect(sumCents(Array(200).fill(0.1))).toBe(2000))
test('sums mixed amounts to the cent', () => expect(sumCents([184.32, 62.1, 1250, 0.3, 0.2])).toBe(149692))
test('ignores non-numbers in a broken payload', () => expect(sumCents([1.5, '2', null, undefined])).toBe(150))
test('formats', () => { expect(formatMoney(4820.17)).toBe('4,820.17'); expect(formatMoney(-5)).toBe('-5.00'); expect(formatMoney(null)).toBe('—') })
test('parses amount input', () => {
  expect(parseAmountInput('1,250.5')).toBe(1250.5); expect(parseAmountInput('184.321')).toBeNull()
  expect(parseAmountInput('abc')).toBeNull(); expect(parseAmountInput('-12')).toBe(-12)
})
test('relative time', () => expect(formatRelative('2026-10-27T10:00:00Z', new Date('2026-10-27T10:02:00Z'))).toBe('2 minutes ago'))
```

- [ ] **Step 2: Run** `npm test -- src/lib` → FAIL (modules missing)
- [ ] **Step 3: Implement** the helpers and the two components
- [ ] **Step 4: Run** `npm test -- src/lib` → PASS
- [ ] **Step 5: Commit** — `feat: money and date helpers`

---

### Task 3: API types, problem parsing, mock data and handlers

**Files:**
- Create: `src/api/schema.ts`, `src/api/problem.ts`, `src/mocks/db.ts`, `src/mocks/fixtures/requests.ts`, `src/mocks/fixtures/users.ts`, `src/mocks/fixtures/lists.ts`, `src/mocks/handlers/auth.ts`, `src/mocks/handlers/requests.ts`, `src/mocks/handlers/users.ts`, `src/mocks/handlers/support.ts`
- Modify: `src/mocks/handlers/index.ts`
- Test: `src/api/problem.test.ts`, `src/mocks/handlers/requests.test.ts`

**Interfaces:**
- Produces, in `src/api/schema.ts` (field names exactly as the API spec §6.2, §6.4, §7, §8.3, §11 and API requirements R-1/R-4):
  - `TXN_KINDS = ['Check','CcCharge','CcCredit','Deposit','Skip'] as const`, `type TxnKind`.
  - `type RequestStatus = 'pending'|'posting'|'posted'|'partial'|'unknown'|'discarded'`.
  - `type AttemptOutcome = 'in-progress'|'posted'|'partial'|'failed'|'held'|'refused'|'busy'|'unavailable'|'error'|'unknown'`.
  - `type Action = 'edit'|'validate'|'post'|'discard'|'restore'|'resolve'`.
  - `interface Payload { reference?: unknown; controlTotal?: unknown; transactions?: unknown; [k: string]: unknown }` (deliberately loose: payloads may be unreadable).
  - `interface Txn { externalId?: string; kind?: string; date?: string; amount?: number; account?: string; lineAccount?: string; payee?: string; checkNo?: string; refNumber?: string; memo?: string; last4?: string; [k: string]: unknown }`.
  - `interface Finding { index: number; externalId?: string|null; reason: string; detail?: string; candidates?: string[] }`.
  - `interface ValidationSnapshot { state: 'ok'|'held'|'refused'|'unreadable'|'unavailable'; validatedUtc?: string; versionNumber?: number; counts?: Record<string,number>; validation?: Finding[]; errors?: string[]; unknownNames?: { accounts: string[]; vendors: string[]; customers: string[] }; reason?: string }`.
  - `interface Actor { id: string; name: string; email?: string }`, `interface EmailMeta { subject: string|null; receivedUtc: string|null; from?: string|null; messageId?: string|null }`.
  - `interface RequestSummary { id; publicRef; status; rowVersion; source: {kind; id; name}; reference; controlTotal; transactionCount; currentVersion; needsAttention; duplicate: { flagged; of: number|null; ofRef?: string|null; ofStatus?: RequestStatus|null; reasons: string[]; acknowledgedBy: Actor|null }; validation: Omit<ValidationSnapshot,'validation'>; lastAttempt: { id; outcome: AttemptOutcome; httpStatus: number|null; finishedUtc: string|null }|null; postId: string|null; email: EmailMeta|null; discardReason?: string|null; created: {utc; by: Actor}; updated: {utc; by: Actor}; allowedActions: Action[] }`.
  - `interface RequestDetail extends RequestSummary { payload: Payload; readErrors: string[]; validation: ValidationSnapshot; ledgerBatch?: { postId; status; createdUtc; counts } | null }`.
  - `interface Page<T> { items: T[]; page: number; pageSize: number; total: number }`.
  - `interface Stats { byStatus: Record<RequestStatus, number>; needsAttention: { pending: number; all: number }; duplicate: { pending: number; all: number } }`.
  - `interface VersionSummary { number; created: {utc; by: Actor}; note: string|null; changeCount: number }`, `interface Change { op: 'add'|'remove'|'replace'; path: string; old?: unknown; new?: unknown }`, `interface Version extends VersionSummary { payload: Payload; changes: Change[] }`.
  - `interface Attempt { id; versionNumber; outcome: AttemptOutcome; httpStatus: number|null; postId: string|null; counts: Record<string,number>|null; error: string|null; startedUtc; finishedUtc: string|null; startedBy: Actor; resolvedBy?: Actor|null; resolvedUtc?: string|null; resolutionNote?: string|null; result?: unknown }`.
  - `interface PostedRow { index: number; externalId?: string; txnId: string; kind: string; account: string; amount: number }`.
  - `interface RequestEvent { id; kind: string; detail: Record<string, unknown>|null; atUtc: string; actor: Actor }`.
  - `interface Me { id; email; displayName; role: 'admin'|'editor'|'viewer'; mustChangePassword: boolean; scopes: string[] }`.
  - `interface User { id; email; displayName; role; disabled: boolean; lockedOutUntilUtc: string|null; lastLoginUtc: string|null; rowVersion: number }`, `interface UserAuditRow { id; kind; actor: Actor; detail; atUtc }`.
  - `interface QbLists { accounts: string[]; vendors: string[]; customers: string[]; syncedUtc: string|null }`.
- Produces, in `src/api/problem.ts`: `interface ApiProblem { type?: string; title: string; status: number; detail?: string; code?: string; [ext: string]: unknown }`; `class ApiError extends Error { problem: ApiProblem; headers: Headers }`; `async function toApiError(res: Response): Promise<ApiError>` (non-JSON body → `{ title: res.statusText || 'Request failed', status: res.status }`); `problemCode(p: ApiProblem): string | undefined` (reads `code`, else the last segment of `type`, else `title` if it is kebab-case, e.g. `already-posting`); `retryAfterSeconds(h: Headers): number | null`.
- Produces, in `src/mocks/db.ts`: `mockDb` (in-memory requests, versions, attempts, events, users; `reset()` called in `afterEach` in test setup) plus `mockControl` for tests to force outcomes: `mockControl.nextPost: { status: number; body: unknown; delayMs?: number } | null`.

- [ ] **Step 1: Write failing tests**

`problem.test.ts`: `problemCode({title:'x',status:409,type:'https://…/problems/already-posting'})` → `'already-posting'`; non-JSON 502 → `ApiError` with `status 502`; `retryAfterSeconds(new Headers({'Retry-After':'5'}))` → `5`.

`requests.test.ts` (against msw node server, plain `fetch`):
- `GET /api/v1/saved-requests?status=pending&needsAttention=true` returns only pending requests flagged needs attention, with `total` matching.
- `GET /api/v1/saved-requests/1` has `ETag` `"<rowVersion>"`.
- `PUT /api/v1/saved-requests/1` with a stale `If-Match` → 412 with `updatedBy.name`.
- `PUT` without `If-Match` → 428.
- `PUT` on a posted request → 409 with code `not-editable`.

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** types, problem helpers, fixtures and handlers

Fixtures must include at least: a clean pending request with 12 rows; a pending **210-row** request with 3 findings (one `unknown-payee`, one `no-account-rule` with candidates, one `date-too-old`) and a control total off by 10.00; an unreadable request (`kind: "Cheque"`, `readErrors: ["$.transactions[3].kind: 'Cheque' is not a TxnKind"]`); one with `transactions` not an array; a duplicate-flagged pending request pointing at another; one each in `posting`, `posted` (with TxnIDs), `unknown` (with `ledgerBatch`), `partial`, and `discarded`. At least one payload carries an extra top-level field (`email`) and an extra row field (`confidence`). Users: one admin (`mustChangePassword:false`), one editor, one viewer, one disabled, one locked. Password for every mock user: `correct horse battery`.

Handlers implement every route in design §5–§6 and brief §5 with the documented error codes: login `401 invalid-credentials` / `423` with `Retry-After: 300`; `PUT` with ETag checks; post honoring `mockControl.nextPost` (default: success that moves the request to `posted` after `delayMs` 1500 and sets status `posting` meanwhile, so polling can be seen in dev); `duplicate-unconfirmed` when flagged without `confirmDuplicate`; `allowedActions` computed from status and the caller's role per API spec §7.1 and §11.1. The access token is `mock-token-<userId>-<n>`. Refresh rotates `n` and returns 401 if the presented cookie is older than the last rotation (mimics family revocation).

- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** — `feat: API types, problem parsing, MSW mock API`

---

### Task 4: Session and fetch wrapper (refresh once, cross-tab, posts exempt)

**Files:**
- Create: `src/api/session.ts`, `src/api/client.ts`
- Test: `src/api/session.test.ts`, `src/api/client.test.ts`

**Interfaces:**
- Consumes: `ApiError`, `toApiError` (Task 3).
- Produces:
  - `session.ts`: `getAccessToken(): string | null`; `setAccessToken(t: string | null, opts?: { broadcast?: boolean }): void`; `onSessionEnded(cb: () => void): () => void`; `refreshSession(): Promise<string | null>`. Within a tab, concurrent calls share one in-flight promise. Across tabs, the work runs inside `navigator.locks.request('qbpost-refresh', …)`. Inside the lock, if a token newer than the one held when the call started arrived over `BroadcastChannel('qbpost-session')`, return it without calling the API. Otherwise `POST /api/v1/auth/refresh` (`credentials: 'same-origin'`), store the token, and broadcast `{type:'token', token}`. On failure, broadcast `{type:'ended'}` and fire `onSessionEnded`. Falls back to the in-tab promise when `navigator.locks` is undefined.
  - `client.ts`: `apiFetch<T>(path: string, init?: RequestInit & { noAuthRetry?: boolean; timeoutMs?: number }): Promise<{ data: T; headers: Headers; status: number }>`. It prefixes `/api/v1`, adds `Authorization: Bearer`, and parses JSON (204 → `undefined`). Non-2xx → throws `ApiError`. On `401` with `noAuthRetry` unset: calls `refreshSession()` once, retries once, and on refresh failure throws the 401. With `noAuthRetry: true`: refreshes the session (so the next call works) but **re-throws the 401 without re-sending**. `timeoutMs` uses `AbortSignal.timeout`, and a timeout throws `ApiTimeoutError`. Also exports `api` (an `openapi-fetch`-free thin set of helpers: `get`, `post`, `put`, `patch`) built on `apiFetch`.

- [ ] **Step 1: Write failing tests**

```ts
test('401 → one refresh → retry succeeds', …)          // handler counts: refresh called 1, GET called 2
test('three parallel 401s share one refresh', …)        // refresh called exactly 1
test('noAuthRetry: post is not re-sent after 401', …)    // POST /post called exactly 1, refresh called 1, rejects with status 401
test('refresh failure ends session', …)                  // onSessionEnded callback called
test('two tabs refreshing at once call the API once', async () => {
  // simulate two tabs: two independent module instances (vi.resetModules + dynamic import) sharing a
  // fake navigator.locks (serialising mutex) and a shared BroadcastChannel polyfill
  // both call refreshSession() concurrently → refresh endpoint hit 1 time, both resolve to the same token
})
test('timeout throws ApiTimeoutError', …)               // timeoutMs: 50, handler delays 200 ms
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `session.ts` and `client.ts`
- [ ] **Step 4: Run** `npm test -- src/api` → PASS
- [ ] **Step 5: Commit** — `feat: auth session with cross-tab refresh and fetch wrapper`

---

### Task 5: Sign-in, change password, guards, app shell

**Files:**
- Create: `src/api/queries/auth.ts`, `src/api/queries/health.ts`, `src/auth/SessionProvider.tsx`, `src/auth/RequireAuth.tsx`, `src/auth/SignInPage.tsx`, `src/auth/ChangePasswordPage.tsx`, `src/layout/AppShell.tsx`, `src/layout/TopBar.tsx`, `src/layout/DbHealthLight.tsx`, `src/layout/ThemeToggle.tsx`, `src/components/ProblemAlert.tsx`
- Modify: `src/router.tsx`, `src/main.tsx`
- Test: `src/auth/auth.test.tsx`, `src/layout/AppShell.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `refreshSession`, `setAccessToken`, `onSessionEnded` (Task 4).
- Produces: `useSession(): { me: Me | null; status: 'restoring'|'signed-in'|'signed-out'; signIn(email, password): Promise<void>; signOut(): Promise<void>; refetchMe(): Promise<void> }`. `<RequireAuth>` (redirects to `/sign-in?next=<path>`; if `me.mustChangePassword`, redirects to `/change-password`). `hasScope(me, scope: string): boolean`. `<ProblemAlert error={unknown} />` (shows `title` and `detail`, or "Something went wrong" plus `requestId` when present). A global `ApiError` handler: any `403` with code `password-change-required` navigates to `/change-password`.

- [ ] **Step 1: Write failing tests** (`auth.test.tsx`)
- Wrong password → text "Email or password is wrong."
- Locked (mock returns 423, `Retry-After: 300`) → "Locked. Try again in 5 minutes."
- 503 on login → the problem `detail` is shown.
- Sign in with `mustChangePassword` → lands on change password. Requests are not reachable (`/requests` redirects back).
- Change password with 11 chars → "At least 12 characters", and no request sent. Mismatched confirm → "Passwords don't match". Success → `/requests`.
- Page load with a valid refresh cookie (mock) → signed in without the form. With none → `/sign-in?next=%2Frequests%2F5`, and after sign-in lands on `/requests/5`.
- Sign out → `POST /auth/logout` called, query cache cleared, at `/sign-in`.

`AppShell.test.tsx`: the Users nav link is visible for an admin (`users:manage`) and absent for an editor. Health light shows "Database: OK" for a 200 and "Database: unavailable" for a 503 (via `aria-label`).

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.** Theme toggle: `light`/`dark`/`system`, stored in `localStorage` key `qbpost-theme` (wrapped in try/catch), applying the class `dark` on `<html>`.
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** — `feat: sign-in, forced password change, guards and app shell`

---

### Task 6: Requests list (morning queue)

**Files:**
- Create: `src/api/queries/requests.ts` (list, stats, and later the detail hooks), `src/features/requests/list/RequestsPage.tsx`, `QueueTabs.tsx`, `RequestsFilters.tsx`, `RequestsTable.tsx`, `NewArrivalsPill.tsx`, `src/components/StatusBadge.tsx`, `src/components/FlagChips.tsx`
- Modify: `src/router.tsx`
- Test: `src/features/requests/list/RequestsPage.test.tsx`

**Interfaces:**
- Produces: `QUEUE_PRESETS: Record<QueueTab, ListParams>` where `type QueueTab = 'todo'|'attention'|'duplicates'|'posting'|'posted'|'discarded'|'all'`:
  - `todo` = `{ status: ['pending','partial','unknown'], sort: 'received' }`
  - `attention` = `{ status: ['pending'], needsAttention: true, sort: 'received' }`
  - `duplicates` = `{ status: ['pending'], duplicate: true, sort: 'received' }`
  - `posting` / `posted` / `discarded` = `{ status: [x], sort: '-updated' }`
  - `all` = `{ sort: '-received' }`
- `countFor(tab: QueueTab, stats: Stats): number` (todo = pending + partial + unknown; attention = `needsAttention.pending`; duplicates = `duplicate.pending`; all = sum of `byStatus`).
- `useRequestsList(params: ListParams)`, `useStats({ refetchInterval: 60_000 })`. `ListParams` = `{ status?: RequestStatus[]; needsAttention?: boolean; duplicate?: boolean; q?: string; receivedFrom?: string; receivedTo?: string; source?: string; sort?: string; page?: number; pageSize?: number }`. Status is serialised as a repeated `status=` parameter.
- `<StatusBadge status />`, `<FlagChips request: RequestSummary />` (used again in Task 7).
- URL state: tab, q, dates and page live in the search params, so back and forward work.

- [ ] **Step 1: Write failing tests**
- Default tab "To do" is selected. The request URL has `status=pending&status=partial&status=unknown&sort=received`. Rows appear oldest received first.
- Tab labels show counts from stats, e.g. "To do 9", "Needs attention 2".
- Columns show the email subject, local received time, `4,820.17`, the status badge, and the flag "Possible duplicate of SR-000117". A request with `email: null` shows "—".
- Typing in search (debounced 300 ms) sends `q=`. Changing the tab resets the page to 1.
- Paging: "Next" sends `page=2`.
- Clicking a row navigates to `/requests/:id`.
- Empty To do → "All clear. Nothing waiting."
- New arrivals: advance fake timers 60 s with stats `pending` up by 2 → pill "2 new — show". Rows are unchanged until it's clicked. Clicking it refetches the list and the pill disappears.
- An XSS string `<img src=x onerror=alert(1)>` as an email subject renders as literal text (`getByText` finds it; `container.querySelector('img')` is null).

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat: requests list with queue tabs, filters and new-arrival pill`

---

### Task 7: Request detail shell: header, banners, action bar, tabs

**Files:**
- Create: `src/features/requests/detail/RequestDetailPage.tsx`, `RequestHeader.tsx`, `StatusBanner.tsx`, `ActionBar.tsx`
- Modify: `src/api/queries/requests.ts`, `src/router.tsx`
- Test: `src/features/requests/detail/RequestDetailPage.test.tsx`

**Interfaces:**
- Produces: `useRequest(id: string, opts?: { pollWhilePosting?: boolean })`, which returns `{ data: RequestDetail; etag: string }`. It refetches every 3 s while `data.status === 'posting'` and `pollWhilePosting` is true (default true). Focus refetch is disabled while `useDraftDirty(id)` is true (Task 9 sets it; default false). `requestKeys` (query-key factory: `all`, `list(params)`, `stats`, `detail(id)`, `versions(id)`, `version(id,n)`, `attempts(id)`, `attempt(id,a)`, `events(id)`, `original(id)`). `<ActionBar request onAction={(a: Action) => void} disabled?: Partial<Record<Action, string>> />`. It renders only the actions in `allowedActions`, in the order Validate, Post, Discard, Restore, Resolve. A `disabled` reason is shown as a tooltip. Save and Discard-changes live in the Transactions toolbar (Task 9), not here.
- Tabs via the `?tab=` search param: `transactions` (default), `versions`, `attempts`, `history`. Tasks 8–12 fill them in.

- [ ] **Step 1: Write failing tests**
- The header shows `SR-000123`, the status badge, the email subject, local received time, reference, source name, created and updated (who and when), and `postId` once posted.
- The duplicate flag links to `/requests/117` and shows the other request's status.
- Banners: `posting` → "Posting… started by Asha K"; `posted` → "Posted. Locked." with postId; `unknown` → "QuickBooks may have posted this"; `partial` → "Some rows posted"; `discarded` → the reason.
- Viewer (`allowedActions: []`): no action buttons. Admin on `unknown` with `['resolve']`: only Resolve.
- 404 → "Request not found" with a link back.
- While `posting`, the detail is re-fetched every 3 s (fake timers: 2 more GETs after 6 s), and polling stops once the status changes.

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat: request detail header, banners and action bar`

---

### Task 8: Transactions tab (read-only): validation panel, virtualised table, findings

**Files:**
- Create: `src/features/requests/transactions/TransactionsTab.tsx`, `ValidationPanel.tsx`, `TxTable.tsx`, `columns.tsx`, `findings.ts`, `RawJsonEditor.tsx` (read-only mode here)
- Test: `src/features/requests/transactions/findings.test.ts`, `TransactionsTab.test.tsx`

**Interfaces:**
- Produces:
  - `findings.ts`: `findingsByRow(rows: Txn[], findings: Finding[]): Map<number, Finding[]>`. It keys by `index`. If `externalId` is present and the row at `index` has a different `externalId`, it uses the row whose `externalId` matches instead. `readErrorCells(readErrors: string[]): Map<number, Set<string>>` parses `$.transactions[N].field`. `tableShape(payload: Payload): 'table' | 'raw'` returns `'raw'` when `transactions` is missing, not an array, or contains a non-object.
  - `<TxTable rows editable={boolean} findings readErrors onlyProblems … />` (Task 9 adds edit props). Columns as design §6.3.1. Column visibility is persisted to `localStorage` key `qbpost-tx-columns` (try/catch). Virtualised with `@tanstack/react-virtual`, with a sticky header and payload order preserved.
  - `useValidate(id)` mutation: `POST /{id}/validate`, then sets the detail cache from the response.

- [ ] **Step 1: Write failing tests**
- `findingsByRow` maps by index, prefers an `externalId` match when the index disagrees, and drops findings whose index is out of range into a `-1` bucket, which is shown in the panel as "Row not found".
- `tableShape({transactions: 'x'})` → `'raw'`. `tableShape({transactions: [{}]})` → `'table'`.
- The 210-row fixture renders fewer than 80 `<tr>` in the DOM (virtualised). The header row stays present after scrolling.
- Rows with findings have `data-problem="true"`. Hovering the icon shows the reason, detail and candidates.
- The "Only rows with problems" toggle shows exactly 3 rows.
- The validation panel shows state `held`, counts, "checked N min ago", the request-level errors, and the unknown names as chips. Re-validate calls `POST /validate` and the panel updates.
- The panel says "Validation is out of date" when `validation.versionNumber < currentVersion`.
- An unreadable payload marks the `kind` cell of row 4 (from `readErrors`). The non-array `transactions` fixture shows the raw JSON view with the read errors listed above it.
- Hiding the "Check no" column persists after a re-render (localStorage).

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat: transactions table with validation findings`

---

### Task 9: Inline editing, totals bar, save with If-Match

**Files:**
- Create: `src/features/requests/transactions/draft.ts`, `TotalsBar.tsx`, `cells/TextCell.tsx`, `cells/AmountCell.tsx`, `cells/DateCell.tsx`, `cells/KindCell.tsx`, `cells/NameComboCell.tsx`, `src/features/requests/dialogs/ConflictDialog.tsx`, `src/api/queries/lists.ts`
- Modify: `TxTable.tsx`, `TransactionsTab.tsx`, `RawJsonEditor.tsx`, `src/api/queries/requests.ts`
- Test: `src/features/requests/transactions/draft.test.ts`, `TransactionsEdit.test.tsx`

**Interfaces:**
- Consumes: `sumCents`, `parseAmountInput`, `formatCents` (Task 2); `TXN_KINDS` (Task 3); `useRequest`, `requestKeys` (Task 7).
- Produces:
  - `draft.ts` (pure, immutable):
    - `type Draft = { base: Payload; rows: Txn[]; deleted: Set<number>; added: Txn[]; top: { controlTotal: unknown }; dirtyCells: Set<string> }` (cell key `"<rowKey>:<field>"`; `rowKey` = original index, or `n<k>` for added rows)
    - `createDraft(payload: Payload): Draft`
    - `setCell(d: Draft, rowKey: string, field: keyof Txn, value: unknown): Draft` (setting a value back to the original removes the dirty mark)
    - `addRow(d): Draft`, `toggleDeleteRow(d, rowKey): Draft`, `setControlTotal(d, v: number|null): Draft`
    - `draftToPayload(d: Draft): Payload` (`{...base, controlTotal, transactions: [...kept rows in order, ...added]}`; each row is `{...originalRow, ...edits}`, so **unknown fields survive**)
    - `isDirty(d): boolean`, `dirtyCount(d): number`, `rowsSumCents(d): number` (excludes deleted rows)
  - `useDraft(id, payload)` hook, plus `useDraftDirty(id)` (a module-level store read by Task 7's focus-refetch guard and by Task 10).
  - `useSaveRequest(id)` mutation: `PUT /saved-requests/{id}` with `If-Match: etag`, body `{ payload, note }`. On success it replaces the detail cache and resets the draft. A `412` opens `<ConflictDialog problem onReload onCopy />`.
  - `useQbLists()`: `GET /quickbooks/lists`, `staleTime: 5 min`.
  - `<NameComboCell list: string[] value onCommit />`: a searchable shadcn `Command` in a `Popover`. Free text is allowed. A value not in the list shows the flag "not in QuickBooks". Payee uses `customers` when the row's `kind === 'Deposit'`, otherwise `vendors`.

- [ ] **Step 1: Write failing tests**

`draft.test.ts`:
```ts
test('unknown fields survive', () => {
  const p = { reference: 'r', controlTotal: 1, email: { subject: 's' }, transactions: [{ kind: 'Check', amount: 1, confidence: 0.9 }] }
  const out = draftToPayload(setCell(createDraft(p), '0', 'payee', 'X'))
  expect(out).toEqual({ ...p, transactions: [{ kind: 'Check', amount: 1, confidence: 0.9, payee: 'X' }] })
})
test('setting a cell back clears dirty', …)
test('sum excludes deleted rows and includes added', …)
test('controlTotal is only changed by setControlTotal', () => {
  const d = setCell(createDraft({ controlTotal: 10, transactions: [{ amount: 10 }] }), '0', 'amount', 12)
  expect(draftToPayload(d).controlTotal).toBe(10)
})
test('unedited draft round-trips to a deep-equal payload', …)
```

`TransactionsEdit.test.tsx`:
- Editor on pending: click the payee cell → combo → choose "ABC Plumbing LLC" → the cell is tinted → "1 unsaved change".
- A Deposit row's payee combo lists customers, not vendors.
- Typing "Nobody Inc" and pressing Enter keeps the text and shows the flag "not in QuickBooks".
- Kind select offers exactly `TXN_KINDS`. The unreadable value `Cheque` is shown and flagged.
- The amount cell rejects `184.321` (stays in edit mode with the message "Up to 2 decimals").
- Totals bar: after changing 184.32 → 194.32, the sum shows `4,840.17` and the difference shows `20.00` in red. `controlTotal` is unchanged until the user types in it.
- Keyboard: Enter edits, Tab moves to the next cell, Esc cancels.
- Save sends `PUT` with `If-Match: "4"` and body `{payload, note}` where `payload` deep-equals `draftToPayload(draft)`. On 200 the tint clears and the validation panel shows the new snapshot.
- 412 → the dialog says "Changed by Asha K" with buttons "Reload (lose my edits)" and "Copy my edits". Copy writes the JSON to the clipboard (mock `navigator.clipboard.writeText`).
- 409 `not-editable` → the detail reloads and shows the new status.
- Viewer, or a status other than pending: cells aren't editable, and there's no Save/Add row.
- Navigating away with unsaved edits asks for confirmation (React Router `useBlocker`, plus `beforeunload`).
- Add row appends an empty row at the end. Delete row (with confirmation) strikes it through. Save omits it.
- Raw JSON editor: invalid JSON disables Save and shows "Not valid JSON". Valid JSON saves with `If-Match`.

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat: inline transaction editing with totals bar and conflict handling`

---

### Task 10: Posting

**Files:**
- Create: `src/features/requests/posting/outcome.ts`, `usePost.ts`, `PostDialog.tsx`, `PostingProgress.tsx`, `PostResultBanner.tsx`
- Modify: `src/features/requests/detail/RequestDetailPage.tsx`, `ActionBar` wiring, `src/features/requests/transactions/TxTable.tsx` (findings from a 422)
- Test: `src/features/requests/posting/outcome.test.ts`, `Posting.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` with `noAuthRetry: true` and `timeoutMs: 600_000` (Task 4); `useDraftDirty` (Task 9).
- Produces:
  - `type PostOutcome = { kind: 'posted'|'partial'|'failed'|'unknown'|'held'|'refused'|'busy'|'conflict'|'duplicate'|'stale'|'unavailable'|'timeout'|'error'; title: string; detail?: string; retryAfter?: number; findings?: Finding[]; errors?: string[]; postId?: string; attemptId?: number }`.
  - `interpretPost(res: { status: number; body: unknown; headers: Headers } | ApiError | ApiTimeoutError): PostOutcome`. Mapping, exactly per design §6.3.2:
    - 200 with request `status` posted → `posted`; partial → `partial`; unknown → `unknown`; failed → `failed`
    - 422 → `held` with `validation`
    - 400 → `refused` with `errors`/`detail`
    - 409 `busy` → `busy` with `retryAfter`; 409 `already-posting`/`already-posted` → `conflict`; 409 `duplicate-unconfirmed` → `duplicate`
    - 412 → `stale`; 503 → `unavailable`; `ApiTimeoutError` → `timeout`; anything else → `error`
  - `usePost(id)`: `{ post(opts: { confirmDuplicate?: boolean }): void; isPosting: boolean; outcome: PostOutcome | null }`. It sends `If-Match` with the current etag, and **never calls itself again**. On `timeout`, it switches to polling via `useRequest` (already polling while `posting`) and derives the final outcome from `lastAttempt` when the status leaves `posting`. On `unknown` or `partial` outcomes it invalidates the detail, attempts and events.

- [ ] **Step 1: Write failing tests**

`outcome.test.ts`: one test per mapping row above, with the API spec's example bodies.

`Posting.test.tsx`:
- Post is disabled with the tooltip "Save first" while the draft is dirty.
- Clicking Post opens a dialog with the email subject, `12 rows`, `4,820.17` and the validation state. With a stale snapshot, it shows "Validation is out of date" and Confirm is still enabled.
- A duplicate-flagged request: the dialog shows "Possible duplicate of SR-000117 (pending)", and Confirm stays disabled until "Yes, post anyway" is checked. The request body then has `confirmDuplicate: true`.
- A 409 `duplicate-unconfirmed` response opens the same confirmation.
- After Confirm, the button is disabled immediately and the text "Posting 12 rows to QuickBooks… this can take a few minutes" appears. Double-clicking sends exactly 1 POST.
- 200 posted → the banner "Posted" with the postId. Attempts are invalidated.
- 422 → "Nothing was sent", and the 3 rows get `data-problem` from the response findings.
- 409 busy with `Retry-After: 5` → "QuickBooks is busy. Try again in 5 seconds". Post is disabled for 5 s and re-enabled after fake timers advance.
- 409 already-posting → the detail reloads, and a banner names who pressed Post.
- 401 on post → exactly 1 POST was sent, refresh was called, and the detail is reloaded.
- **Timeout recovery**: the mock delays the post 700 ms, and `timeoutMs` is overridden to 100 ms through a test hook. The UI shows posting progress while polling, and when the mock finishes, shows "Posted". The POST count stays 1.
- **Reopen while posting**: mount the detail of the `posting` fixture → progress is shown, there's no Post button, and when the mock flips it to posted, the success banner appears.
- 200 with request `status: unknown` → a warning containing "may have posted".

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat: posting with confirmation, progress, recovery and outcomes`

---

### Task 11: Discard, restore, resolve

**Files:**
- Create: `src/features/requests/dialogs/DiscardDialog.tsx`, `RestoreDialog.tsx`, `ResolveDialog.tsx`
- Modify: `RequestDetailPage.tsx`, `src/api/queries/requests.ts`
- Test: `src/features/requests/dialogs/dialogs.test.tsx`

**Interfaces:**
- Produces: `useDiscard(id)` (`POST /discard {reason}`), `useRestore(id)` (`POST /restore`), and `useResolve(id)` (`POST /resolve {outcome, note}`). Each invalidates detail, list, stats and events.

- [ ] **Step 1: Write failing tests**
- Discard: Confirm is disabled with an empty reason. 501 characters → "At most 500 characters". Success → the discarded banner shows the reason.
- Restore: confirm → status pending.
- Resolve on `unknown`: the dialog shows the postId and `ledgerBatch` status and counts before the choices, plus the text "Check QuickBooks before you choose". Both choices are present. A note is required. Choosing "Not posted" sends `{outcome:'not-posted', note}`.
- Resolve on `unknown` without `ledgerBatch` shows the postId only, and the dialog still works.
- Resolve on `partial`: only "Posted (accept as is)" is offered, along with "post any remaining rows outside the dashboard".

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat: discard, restore and resolve dialogs`

---

### Task 12: Versions, original, attempts, history tabs

**Files:**
- Create: `src/features/requests/versions/VersionsTab.tsx`, `changeSentence.ts`, `OriginalViewer.tsx`, `src/features/requests/attempts/AttemptsTab.tsx`, `src/features/requests/history/HistoryTab.tsx`, `eventSentence.ts`
- Modify: `src/api/queries/requests.ts`, `RequestDetailPage.tsx`
- Test: `changeSentence.test.ts`, `eventSentence.test.ts`, `HistoryTabs.test.tsx`

**Interfaces:**
- Produces:
  - `changeSentence(c: Change, rows?: Txn[]): { text: string; details?: unknown }`
    - `replace $.transactions[1].payee` → `Row 2 (row-7) payee: ABC PLUMBING → ABC Plumbing LLC` (the row label is 1-based, with externalId when known)
    - `replace $.controlTotal` → `Control total: 4,820.17 → 4,784.17` (money fields `amount`/`controlTotal` formatted)
    - `add $.transactions[12]` → `Row 13 added`; `remove $.transactions[7]` → `Row 8 removed` (with `details` = the row object)
    - any other path → `<path>: <old> → <new>` with JSON-stringified values
  - `eventSentence(e: RequestEvent): string` for created, flagged-duplicate, edited, validated, post-started, post-finished, discarded, restored, and resolved. Unknown kinds → `"<kind>"` (never dropped).
  - Hooks: `useVersions`, `useVersion`, `useOriginal` (fetched as **text**, shown pretty-printed if it parses, plus a "Raw" toggle and a Copy button), `useAttempts`, `useAttempt`, and `useEvents`.

- [ ] **Step 1: Write failing tests**
- `changeSentence` produces each example above exactly.
- `eventSentence` for each kind, plus an unknown kind.
- Versions tab: the list shows number, who, when, note and change count. Selecting v2 shows its sentences. "View original" shows pretty JSON, and Raw shows the exact text, including its original whitespace.
- Attempts tab: newest first. Expanding a posted attempt shows a TxnID table (index, externalId, kind, account, amount, txnId). A held attempt shows its findings. An error attempt shows the title and detail. A resolved attempt shows the resolver and note.
- History tab: a timeline in API order with actors and local times.

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat: versions, original, attempts and history tabs`

---

### Task 13: Users (admin)

**Files:**
- Create: `src/api/queries/users.ts`, `src/features/users/UsersPage.tsx`, `UserPage.tsx`, `CreateUserDialog.tsx`, `OneTimePasswordDialog.tsx`
- Modify: `src/router.tsx` (routes `/users`, `/users/:id`, guarded by `hasScope(me,'users:manage')`, otherwise not found)
- Test: `src/features/users/users.test.tsx`

**Interfaces:**
- Produces: `useUsers(params)`, `useUser(id)` (with etag), `useCreateUser`, `usePatchUser(id)` (`If-Match`), `useResetPassword(id)`, `useUnlock(id)`, and `useUserAudit(id)`. `<OneTimePasswordDialog password onClose />` holds the password only in component state, and drops it on close.

- [ ] **Step 1: Write failing tests**
- The list has search, a role filter and a "Show disabled" toggle. The status column shows "Locked until …" for the locked user.
- Create → the dialog shows the temporary password with Copy and "You won't see this again." After closing, the password text is no longer in the document, and reopening the user doesn't show it.
- Create with an existing email → "That email already exists."
- Change role sends `PATCH` with `If-Match`. 409 `last-admin` → "There must be at least one active admin."
- The Disable button is hidden on the admin's own page.
- Reset password shows a new one-time password. Unlock calls `POST /unlock`, and the locked status clears.
- The audit list renders rows.
- An editor visiting `/users` sees not found.

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat: user management for admins`

---

### Task 14: End-to-end smoke, build check, README

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `README.md`, `package.json`
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: the mock mode from Task 1 (`npm run dev:mock`, used as Playwright's `webServer` on port 5174).

- [ ] **Step 1: Write the smoke test**

Sign in as the mock admin → the To-do queue shows → open the 12-row request → change row 1's payee via the combo → Save → note the PUT succeeded (the tint clears) → Post → Confirm → see "Posted" and a TxnID in the Attempts tab. A second test signs in, opens a request in a second page of the same context, and reloads both. Both stay signed in (cross-tab refresh).

- [ ] **Step 2: Run** `npx playwright install chromium && npm run e2e` → PASS
- [ ] **Step 3: Verify the whole build**

Run: `npm run lint && npm test && npm run build`. Expected: all green, and `dist/` contains `index.html` and `assets/` only (plus `mockServiceWorker.js` from `public/`; delete it from the production build via a `closeBundle` hook in `vite.config.ts` or by excluding it, so production never ships the mock worker). Check with `ls dist`.

- [ ] **Step 4: README**

Cover: what this is (one paragraph); `npm run dev:mock` (no API needed; mock users, all with the password `correct horse battery`); `npm run dev` with `VITE_API_PROXY_TARGET`; `npm test`, `npm run e2e`; `npm run gen:api` (once the API publishes the new routes, replace the hand-written types in `src/api/schema.ts` and keep `TXN_KINDS` derived from the generated enum); deploy (`npm run build`, copy `dist/*` into the API's `Dashboard:Path`, API requirement R-2); and a link to the design and the API requirements file.

- [ ] **Step 5: Commit** — `test: e2e smoke; docs: README`
