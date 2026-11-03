# Spec: QuickBooks lists status and "Sync now"

**Date**: 2026-10-29 · **Status**: built (see section 6, "As built") · **Requirement**: R-16 in `docs/api-requirements-for-dashboard.md`
**API side**: `D:\qb_post-issue-2\docs\qb-list-sync-m14.md` (M14: lists in PostgreSQL, scheduled sync every 30 minutes
on the API's job worker, `POST /api/v2/quickbooks/lists/sync`).
**Found in**: issue #6, comment 5, gap A: after someone adds an account, vendor or customer in QuickBooks, the review
grid keeps flagging it "not in QuickBooks" until an operator with an API key runs the v1 sync. The dashboard cannot
start a sync and does not say how old the lists are.

## 1. Goal and scope

Where the accountant edits rows against QuickBooks names, show **how fresh the lists are** and let editors and admins
**sync them now**. The API also syncs on its own every 30 minutes (no dashboard work for that beyond showing it).

In scope: the statement page's rows editor and the upload review editor; the lists query; the fake API.
Out of scope: a settings page for the schedule, a sync history page, showing `missingInRules`, Home.

## 2. What it touches (read from the code)

- `src/api/queries/lists.ts`: `useQbLists` (`GET /quickbooks/lists`, `staleTime` 5 min, `toQbLists` keeps names).
- `src/api/schema.ts`: `QbLists`, `QbListsResponse`.
- `src/features/requests/transactions/TransactionsTab.tsx` (`TableEditor`): lists loaded only when `editable`; the
  line under the table ("Showing … rows" · "Click any cell to edit it…").
- `src/features/statements/upload/ReviewEditor.tsx`: `useQbLists()`; the `toolbar` of its table.
- `src/features/requests/transactions/TxTable.tsx`: the "not in QuickBooks" flag (exact, case-sensitive match).
- `src/auth/useSession.ts`: `hasScope(me, scope)`.
- `src/mocks/handlers/support.ts` (GET lists), `src/mocks/db.ts` (`mockDb.lists`, `mockControl`).
- Toasts: `sonner`, as in `DiscardDialog`.

## 3. Behaviour

### 3.1 Status line (`QbListsStatus`)

Placed in the line under the table on the statement page (only when the rows are editable, which is when lists load
today) and in the upload review editor, at the right end, before the edit hint.

| State | Text | Style |
|---|---|---|
| Loading | "QuickBooks lists…" | muted |
| Never synced (`syncedUtc` null) | "QuickBooks lists never synced" | warning |
| Fresh, last attempt ok | "Lists synced 12 min ago" (relative time; the tooltip shows the exact local time) | muted |
| Last attempt failed, older lists in use | "Lists from 14:30 · last sync failed" (with the date when not from today) | warning; tooltip shows `lastSync.message` and the attempt time |
| Last attempt skipped, older lists in use | "Lists from 14:30 · last sync skipped" (with the date when not from today) | muted; tooltip as above |
| Lists query failed, nothing cached | "QuickBooks lists unavailable" | warning; the grid works without flags, as today |

Tooltip (all states with data): counts ("71 accounts · 282 vendors · 6 customers") and, when `nextSyncUtc` is set,
"Next automatic sync at 15:30".

Relative time re-renders each minute while mounted (no extra request).

### 3.2 Sync now

- A small ghost button **Sync now** next to the status, shown only with `hasScope(me, 'requests:edit')` (editors and
  admins). Viewers see the status only.
- Click → `POST /quickbooks/lists/sync` (no body). While waiting: the button shows a spinner and "Syncing…", disabled;
  the grid stays usable. The request can take up to about 2 minutes (QuickBooks dialogs); no client timeout shorter
  than the API's 120 s.
- **200**: in-flight list GETs are cancelled and the response body replaces the lists cache, so
  "not in QuickBooks" flags update at once; toast "QuickBooks lists synced: 71 accounts, 282 vendors, 6 customers".
- **409 `quickbooks-not-open`**: toast (warning) "QuickBooks isn't open. Open the company file in QuickBooks, then sync
  again."; then refetch the lists (the attempt is now `lastSync`).
- **503 / 502 / 504 / 500**: toast (error) with the problem's `title` (`detail` is fixed, safe text; codes are in
  `type`: `quickbooks-unavailable`, `quickbooks-busy`, `qb-status`, `sync-timeout`, `api-stopping`); refetch the lists.
  For `504 sync-timeout` the toast says the sync is still running and the status will update.
- **Joined runs** (API M14 as built): the 200 or 409 can belong to a run someone else started (the schedule or another
  editor). Show the toast from the answer, but don't say "you synced"; use `lastSync.requestedBy` only to name who.
- **429**: toast "Too many syncs; try again in a minute."
- **403**: should not happen (button hidden); toast the problem title.
- The draft (unsaved edits) is never touched by a sync.

### 3.3 Data

`QbListsResponse` gains (R-16):

```ts
lastSync: {
  trigger: 'schedule' | 'dashboard' | 'api' | 'import'
  outcome: 'ok' | 'failed' | 'skipped'
  reason: string | null
  startedUtc: string
  finishedUtc: string
  requestedBy: { id: string; displayName: string } | null
  message: string
} | null
nextSyncUtc: string | null
```

The sync answer is the same shape plus `counts: { accounts, vendors, customers }`. `QbLists` (what the pickers use)
keeps names only; the status reads the extra fields from the same query (`toQbLists` keeps `lastSync`, `nextSyncUtc`
and the counts it derives from the arrays).

### 3.4 Fake API

- `GET /quickbooks/lists` adds `lastSync` (default: an `ok` `schedule` attempt 12 minutes ago) and `nextSyncUtc`.
- `POST /quickbooks/lists/sync`: scope `requests:edit`; 800 ms delay; sets `syncedUtc` and `lastSync` to now
  (`dashboard`, current user); answers the R-16 shape.
- `mockControl.qbNotOpen` → 409 `quickbooks-not-open` and a `skipped` `lastSync`; `mockControl.qbDown` → 503.

## 4. Roles

| Role | Status line | Sync now |
|---|---|---|
| Viewer | upload review: yes; statement page: no (viewers never get edit, and the status shows only in edit mode) | no |
| Editor | yes | yes |
| Admin | yes | yes |

## 5. Acceptance criteria

1. An editor on a statement in edit mode sees "Lists synced N min ago" and **Sync now**; a viewer sees no button.
2. Sync now → spinner → toast with counts; a payee that was flagged "not in QuickBooks" and is in the new lists is no
   longer flagged, without reloading the page; unsaved edits are kept.
3. With QuickBooks not open (fake): warning toast; the status shows "last sync skipped" with the API's message in the tooltip.
4. `syncedUtc` null → "QuickBooks lists never synced".
5. The upload review editor shows the same status and button.
6. `npm run lint`, `npm run build`, `npm test` green; the integration e2e (`e2e-integration/`) clicks Sync now against
   the real API with the simulated QuickBooks.

## 6. As built (2026-10-29)

Where the build differs from, or settles, the text above.

- **Files**: `QbListsStatus.tsx` (component), `qbListsSync.ts` (pure helpers: age text, status view, toast texts,
  failure mapping; unit-tested in `qbListsSync.test.ts`), `useSyncQbLists` in `api/queries/lists.ts`.
- **Age text** is "just now", "N min ago", "N h ago", "N d ago" (own formatter, not `formatRelative`, so it reads "min").
  A sync answer sets the lists cache, so the status reads "Lists synced just now" straight after.
- **Accessibility**: one always-mounted `sr-only` `role="status"` `aria-live="polite"` region carries `announcement` (7.2), so the aging visible text is not live; there is no native `title` (the tooltip
  carries the exact time as "Lists from yyyy-MM-dd HH:mm"); the trigger keeps `tabIndex=0` so keyboard users can open
  the tooltip, and Radix sets `aria-describedby` while it is open.
- **Tooltip** (hover or keyboard focus on the status): counts (`counts` is derived from the arrays by `toQbLists`),
  for a failed or skipped attempt "`lastSync.message` Attempted at HH:mm.", and "Next automatic sync at HH:mm".
- **Sync now is also shown when the lists query failed** ("QuickBooks lists unavailable"), because a sync can repair
  that. It stays hidden from users without `requests:edit`.
- **Where it sits**: in the line under the table on the statement page (editable only), and in the review editor's
  toolbar, left of Add row. The review editor shows it only when the PDF produced rows (the empty state has no table
  toolbar).
- **Failures**: any failed sync re-reads the lists (not only the codes listed in 3.2), so the status always shows the
  attempt the API recorded. Mapping, by status then problem `type`: `409` with `type` `quickbooks-not-open` warning "QuickBooks
  isn't open. Open the company file in QuickBooks, then sync again."; `429` warning; `504` / `sync-timeout` warning
  "The sync is still running in QuickBooks; the status will update when it finishes." and re-reads of the lists 15, 45,
  90 and 150 s after the 504, stopping early once `lastSync.finishedUtc` is newer than in the read just after the 504
  (timers live in `api/queries/lists.ts`, one set per `QueryClient`, replaced by a new 504, stopped by a successful sync,
  and they outlive the page); only a `409` with `type` `quickbooks-not-open` is the not-open
  warning, any other 409 is a generic error toast; every
  other problem (`503 quickbooks-unavailable|quickbooks-busy|api-stopping`, `502 qb-status`, `500`, `403`) an error
  toast with the problem `title`; a non-problem failure (network) "Could not reach the server. Try again.".
- **Joined runs**: the 200 toast is "QuickBooks lists synced: 71 accounts, 282 vendors, 6 customers", with " by the
  automatic sync" inserted when `lastSync.trigger` is `schedule` and " by <displayName>" when `requestedBy` is another
  user. A joined skipped schedule answers 409 and is handled as any 409.
- **Fake API** (`src/mocks/handlers/support.ts`): problems for this route use the bare string in `type` (no URL, no
  `code` field), as the real API does; `detail` is the real fixed text. Default lists: an `ok` `schedule` attempt 12
  minutes ago, next sync in 18 minutes (built at reset by `buildQbLists`). Skipped and failed attempts are recorded in
  `lastSync` (requestedBy = the caller), the lists are kept. Extra controls: `mockControl.qbAdded` (names "added in
  QuickBooks"; the next successful sync appends them, which is how tests show a flag disappearing) and
  `mockControl.syncDelayMs` (800 ms, 0 under vitest). `mockControl.qbNotOpen` and `qbDown` as specified. Joined runs,
  429 and 504 are not modelled by the fake; tests override the route with `server.use` for those.

## 7. Review fixes (2026-10-30, built)

Ten findings from a code review of the uncommitted R-16 / R-17 work, approved by the owner with both open decisions
(#5 skipped wording, #3 Results tab) as written here. Each was checked against the code; the API repo
(`D:\qb_post-issue-2`) was read for #3 and #6. Plan: section "Review fixes round 2" of the plan. Sections 3.1, 3.2, 5
and 6 above now match this section. The Lists page spec (`2026-10-30-qb-lists-page-spec.md`, section 6) carries the
data change, and the v2 pages spec the audit change.

Settled while building:

- **#1**: `useSyncQbLists.onError` returns the list refetch, so the mutation waits for it and `startQbListRechecks`
  simply reads the cache as its baseline. The refetch also covers an unmounted page, which `invalidateQueries` would not.
- **#3**: an `unknown-account` finding does not say which field it means, so it is dropped only when **both** `account`
  and `lineAccount` (when set) are in the lists. A row with neither keeps it.
- **#9**: tests and e2e that look for the visible text must skip the hidden region when both can say the same words
  (`ignore` in `QbListsStatus.test.tsx`, `.last()` in `e2e-integration/lists-sync.spec.ts`).

### 7.1 Sync and re-read behaviour

| # | Problem | Fix |
|---|---|---|
| 1 | The 504 baseline is read from the cache at the press and can be 5+ min old, so an unrelated newer attempt (the schedule) stops the re-reads while the real sync still runs | Take the baseline from a fresh read **after the 504**: re-read the lists once, keep that `lastSync.finishedUtc`, then schedule. The sync is still running at that point, so the read cannot be its result. If it finished in between, the read already carries its lists, and the remaining re-reads are only spare. If the read fails, the cached value is the baseline |
| 7 | Re-reads and the Syncing state die with the component: leaving the page drops the re-reads, and coming back mid-sync re-enables Sync now, which can send a second POST | Re-read timers move out of the component into `api/queries/lists.ts`, one set per `QueryClient`. They survive navigation and end by themselves after 150 s; a sign-out clears the query cache, so a late timer finds nothing to read. `useSyncQbLists` gets a `mutationKey`; the button reads `useIsMutating`, so any mounted status shows Syncing… and stays disabled. **This reverses "cleared on unmount" in section 6** |
| 8 | `onSuccess` does not cancel in-flight GETs, so a GET started before the sync finished can restore the old lists | `await cancelQueries` for the lists key before writing the answer to the cache |
| 2 | React Query keeps `data` when a refetch fails, yet a failed background refetch shows "QuickBooks lists unavailable" and the Lists page swaps its tables for an error | "Unavailable" and the error state need `isError` **and** no `data`. Cached lists stay on screen; their age is still shown |

### 7.2 Status line

| # | Problem | Fix |
|---|---|---|
| 4 | "Lists from 17:30" gives no date, so Friday's lists look like today's on Monday | Lists from the same local day as `now` keep "HH:mm"; any other day uses `formatTimestamp` ("Lists from 2026-10-30 17:30"). The tooltip's "Attempted at" follows the same rule. "Next automatic sync at" is unchanged |
| 5 | A `skipped` attempt reads "last sync failed" in warning style, every 30 minutes all night with QuickBooks closed, and contradicts the **Skipped** badge on the Lists page | `skipped` reads "Lists from 17:30 · last sync skipped", **muted, no warning icon**; the tooltip keeps the message. `failed` stays "last sync failed" with the warning. "Never synced" stays a warning. Replaces the "failed or skipped" row of 3.1 and amends criterion 3 of section 5 |
| 9 | The aging text sits in the live region, so screen readers announce it every minute | One always-mounted visually hidden `role="status"` region carries a new `announcement` from `listsStatus`: "QuickBooks lists synced" when fresh, otherwise the status text (which no longer ages). The visible text is no longer live. Loading and unavailable use the same region |

Accessibility note: a second successful sync does not change the region's text, so it is not re-announced there. The
sonner toast announces it.

### 7.3 Findings left behind by a sync (#3)

**Checked**: the validation snapshot is stored by the API and rewritten only by Validate, save or Post (API docs
`saved-requests-postgres.md` 6.4: "advisory ... Post always re-validates"). Refetching the statement after a sync would
return the same stale findings, so invalidating `requestKeys` is not a fix. Today the chip clears but the row keeps its
finding and stays under "Has a problem".

**Fix (display only)**: a pure `dropResolvedFindings(rows, findings, lists)` in `findings.ts`, applied in
`TransactionsTab` before `findingsByRow`. It removes `unknown-account` and `unknown-payee` findings whose name on the
row is now in the lists, using the same exact-match rule and pool (customers for deposits, otherwise vendors) as the
`TxTable` chip. Other reasons are never removed. Without loaded lists nothing is removed. Nothing is written and no
validation runs, so there is no audit entry, the draft is untouched, and Post still re-validates on the server.

The Results tab keeps showing the stored snapshot until the next Validate, because it is the record of that run.

### 7.4 Acceptance criteria

1. After a 504 with a schedule attempt newer than the cache, re-reads continue until an attempt newer than the post-504 read.
2. After a 504, leaving the page does not stop the re-reads; returning during a sync shows a disabled Syncing… and sends no second POST.
3. A list GET still in flight when the sync answers cannot replace the fresh lists.
4. A failed background refetch with cached lists keeps the status and the Lists page tables.
5. Lists from an earlier day show their date; lists from today show the time.
6. A skipped attempt reads "last sync skipped" without warning style; a failed one reads "last sync failed" with it.
7. Minute ticks change nothing in the live region.
8. After a sync adds a name, its row loses the chip and the finding and leaves "Has a problem"; other findings on the row stay.
9. `npm run lint`, `npm run build`, `npm test` pass, or failures are reported as they are.
