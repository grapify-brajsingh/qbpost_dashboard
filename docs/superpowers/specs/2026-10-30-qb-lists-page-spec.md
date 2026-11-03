# Spec: QuickBooks lists page (sidebar "Lists")

**Date**: 2026-10-30 · **Status**: built (see §5, "As built") · **Requirements**: R-16 (exists), **R-17** (new) in
`docs/api-requirements-for-dashboard.md`
**Plan**: `docs/superpowers/plans/2026-10-30-qb-lists-page-plan.md`
**API side**: `D:\qb_post-issue-2\docs\qb-lists-page-m15.md` (M15: sync history route, simulated company seeded from
`qb-lists.json`).
**Builds on**: `2026-10-29-qb-list-sync-spec.md` (status line and **Sync now**, R-16).
**Source**: owner request 2026-10-30: "i still don't see the sync button … add one tab in the left side bar as list, on
click of which it should [show] the synced data from QuickBooks, also show the history of sync runs and manual syncs".
Tracked in issue #6.

## 1. Goal and scope

Today the only way to see the QuickBooks names, or to sync them, is the small status line under a statement's rows
table, and only in edit mode. Nobody finds it. Give the lists their own page, one click from the sidebar, that answers:

- **What names does the dashboard have?** Accounts (with their QuickBooks type), vendors, customers, searchable.
- **How fresh are they, and can I refresh them?** The existing status and **Sync now**, at the top of the page.
- **What happened with past syncs?** Every attempt, automatic and manual: when, who, result, how many names, and the
  safe message for a skip or failure.

In scope: a sidebar item and route, the page (three name tabs and a history tab), the history query, the fake API for
R-17, the Ctrl K menu entry, tests (unit, page, real-API e2e).

Out of scope (later, if wanted): what changed between two syncs (names added or removed), editing names (QuickBooks is
the source), changing the schedule from the dashboard, the raw `error` of a failed attempt (operators read the API log),
linking the statement page's status line to this page.

## 2. What it touches (read from the code)

- `src/layout/AppSidebar.tsx`: "Work" group (`Home`, `Statements`, `Audit trail`); `NavItem`, `on(prefix)`.
- `src/layout/CommandMenu.tsx`: page list (`label`, `to`, `icon`, optional `scope`).
- `src/router.tsx`: route table under the shell, `handle.crumb` for the breadcrumb.
- `src/api/queries/lists.ts`: `listKeys.qb`, `toQbLists` (keeps account **names only**), `useQbLists`, `useSyncQbLists`.
- `src/api/schema.ts`: `QbListsResponse` (accounts `{ name, type }`), `QbListSync`, `QbListCounts`, `Page<T>`.
- `src/features/requests/transactions/QbListsStatus.tsx` and `qbListsSync.ts`: status text, Sync now, toasts, 504
  re-reads. Reused as is on the new page.
- `src/components/`: `PageHeader`, `DataPanel`, `EmptyState`, `TableSkeleton`, `Pager`, `ProblemAlert`, `Timestamp`;
  `components/ui/` `tabs`, `table`, `input`, `native-select`, `badge`.
- `src/lib/` `useUrlFilters` (URL-backed view state), `pageParam`.
- `src/mocks/handlers/support.ts`, `src/mocks/db.ts` (`mockDb.lists`, `mockControl`), `src/mocks/fixtures/lists.ts`.
- `e2e-integration/lists-sync.spec.ts` (real API).

## 3. Behaviour

### 3.1 Sidebar and route

- New item **Lists** (icon `ListIcon`) in the **Work** group, after **Audit trail**, for **every role** (the API's
  `lists:read` is held by viewers too). Active on `/lists`.
- Route `/lists`, breadcrumb "QuickBooks lists". Ctrl K menu: "QuickBooks lists" → `/lists`, no scope.

### 3.2 Page frame

- `PageHeader`: title **QuickBooks lists**; description "The accounts, vendors and customers the review checks names
  against. The server syncs them from QuickBooks every 30 minutes while QuickBooks is open." (when `nextSyncUtc` is
  null: "Automatic sync is off; use Sync now."). Actions: `<QbListsStatus />` (status text with its tooltip, plus
  **Sync now** for `requests:edit`). This is the visible home of the button the owner could not find.
- Tabs (URL `?tab=`, default `accounts`): **Accounts (19)** · **Vendors (15)** · **Customers (6)** · **Sync history**.
  Counts come from `GET /quickbooks/lists`. On a phone the tab list scrolls inside itself; the page never scrolls sideways
  at 375 px.

### 3.3 Name tabs

- Search box (URL `?q=`, debounced 200 ms, case-insensitive "contains"), shared by the three tabs; the line under the
  table reads "Showing 4 of 15 vendors".
- **Accounts**: table with **Name** and **Type**. Names are QuickBooks full names, so sub-accounts read
  "Utilities:Electric"; shown as sent. Type is the QuickBooks `AccountType` made readable ("Bank", "OtherCurrentAsset" →
  "Other current asset"); `null` shows "—". A **Type** filter (native select, URL `?type=`) lists the types present.
- **Vendors**, **Customers**: one-column table of names.
- Sorted by name (`localeCompare`, base sensitivity). No paging: lists are a few hundred names (measured: 71 accounts,
  282 vendors on the test company); render all rows.
- The data is the same endpoint the pickers use, read through a second hook that keeps account types
  (`useQbListsDetail`, 3.6).

States:

| State | What shows |
|---|---|
| Loading | `TableSkeleton` |
| Lists query failed, nothing cached | `ProblemAlert` with **Try again**; the status in the header says "QuickBooks lists unavailable" and still offers Sync now |
| Never synced (`syncedUtc` null, empty lists) | `EmptyState` "No QuickBooks lists yet" — editors: "Press Sync now while QuickBooks is open."; viewers: "Ask an editor to sync them." |
| A list is empty but others are not | `EmptyState` "QuickBooks has no active vendors" (per tab) |
| Search with no match | "No vendors match "acme"." with **Clear search** |

### 3.4 Sync history tab

Data: `GET /quickbooks/lists/syncs` (R-17), newest first, 25 per page (`Pager`, URL `?page=`).

Filters (URL-backed, like the Audit trail): **Started by** — All · Automatic (`schedule`) · Manual (`dashboard`,
`api`) · Imported (`import`); **Result** — All · Synced (`ok`) · Skipped · Failed.

Columns:

| Column | Content |
|---|---|
| When | `Timestamp` of `startedUtc` (exact local time in its tooltip) |
| Started by | "Automatic", the user's display name for `dashboard` ("Asha Kapoor"; "Sync now" if the API sent no name), "API" for `api`, "Imported from file" for `import` |
| Result | icon + word, never colour alone: ✓ **Synced** (success), ⏸ **Skipped** (warning), ✕ **Failed** (destructive); plus a small **In use** badge on the row whose lists are current (`current: true`) |
| Names | "19 accounts · 15 vendors · 6 customers" for `ok`; "—" otherwise |
| Took | `finishedUtc − startedUtc`: "0.4 s", "1 min 52 s" |
| Details | `message` (fixed, safe text from the API) |

States: loading `TableSkeleton`; error `ProblemAlert` with retry; no attempts at all "No syncs yet"; filters with no
match "No syncs match these filters" with **Clear filters**; `keepPreviousData` while paging. A `404` from the route
(an API without M15) shows "Sync history needs a newer API." instead of an error, and the name tabs keep working.

After **Sync now** (any outcome) and after each 504 re-read, the history query is invalidated so the new attempt
appears at the top without a reload.

### 3.5 Roles

| Role | Sidebar item | Name tabs | History | Sync now |
|---|---|---|---|---|
| Viewer | yes | yes | yes | no |
| Editor | yes | yes | yes | yes |
| Admin | yes | yes | yes | yes |

The API enforces this (`lists:read` for both GETs, `requests:edit` for the sync).

### 3.6 Data

- **Names with types**: `useQbListsDetail()` → `GET /quickbooks/lists`, key `['quickbooks', 'lists']`, returns the raw
  `QbListsResponse` (accounts keep `type`). The pickers' `useQbLists` shares that query and uses `select: toQbLists`
  (names only). `useSyncQbLists.onSuccess` writes the 200 body there; `onError` refetches it with `exact: true`; both
  outcomes invalidate `['quickbooks', 'lists', 'syncs']`.
- **History**: `useQbListSyncs(filters)` → `GET /quickbooks/lists/syncs?trigger=…&outcome=…&page=…&pageSize=25`,
  key `['quickbooks', 'lists', 'syncs', filters]`, `keepPreviousData`, `staleTime` 30 s.
- New types in `schema.ts` (R-17):

```ts
/** One QuickBooks list sync attempt in the history (R-17). */
export interface QbListSyncRun extends QbListSync {
  id: number
  /** Names stored by this attempt; null unless outcome is ok. */
  counts: QbListCounts | null
  /** True on the attempt whose lists are in use (the newest ok). */
  current: boolean
}
// GET /quickbooks/lists/syncs → Page<QbListSyncRun>
```

### 3.7 Fake API

- `mockDb.listSyncs`: history, newest first, seeded at reset with a realistic day: the current `ok` schedule attempt
  (12 min ago, matching `buildQbLists`), a `skipped quickbooks-not-open` schedule attempt, an `ok` dashboard sync by
  Asha, a `failed quickbooks-busy` attempt, and an `import` row at the start.
- Every `POST /quickbooks/lists/sync` in the fake (ok, skipped, failed) adds a row and moves `current`.
- `GET /quickbooks/lists/syncs`: scope `lists:read`; filters `trigger` and `outcome` (comma-separated, values as R-17),
  `page`, `pageSize` (1–100, default 25); unknown values → `400` problem, as the real route.

### 3.8 The Docker test stack

The simulated QuickBooks company is seeded from `docker/seed/qb-lists.json` by the API (M15 T-1503), so Sync now and
the automatic sync return the seeded names instead of empty lists. After that ships, `docker-compose.integration.yml`
turns the 30-minute schedule back on (the `IntervalMinutes: "0"` stopgap from 2026-10-30 is removed) and the README
note about Sync now emptying the lists is removed.

## 4. Acceptance criteria

1. Every role sees **Lists** in the sidebar; it opens `/lists` with the breadcrumb "QuickBooks lists"; Ctrl K finds it.
2. The Accounts tab shows every account name with a readable type; the Vendors and Customers tabs show every name;
   tab labels carry the counts; search filters the open tab and survives a reload (URL).
3. An editor sees **Sync now** in the page header; after a sync the counts, the name tabs and the history update
   without a reload; a viewer sees no button.
4. Sync history lists automatic, manual (dashboard and API) and import attempts newest first, with who, result (icon +
   word), names, duration and message; the current lists' attempt carries **In use**; filters and paging work and live
   in the URL.
5. With QuickBooks not open (fake), Sync now adds a **Skipped** row at the top with the API's message.
6. Never-synced, empty, error and no-match states render as in 3.3 and 3.4; a `404` history route degrades as in 3.4.
7. No sideways scroll at 375 px; status is never colour alone.
8. `npm run lint`, `npm run build`, `npm test` green; `e2e-integration/lists-page.spec.ts` passes against the Docker
   stack: open Lists → see the seeded names → Sync now → a new **Synced** row by the user, with the same counts
   (needs API M15 T-1503).

## 5. As built (2026-10-30)

Where the build differs from, or settles, the text above.

- **Files**: `src/features/lists/{ListsPage,NamesTable,SyncHistory}.tsx`, pure helpers in `qbListsView.ts`
  (`accountTypeLabel`, `filterNames`, `startedByLabel`, `outcomeView`, `durationText`, `countsText`, `syncFiltersFrom`);
  hooks `useQbListsDetail`, `useQbListSyncs` and the `listKeys.syncs` keys in `api/queries/lists.ts`.
- **Type filter** is a `FilterChip` (the house filter used on the Audit trail and Statements), not a native select.
  URL keys: `tab` (omitted for Accounts), `q`, `type`, `by` (`automatic|manual|imported`), `result` (`ok|skipped|failed`),
  `page`.
- **Search** is shared by the three name tabs (one `q`), so a search stays applied when switching tabs.
- **Clear filters** for the history lives in its filter row only; the "No syncs match these filters" state points to it
  rather than repeating the button.
- **Result badges**: Synced (`CheckCircle2Icon`, success), Skipped (`CirclePauseIcon`, warning), Failed
  (`CircleXIcon`, danger); **In use** is a `brand` badge.
- **Sync now** settles by re-reading the history (any outcome); a failure also re-reads the lists. Each 504 re-read
  refetches the lists (`exact`) and invalidates the history, so only history pages on screen are read again.
- **Fake API**: accounts carry types (`ACCOUNT_TYPES` in `mocks/fixtures/lists.ts`); `mockDb.listSyncs` is seeded with six
  attempts (current schedule ok, skipped not-open, failed busy, Eli Editor's Sync now, an older schedule ok, the import);
  every fake sync attempt is recorded through one `record()` that sets `lastSync` and moves `current` on ok.

## 6. Review fixes (2026-10-30, built)

Full list: section 7 of `2026-10-29-qb-list-sync-spec.md`. Sections 3.3, 3.6 and 5 above now match these changes:

- **One lists query (#10)**: `useQbListsDetail` and `useQbLists` send the same GET under two keys, so the Lists page
  doubles every load, focus refetch and 504 re-read, and the two copies can disagree. `listKeys.detail` goes away.
  `listKeys.qb` holds the raw `QbListsResponse`; `useQbListsDetail` reads it as is and `useQbLists` uses
  `select: toQbLists` (a stable function, so the result is memoised). The history key still sits under that prefix, so
  list refetches use `exact: true` and the history is invalidated once, separately, which re-reads only pages on
  screen. The pickers still receive names only.
- **Query failed (#2)**: the state table's "Lists query failed" row applies only when there is no cached data.
