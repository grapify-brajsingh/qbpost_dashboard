# Plan: QuickBooks lists page (sidebar "Lists")

**Spec**: `docs/superpowers/specs/2026-10-30-qb-lists-page-spec.md` · **Requirement**: R-17 (new), R-16
**API side**: `D:\qb_post-issue-2\docs\qb-lists-page-m15-plan.md` (T-1500…T-1504). Tasks 1–6 need only the fake API;
task 7 needs API M15 in the Docker stack.

## 1. Files

| File | Change | Task |
|---|---|---|
| `docs/api-requirements-for-dashboard.md` | R-17 section, Tracker row, "APIs the dashboard needs built" row, Changelog | 1 (done with this plan) |
| `src/api/schema.ts` | `QbListSyncRun`; `QbListSyncFilters` | 2 |
| `src/api/queries/lists.ts` | `listKeys.detail`, `listKeys.syncs(filters)`; `useQbListsDetail`, `useQbListSyncs`; `useSyncQbLists` updates the detail cache and invalidates the history | 2 |
| `src/api/queries/lists.test.ts` (new) | sync success sets both caches and invalidates history; failure invalidates both | 2 |
| `src/mocks/db.ts`, `src/mocks/fixtures/lists.ts` | `mockDb.listSyncs` seeded at reset; every fake sync appends a row and moves `current` | 3 |
| `src/mocks/handlers/support.ts`, `support.test.ts` | `GET /quickbooks/lists/syncs` (scope, filters, paging, 400 on bad values) | 3 |
| `src/features/lists/qbListsView.ts` (new), `qbListsView.test.ts` | pure helpers: account type label, name search/sort, trigger label, outcome view, duration text, filter ↔ query mapping | 4 |
| `src/features/lists/ListsPage.tsx` (new) | header with `QbListsStatus`, tabs, URL state | 5 |
| `src/features/lists/NamesTable.tsx` (new) | accounts (name, type, type filter) and names tables, search, states | 5 |
| `src/features/lists/SyncHistory.tsx` (new) | filters, table, pager, states, 404 fallback | 5 |
| `src/features/lists/ListsPage.test.tsx` (new) | page tests (below) | 5 |
| `src/router.tsx` | `/lists`, crumb "QuickBooks lists" | 6 |
| `src/layout/AppSidebar.tsx`, `src/layout/CommandMenu.tsx` | **Lists** item (Work group, every role); Ctrl K entry | 6 |
| `src/layout/AppShell.test.tsx` (or the sidebar's existing test) | item visible for viewer, editor, admin | 6 |
| `e2e/` (mock e2e, if a sidebar walk exists) | follow the new item | 6 |
| `e2e-integration/lists-page.spec.ts` (new) | real API: names, Sync now, new history row | 7 |
| `docker-compose.integration.yml`, `README.md` | schedule back on, stopgap note removed | 7 |
| this plan, the spec | results, as built | 8 |

## 2. Tasks

| # | Task | Depends on | Outcome |
|---|---|---|---|
| 1 | Requirements doc: R-17 (history route) with shape and errors; Tracker, needed-built and Changelog rows | — | Written with this plan |
| 2 | Types and hooks, tests first | 1 | `lists.test.ts` red then green; pickers unchanged (`TransactionsTab`, `ReviewEditor` tests green) |
| 3 | Fake API: history store and route, tests first | 1 | `support.test.ts` covers filters, paging, 400, 403-free for viewers, a sync appends a row |
| 4 | Pure helpers, tests first | 2 | `qbListsView.test.ts` green |
| 5 | Page: header, name tabs, history tab, all states, tests first | 2–4 | `ListsPage.test.tsx` green |
| 6 | Route, sidebar, Ctrl K | 5 | Sidebar test green for all three roles |
| 7 | Real-API e2e and the Docker stack (after API M15 T-1503 is in the image) | 6, API M15 | `lists-page.spec.ts` green; schedule back on in compose |
| 8 | Full checks, docs as built, results | 1–7 | lint, build, test green; plan ticked; spec "As built" if anything differs |

## 3. Tests

- `lists.test.ts`: sync 200 → `['quickbooks','lists']` names-only and `['quickbooks','lists','detail']` with types both
  updated, history invalidated; sync 409 → both lists keys and history invalidated.
- `support.test.ts`: `GET …/syncs` newest first; `trigger=schedule`, `trigger=dashboard,api`, `outcome=failed`;
  `page`/`pageSize`, `pageSize=101` → 400, `trigger=nope` → 400; a viewer gets 200; a fake sync (ok, not-open skip,
  down) appends a row and only an `ok` row moves `current`.
- `qbListsView.test.ts`: `OtherCurrentAsset` → "Other current asset", `null` → "—"; search is case-insensitive
  "contains"; sort is locale-aware; trigger labels (`dashboard` → the display name; `requestedBy` missing on `dashboard` → "Sync now");
  duration "0.4 s", "1 min 52 s"; filter "Manual" ↔ `trigger=dashboard,api`.
- `ListsPage.test.tsx` (`renderApp('/lists')`, `mockControl.signInAs`):
  1. viewer: tabs with counts, account types, no Sync now; history visible;
  2. search filters and is kept in the URL; "Showing 4 of 15 vendors"; no-match state and Clear search;
  3. editor: Sync now → toast, the new names appear (via `mockControl.qbAdded`), history gets a **Synced** row by the user
     with **In use** moved to it;
  4. `mockControl.qbNotOpen` → **Skipped** row with the API message, **In use** stays on the older row;
  5. never synced → empty state (editor and viewer copy); lists 500 → `ProblemAlert` + retry;
  6. history filters and paging in the URL; `404` history → "needs a newer API", name tabs still work.
- Sidebar: **Lists** for viewer, editor, admin; active on `/lists`.
- `e2e-integration/lists-page.spec.ts`: sign in as admin → Lists → Accounts tab shows a seeded account (e.g. "Chase
  Business Checking 4410", type "Bank") → Vendors search → Sync now → toast with counts equal to the seed → Sync history
  top row **Synced**, started by the admin, **In use**.

## 4. Verification

```
npm run lint && npm run build && npm test
docker compose -f docker-compose.integration.yml up -d --build      # API image with M15
npx playwright test -c playwright.integration.config.ts
```

## 5. Milestones

- [x] Spec and plan written; R-17 in the requirements doc
- [x] Hooks and types (task 2)
- [x] Fake API history (task 3)
- [x] Page with all states (tasks 4–5)
- [x] Sidebar, route, Ctrl K (task 6)
- [x] Real API: M15 in the stack, e2e green, schedule back on (task 7)
- [x] Checks green, docs as built (task 8)

## 6. Results (2026-10-30)

- **API M15** (branch `feature/m15-qb-lists-page` in the API repo, commits `5fe5b2a`…`05c2a53`, not pushed): Core 1261,
  Api 1676, Data 504 passed (1 skipped, the opt-in perf test); build 0 warnings; v1 pins and both OpenAPI drift tests green.
- **New dashboard tests**, seen failing first: `lists.test.tsx` (4), `support.test.ts` +6 (R-17), `qbListsView.test.ts`
  (11), `ListsPage.test.tsx` (13), `AppShell.test.tsx` +1 (Lists for every role). All green.
- `npm run lint` clean; `npm run build` clean.
- `npm test`: three full runs on a loaded machine (Docker stack, the API agent's tests in the first) failed 7, 9 and 3
  timing-sensitive tests in `StatementPage`, `TransactionsEdit`, `Posting` ("isolation between requests"), `dialogs`,
  `StatementSheet`, `users`, `AppShell` (breadcrumb); every one passes when its file runs alone (104/104 and 59/59),
  and the same tests fail with the new Lists tests excluded (4 failed, 564 passed), so they are not caused by this
  change. Best full run: 588 of 591 passed.
- **Mock e2e** (`npm run e2e`): 4 passed, plus the new 375 px check for the Lists page (names and history): passed.
- **Real API** (`playwright.integration.config.ts`, Docker stack with API M15): **15 passed**, including
  `lists-page.spec.ts` (seeded names with types, vendor search, Sync now, new Synced row In use, names kept) and the
  existing `lists-sync.spec.ts`. First run failed once on a loose test selector ("Synced" also matched the message),
  fixed with exact matching.
- Stack: schedule back on (`list sync every 30 min (first after 2 min) … simulated company: 19 accounts, 15 vendors,
  6 customers`), README stopgap note replaced.
- Plan deviation: the hooks test is `lists.test.tsx` (it renders a provider), not `lists.test.ts`.

## 7. Review fixes (2026-10-30, built)

Tracked in "Review fixes round 2" of `2026-10-29-qb-list-sync-plan.md` (tasks 1 and 3), so the work has one checklist.
