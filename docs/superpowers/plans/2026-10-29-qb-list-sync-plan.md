# Plan: QuickBooks lists status and "Sync now"

Spec: `docs/superpowers/specs/2026-10-29-qb-list-sync-spec.md` · Requirement: R-16 · API: M14 in the API project
(`docs/qb-list-sync-m14.md`). The real route exists only after M14 T-1407; until then the fake API carries it.

## Files

| File | Change | Task |
|---|---|---|
| `docs/api-requirements-for-dashboard.md` | R-16 item, Tracker row, "APIs the dashboard needs built" row, Changelog line | 1 |
| `src/api/schema.ts` | `QbListSync`, `QbListsResponse.lastSync`/`nextSyncUtc`, `QbListsSyncResponse` (adds `counts`) | 2 |
| `src/api/queries/lists.ts` | `toQbLists` keeps `lastSync`, `nextSyncUtc`, counts; `useSyncQbLists()` mutation (sets the cache on 200, invalidates otherwise) | 2 |
| `src/mocks/db.ts`, `src/mocks/fixtures/lists.ts`, `src/mocks/handlers/support.ts` | `lastSync`, `nextSyncUtc`; `POST /quickbooks/lists/sync`; `mockControl.qbNotOpen`, `qbDown` | 3 |
| `src/mocks/handlers/support.test.ts` (new) | GET shape; POST scopes (viewer 403); 409 and 503 controls | 3 |
| `src/features/requests/transactions/QbListsStatus.tsx` (new) | status text per state, tooltip, Sync now (scope-gated), toasts | 4 |
| `src/features/requests/transactions/QbListsStatus.test.tsx` (new) | every row of spec §3.1 and §3.2 | 4 |
| `src/features/requests/transactions/qbListsSync.ts`, `qbListsSync.test.ts` (new, added during the build) | pure helpers: age text, status view, toast texts, failure mapping | 4 |
| `src/features/requests/transactions/TransactionsTab.tsx` | render `QbListsStatus` in the line under the table when editable | 5 |
| `src/features/statements/upload/ReviewEditor.tsx` | render `QbListsStatus` | 5 |
| `src/features/requests/transactions/TransactionsTab.test.tsx` | flag disappears after a sync; draft kept | 5 |
| `e2e-integration/lists-sync.spec.ts` (new) | Sync now against the real API (simulated QuickBooks) | 6 |

## Tasks

| # | Task | Depends on | Expected outcome |
|---|---|---|---|
| 1 | R-16 in the requirements doc | — | Doc only |
| 2 | Types, query mapping, `useSyncQbLists` | 1 | `npm run build` green |
| 3 | Fake API | 2 | New handler tests red, then green |
| 4 | `QbListsStatus` component | 2, 3 | Component tests red, then green (loading, never, fresh, failed, unavailable; viewer no button; 200/409/503/429 toasts) |
| 5 | Wire into the statement rows editor and upload review | 4 | Tab test: flagged payee unflagged after sync, edits kept |
| 6 | Integration e2e | 5, API M14 T-1407 | Passes against `docker-compose.integration.yml` (API rebuilt from M14) |
| 7 | Record results, tick milestones, update the spec where the build differed | 1–6 | Docs match the code |

## Verification

```
npm run lint
npm run build
npm test
npx vitest run src/features/requests/transactions/QbListsStatus.test.tsx src/mocks/handlers/support.test.ts
docker compose -f docker-compose.integration.yml up -d --build
npx playwright test -c playwright.integration.config.ts e2e-integration/lists-sync.spec.ts
```

## Milestones

- [x] 1 R-16 documented (2026-10-29, with the spec)
- [x] 2 types and query
- [x] 3 fake API
- [x] 4 status component
- [x] 5 wired into both editors
- [x] 6 integration e2e (API M14 image built from `D:\qb_post-issue-2`, branch `feature/m14-qb-list-sync`)
- [x] 7 results recorded

## Results

Run 2026-10-30 on Windows, Node via npm, in `D:\qb_post_react`. Nothing was committed.

**Red then green.** The handler tests (`support.test.ts`) and the component tests were written before the code; the
two wiring tests (`TransactionsTab.test.tsx` "QuickBooks lists sync", `UploadPage.test.tsx` "QuickBooks lists") were run
red before the wiring and green after. The handler and component tests were written in the same pass as their
implementation and were first run green; I did not capture a red run for them.

**Tests added (51)**: `src/mocks/handlers/support.test.ts` 8, `qbListsSync.test.ts` 24, `QbListsStatus.test.tsx` 16,
`TransactionsTab.test.tsx` +2, `UploadPage.test.tsx` +1.

```
npx vitest run src/mocks/handlers/support.test.ts                       -> 1 file, 8 passed
npx vitest run QbListsStatus.test.tsx qbListsSync.test.ts               -> 2 files, 40 passed
npx vitest run TransactionsTab.test.tsx UploadPage.test.tsx             -> 2 files, 25 passed
npm run lint                                                            -> no output (clean)
npm run build                                                           -> tsc -b clean; "built in 15.26s" (existing >500 kB chunk warning)
npx playwright test -c playwright.integration.config.ts e2e-integration/lists-sync.spec.ts
                                                                        -> 1 passed (8.5s) against the Docker stack
```

**Full suite (`npm test`)** was not reliably green on this machine:

- First run (after tasks 2 to 5): 2 failed, 550 passed (552). One was `StatementPage.test.tsx` "Add transaction
  dialog ..." (a 5 s timeout, the known load flake; the file passes alone, 36/36). The second file was not captured.
- A later run while Docker and a build were still busy: 12 files / 20 tests failed, 532 passed. Failures were 5 s
  timeouts and 1 s `findBy` timeouts in files this change does not touch (auth, account, users, audit, dialogs,
  posting, statement sheet), plus `StatementPage`, `TransactionsEdit` and my own wiring test under load.
- `npx vitest run --maxWorkers=3` (the same suite, less contention): **1 failed, 551 passed (552)**, 53 files, 219 s.
  The one failure is `src/auth/auth.test.tsx` > "session restore and guards > valid refresh cookie signs in without
  showing the form" (1.3 s against the 1 s `findByRole` limit). It passes alone with `-t` and fails whenever the whole
  file runs; it opens `/requests` and does not render the lists status. I did not establish whether it also fails
  without this change (no clean checkout was available, and the tree holds other uncommitted work).

So: lint and build pass; the suite passes except for load-sensitive timeouts and that one auth test, which should be
looked at before the commit.

**Task 6.** `docker compose -f docker-compose.integration.yml up -d --build` built the API from `../qb_post-issue-2`
(the simulated QuickBooks, always open) and came up healthy. `lists-sync.spec.ts` signs in as the admin, opens a seeded
statement, sees the status line, presses Sync now, sees "QuickBooks lists synced: N accounts, N vendors, N customers"
and "Lists synced just now", with no page errors or 5xx. The stack was then stopped with `docker compose ... down` (no
`-v`; the volume is kept).

**Deferred**: an e2e against the real API for the 409 and 503 paths (the simulated QuickBooks is always open); a
Playwright check of the fake-API dev mode (`npm run e2e`) was not run.

**Review fixes (2026-10-30)**: the 504 follow-up now re-reads at 15/45/90/150 s with timers in a ref (cleared on
unmount, replaced by a new 504, stopped once `lastSync.finishedUtc` is newer than at the press); only `409
quickbooks-not-open` is the not-open warning; the native `title` is gone (exact time moved into the tooltip) and the
status text is `role="status"` `aria-live="polite"`. Verified: `QbListsStatus.test.tsx`, `qbListsSync.test.ts`,
`TransactionsTab.test.tsx`, `UploadPage.test.tsx`, `support.test.ts` -> 5 files, 78 passed; `npm run lint` clean;
`npm run build` passes. The new fake-timer 504 tests fail (3 of 4) when the `stillRunning` branch is removed (the
unmount test passes trivially without it, by design).

**Last round (2026-10-30)**: spec wording fixed (tooltip shows the exact time; 409 only with type `quickbooks-not-open`); each set of recheck timers has a token so an old set's callback cancels only its own set; a successful sync cancels pending re-reads; the no-stacking test now advances 400 s and expects exactly 4 re-reads for the second set (12 vs 8 fails when the `cancelRechecks()` before scheduling is removed; restored); the unmount test asserts `vi.getTimerCount() > 0` before unmounting (an exact timer count was not usable: other libraries' timers are faked too). `QbListsStatus.test.tsx` + `qbListsSync.test.ts`: 45 passed; lint clean; build passes.

## Review fixes round 2 (2026-10-30, built)

Spec: section 7 of `2026-10-29-qb-list-sync-spec.md`, section 6 of the Lists page spec, section "Review fixes" of the
v2 pages spec. Each task writes or changes its test first and sees it fail.

### Files

| File | Change | Task |
|---|---|---|
| `src/api/queries/lists.ts`, `lists.test.tsx` | one raw query with `select` (#10); `cancelQueries` (#8); `mutationKey`; re-read timers per client (#1, #7) | 1, 2 |
| `src/features/requests/transactions/QbListsStatus.tsx`, `.test.tsx` | post-504 baseline; `useIsMutating`; hidden live region; `!data` check (#1, #2, #7, #9) | 2, 3, 4 |
| `src/features/lists/ListsPage.tsx`, `ListsPage.test.tsx` | error state only without data (#2) | 3 |
| `src/features/requests/transactions/qbListsSync.ts`, `.test.ts` | dated text, skipped wording and style, `announcement` (#4, #5, #9) | 4 |
| `src/features/requests/transactions/findings.ts` + test, `TransactionsTab.tsx`, `TransactionsTab.test.tsx` | `dropResolvedFindings` (#3) | 5 |
| `src/features/audit/AuditTable.tsx` + test | `request-edited` old → new, `edit` tone (#6) | 6 |
| the spec and plan docs | as built, results | 7 |

### Tasks

| # | Task | Depends on | Expected outcome |
|---|---|---|---|
| 1 | #10 and #8: raw response at `listKeys.qb`, `useQbLists` selects with `toQbLists`, `listKeys.detail` removed; exact refetch of lists, history invalidated separately; cancel before writing | — | Lists page sends one GET per load; stale in-flight GET test passes |
| 2 | #1 and #7: move timers out, post-504 baseline, `mutationKey` and `useIsMutating` | 1 | The unmount test is **reversed** (re-reads continue); new remount and baseline tests pass |
| 3 | #2: `!data` checks in the status and on the Lists page | 1 | Failed refetch keeps tables and status |
| 4 | #4, #5, #9: `listsStatus` text and live region | 3 | Updated regexes and "skipped" expectations in `qbListsSync.test.ts` and `QbListsStatus.test.tsx` pass |
| 5 | #3: `dropResolvedFindings`, reading `TxTable`'s match first so the rule is the same | 1 | Unit tests for both reasons, deposit pool, other reasons kept, no lists; tab test leaves "Has a problem" |
| 6 | #6: `request-edited` in `Change` and `TONE` | — | Test shows `reference` with old and new |
| 7 | Rewrite 3.1, 3.2 and 6 of the sync spec and 3.6 and 5 of the Lists page spec to match; record results | 1–6 | Docs match the code |

### Verification

```
npx vitest run src/api/queries/lists.test.tsx src/features/requests/transactions src/features/lists src/features/audit
npm run lint
npm run build
npm test
npx playwright test -c playwright.integration.config.ts e2e-integration/lists-sync.spec.ts e2e-integration/lists-page.spec.ts
```

The integration e2e needs the Docker stack; it checks the "Lists synced just now" text path, which does not change.

### Milestones

- [x] 1 one lists query, cancel on success (#10, #8)
- [x] 2 re-reads and Syncing outlive the page, fresh baseline (#1, #7)
- [x] 3 failed refetch keeps data (#2)
- [x] 4 status text and live region (#4, #5, #9)
- [x] 5 resolved findings hidden (#3)
- [x] 6 audit diff (#6)
- [x] 7 docs and results

### Results

Run 2026-10-30 on Windows in `D:\qb_post_react`. Nothing was committed.

Tests were written first in one pass and run before any production change: 7 files failed, each new test for missing
behaviour or for visible text still in the live region. After the code, the only failure was a test fixture: its value
also appeared in the statement link on the row, so the test now uses `old-ref` / `new-ref`.

```
npm run lint                                  -> clean
npm run build                                 -> tsc -b clean; built in 8.52s (existing >500 kB chunk warning)
npm test -- --maxWorkers=3                    -> Test Files 59 passed (59), 141.77 s
npm run e2e                                   -> 5 passed
docker compose -f docker-compose.integration.yml up -d --build   -> api and web rebuilt, healthy
npx playwright test -c playwright.integration.config.ts e2e-integration/lists-sync.spec.ts e2e-integration/lists-page.spec.ts
                                              -> 2 passed
```

Plan deviations: `e2e-integration/lists-sync.spec.ts` needed `.last()` (the hidden region also matches its regex). The
remaining integration specs were not run, and the Docker stack was left running, as it was found. Not covered by an e2e:
the 504 paths and the skipped status against the real API (the simulated QuickBooks is always open).
