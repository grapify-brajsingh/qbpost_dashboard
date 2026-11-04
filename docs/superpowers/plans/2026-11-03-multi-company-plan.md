# Plan: Multiple company files (sidebar "Companies")

**Spec**: `docs/superpowers/specs/2026-11-03-multi-company-spec.md` · **Requirements**: R-18, R-19, R-20
**API side**: `D:\qbautopost\qb_post\docs\multi-company-m17-plan.md` (T-1700…T-1715). The dashboard is built against
the fake API first; the real-API check waits for API M17.
Step-by-step implementation plan: `docs/superpowers/plans/2026-11-03-multi-company-implementation-plan.md`.
Branch: `feature/9-addition-of-company-file`.

## 1. Files

| File | Change | Task |
|---|---|---|
| `docs/api-requirements-for-dashboard.md` | R-18…R-20, Tracker, "APIs the dashboard needs built", Changelog | 0 (done with the spec) |
| `src/api/schema.ts` | company types, `RequestSummary.company/companySource`, `Stats.needsCompany`, `Action 'set-company'`, `Extraction.company`, audit actions | 1 |
| `src/mocks/fixtures/companies.ts` | new: companies, scan results | 2 |
| `src/mocks/db.ts` | `companies`, `RequestRecord.companyId/companySource`, `ExtractionRecord.company`, per-company `lists`/`listSyncs`, `mockControl` flags | 2 |
| `src/mocks/handlers/companies.ts`, `handlers/index.ts` | new routes R-18 | 2 |
| `src/mocks/handlers/{requests,requestHelpers,extractions,support,dashboard,audit}.ts`, `fixtures/{requests,lists}.ts` | R-19/R-20 shapes, filters, `set-company`, 409s | 3 |
| `src/api/queries/companies.ts` | new hooks + `companyKeys` | 4 |
| `src/api/queries/{requests,lists,extractions,home}.ts` | `company` params and keys, `useSetCompany` | 4 |
| `src/features/companies/{CompaniesPage,CompaniesTable,AccessBadge,ApprovalHelp,MatchNamesDialog,ChooseFileDialog,companiesView}.tsx/ts` | new page | 5 |
| `src/router.tsx`, `src/layout/AppSidebar.tsx`, `src/layout/CommandMenu.tsx` | route, nav, Ctrl K | 5 |
| `src/components/CompanySelect.tsx` | shared company `Select` (used by Lists, Home, dialogs, upload) | 5 |
| `src/features/statements/list/{StatementsPage,StatementsToolbar,StatementsTable}.tsx` | filter chip, column | 6 |
| `src/features/statements/detail/{StatementPage,StatementHeader}.tsx`, `features/requests/dialogs/ChooseCompanyDialog.tsx`, `features/requests/detail/CompanyHoldBanner.tsx` | company meta, hold banner, dialog | 7 |
| `src/features/requests/transactions/{QbListsStatus,TransactionsTab,qbListsSync}.ts(x)` | company-scoped lists; `company-file-open-elsewhere` message | 7 |
| `src/features/statements/upload/ReviewEditor.tsx` (+ `CompanyBlock.tsx`) | match display and picker | 8 |
| `src/features/lists/ListsPage.tsx`, `SyncHistory.tsx` | company selector | 9 |
| `src/features/home/HomePage.tsx` | company selector | 9 |
| `src/features/audit/auditSentence.ts` | four new sentences | 9 |
| tests (colocated) | see §3 | each task |

## 2. Tasks

| # | Task | Depends on | Expected outcome |
|---|---|---|---|
| 0 | API requirements R-18…R-20 written | — | Done with the spec (2026-11-03) |
| 1 | Types in `schema.ts` | 0 | `npm run build` passes (type-only) |
| 2 | Fake companies API: fixtures, db, handlers (`GET /companies`, `POST /companies/scan`, `POST /companies/{id}/check`, `PATCH /companies/{id}`) with scopes, problems and audit events | 1 | Handler tests: scopes, root missing (503), open elsewhere (409), PATCH `If-Match` |
| 3 | Fake API for statements/extraction/lists/summary/audit: company fields, `company` filters, `needsCompany`, `set-company` + `POST /saved-requests/{id}/company`, 409 `company-required`, extraction `company` block via `mockControl.nextMatch`, per-company lists and syncs | 2 | Existing tests still pass (company-less answers stay valid); new handler tests |
| 4 | Query hooks and keys | 2, 3 | Unit tests for `listQuery` with `company`; key separation per company |
| 5 | Companies page, `CompanySelect`, route, sidebar, Ctrl K | 4 | `CompaniesPage.test.tsx`: roles, sync, empty/error states, approval help, check access messages, dialogs |
| 6 | Statements list column and filter | 4 | `StatementsPage` tests: `?company=440`, `company=none`, badge |
| 7 | Statement page: header meta, hold banner, Choose company dialog, company-scoped lists, wrong-file post message | 4 | `StatementPage` tests: hold → choose → validate visible; 412 handling; pickers disabled with no company |
| 8 | Upload review company block | 4, 5 | `UploadPage` tests: matched / ambiguous / none; save sends `companyId` |
| 9 | Lists page and Home selectors; audit sentences | 4, 5 | `ListsPage`, `HomePage`, `auditSentence` tests |
| 10 | Docs: tick milestones, Results, spec §5 As built; README/CLAUDE.md route list mentions `/companies` | 1–9 | Docs match code |
| 11 | Real-API check against API M17 (Docker integration stack) | API T-1712 | `npm run e2e:integration` (or manual run) recorded in Results |

## 3. Tests

- New: `features/companies/CompaniesPage.test.tsx`, `features/companies/companiesView.test.ts`,
  `mocks/handlers/companies.test.ts`, `features/statements/upload/CompanyBlock.test.tsx`,
  `features/requests/dialogs/ChooseCompanyDialog.test.tsx`.
- Changed: `StatementsPage.test.tsx`, `StatementPage.test.tsx`, `UploadPage.test.tsx`, `ListsPage.test.tsx`,
  `HomePage.test.tsx`, `auditSentence.test.ts`, `requests.test.ts` (query building).
- e2e: one Playwright flow on `dev:mock`: upload unmatched PDF → save → hold banner → choose company → validate.

## 4. Verification

```
npm run lint
npm run build
npm test
npm run e2e
```
Record real output in §6, including the known `StatementPage.test.tsx` timeouts if they occur.

## 5. Milestones

- [x] Spec, plan and R-18…R-20 written (2026-11-03)
- [x] Spec and plan approved by the owner (2026-11-04)
- [x] Tasks 1–3: types and fake API
- [x] Task 4: hooks
- [x] Task 5: Companies page
- [x] Tasks 6–8: statements, statement page, upload
- [x] Task 9: Lists, Home, audit
- [x] Task 10: docs as built
- [ ] Task 11: real API check. Static check against API M17 done 2026-11-04 (§6); the live Docker run is NOT done, so this stays open

## 6. Results

Run 2026-11-04 on the working tree (nothing committed; still so after the final review fixes below, `git log` head 513eb3f).

- `npm run lint`: no output (clean).
- `npm run build`: passes (`tsc -b` and `vite build`, built in 10.65 s). Only the existing chunk-size warning (`index-*.js` 1,026 kB).
- `npm test` (as `npx vitest run --reporter=dot`, run in the background; plain `npm test` hung with no output under load in earlier tasks, so it was not retried): **1 failed, 759 passed (760 tests); 66 of 67 files passed**, 127 s.
  - The failure was a 5 s timeout, not an assertion: `src/features/statements/detail/StatementPage.test.tsx > add and delete > Add transaction dialog appends a row tagged new with a dash- id; Delete opens the confirm that mentions Post` ("Test timed out in 5000ms"). This is the known full-suite-load flake documented in CLAUDE.md.
  - Rerun alone: `npx vitest run src/features/statements/detail/StatementPage.test.tsx`: **50/50 passed** (38 s).
  - So the full suite did not pass cleanly in one run; the only failure was that timeout, and the file passes alone.
  - Noise: the suite prints React "not wrapped in act(...)" warnings (Presence, Tooltip, TestComponent in `src/api/queries/lists.test.tsx`); no test fails from them.
- `npm run e2e`: **7 passed** (26.5 s), including both tests in `e2e/companies.spec.ts` (unmatched upload, choose the company, validate; Companies and Statements at 375 px).

**Deferred minors** (from the ledger; none blocks this change):
- Mock 500: `saveUpload` accepts an unknown or inactive `upload.companyId` (unknown throws 500; M17 wants 400 `invalid-request`). `companyGate` answers `company-required` for a dangling `companyId` where `company-not-ready` is more exact.
- Mock PATCH: `disabled` uses truthiness (the string "false" disables); the ambiguous re-enable path is untested.
- Audit sentence: `access.replace('-', ' ')` changes only the first hyphen ("file not-found"); redundant `as number` casts in the scan sentence.
- Companies page: msw listener cleanup should be `afterEach`; the no-retry check is asserted early; the `filePath` tooltip is not keyboard-focusable; the match-names toggle error alert is never dismissed; the 375 px scroll of the `min-w-[880px]` table was exercised only by the e2e test.
- Hooks: no direct tests for `companies.ts` hooks, `home.ts` company params, `useSetCompany` If-Match or the `upload.companyId` omission (the page tests cover them); unused `listKeys.all`.
- Statement page: the `company-file-unavailable` sentence is built inline in `outcome.ts`; the readiness badge appears after `useCompanies` resolves.
- Upload: `CompanyBlock` shows an empty option when editing a match and restores the match silently; no test for choosing a different company on a matched upload.
- Statements list: the older-API test does not assert the dash; the 404 test uses a timing hack.
- Lists and Home: very long digit strings pass the company-id regex; Home sends an unknown but valid-looking id (no fallback required).
- Process: TDD RED runs were not recorded for Tasks 2-9 (tests and code written together).

**Task 11, static contract check against API M17 (2026-11-04)** (Docker is not available, so the live steps did not run).
Compared the dashboard (`schema.ts`, `queries/`, `mocks/`, message mappers) with the API's code (`CompanyEndpoints`, `CompanyProblems`,
`QuickBooksListsV2Endpoints`, `SavedRequestEndpoints*`, `SavedRequestViewsV2`, `SavedRequestIntake`, `StatementExtractionService`,
`EfCompanyStore`, `EfSavedRequestStore`, `AuditEventMapper`, `V2QueryParser`, `DashboardSummaryEndpoints`) and `openapi-v2.json`.
Full table: `.superpowers/sdd/2026-11-03-multi-company-implementation-plan/task-11-report.md`. Mismatches found and fixed in the fake API,
the docs (R-18, R-19, R-20, changelog; spec §5) and a little UI:
- Saved-statement `companyMatch.candidates` are company ids, not references (new type `RequestCompanyMatch`; Choose company dialog reads ids).
- Check access: `company-not-ready` for a missing company (was 200 file-not-found), the API's check order, new `412 edited-by-someone-else`
  and `503 company-file-unavailable` in the mock and the toast.
- Audit `detail`: `company-checked` `{ companyId, access }`, `company-updated` `{ companyId, filePath?, state?, matchNames? }`, scanned adds `noCompanyFile`,
  `company-assigned` adds `source`. Fixed the sentence "file not-found" (only the first hyphen was replaced).
- Lists `company=`: unknown id is 400 on lists and sync (mock said 404), empty page on the history.
- Set company and upload save: 400 `invalid-request` (mock said `invalid-company`/accepted anything); ambiguous companies are assignable;
  an upload takes the only active company as `default` before the match; stats and list `company=` validated like the API.
- Company PATCH: 400 code `invalid-request`; 412 carries `rowVersion`; a new file resets `access` to `unchecked`.

**Not done**: step 1 (`docker compose -f docker-compose.integration.yml up -d --build`), step 2 (`npx playwright test -c playwright.integration.config.ts`),
the by-hand checks against the running API, and the `docker compose ... down -v` of step 4. They need Docker.
Verification after the static-check changes: `npm run lint` clean; `npm run build` passes (only the chunk-size warning); focused vitest
(`src/mocks`, `src/features/{companies,audit,lists,home,requests}`, `src/features/statements/upload`, `src/api`: 43 files, 550 tests; `src/features/statements`: 13 files, 157 tests), all passed. Full `npm test` and `npm run e2e` were not re-run.

### Final review fixes (2026-11-04)

Fixes from the final whole-branch review, on the working tree (still uncommitted). Rulings: progress ledger "FINAL" lines.

1. **Flaky test.** `UploadPage.test.tsx` used `getByRole('combobox', { name: 'Company' })` before `useCompanies` resolved; now
   `findByRole`. Same pattern fixed in `ListsPage.test.tsx` (two `toHaveValue('1')` checks) and `StatementPage.test.tsx`
   (`chooseTakoma` waits for the Takoma option before selecting).
2. **Sync now company-file errors.** `syncFailure` maps `409 company-file-open-elsewhere` to `companyFileMessage(p, 'sync')`
   ("… then sync again.") and `503 company-file-unavailable` to "QuickBooks couldn't open <file>. Check that QuickBooks can open
   it, then sync again." (errors, never retried). The fake sync honours `mockControl.companyOpenElsewhere` /
   `companyFileUnavailable` like the API's `SyncProblem` and records a `skipped` attempt with that reason. R-20.2 and the
   changelog amended.
3. **Upload name lock (ruling).** `ReviewEditor` locks the name cells ("Choose the company first") when the extraction's
   company block is `none`/`ambiguous`, nothing is chosen and more than one company is assignable; no lists (and no lists
   status) are read in that state or while the companies load. Unit tests set a matched default company where they pick
   names; e2e `companies.spec.ts` now deletes the two rows without an account and saves on hold; e2e `upload.spec.ts`
   chooses the company first.
4. **Post confirmation names the company (ruling)** from the version the dialog opened on; unchanged without a company.
   e2e `v2.spec.ts` expects "Post 5 rows to QuickBooks for Takoma Park Grocery Store Inc?".
5. **Small.** CompaniesTable "Folder missing"/"Disabled" badges have the readiness icons (`BanIcon`, `CircleSlashIcon`); the file
   name with the path tooltip has `tabIndex={0}`; all Check access items are disabled while one check runs. Home shows its
   company selector only with more than one company. Statements ignores a `?company=` that is not a positive integer or
   `none` (not sent, no chip, not counted). `CompanyHoldBanner` shows only on a pending statement or with `set-company`.
   MatchNamesDialog disables Save while "Add a name" holds text (hint "Add this name or clear it before saving."). The
   `CompanySelect` wrapper is `max-w-full`. CLAUDE.md now says R-1…R-20.
6. **e2e 375 px** check on statement 14 (no company): no sideways scroll, hold banner visible.

Also fixed while verifying: e2e `v2.spec.ts` "in-app navigation" clicked `getByRole('link', { name: 'Audit trail' })`, which
also matches Home's summary tiles ("… Open in the audit trail.") and button (strict-mode violation); both Audit trail clicks
in that file now use the sidebar (`getByLabel('Main menu')`). This failure was not caused by these fixes (e2e had not been
re-run since Task 11).

TDD: new tests for items 2-5 were seen failing (RED) before or against a temporarily reverted implementation (sync mapping,
upload lock, post title, Check access disabling, Home single company, Statements `?company=`, hold banner). The mock sync
tests were written after the mock change, so no RED was seen for them.

Verification, run 2026-11-04 after all fixes:
- `npm run lint`: no output (clean).
- `npm run build`: passes (`tsc -b` and `vite build`, built in 8.27 s); only the existing chunk-size warning (`index-*.js` 1,028 kB).
- `npx vitest run --reporter=dot` (background): **68 files passed, 791 tests passed** (98 s); no timeouts this run, so no file
  was rerun alone. React "not wrapped in act(...)" warnings still print (e.g. `UploadPage.test.tsx` "who can upload"); no test fails from them.
- `npm run e2e`: first run **2 failed, 6 passed** (`upload.spec.ts` upload flow: locked name cells, the test picked an account
  without choosing a company; `v2.spec.ts` in-app navigation: the strict-mode violation above). After fixing both tests:
  **8 passed** (23.2 s).

Deferred minor list above: the `filePath` tooltip focus item is now done. Task 11's live Docker run is still not done.

## 7. Change 2026-11-04: save an unmatched upload before choosing a company

Spec §6. **Files**: `src/features/statements/upload/emptyFields.ts` (an optional `{ namesLocked }` argument to
`emptyFields` and `saveBlocker`: when set, `account` is listed as recommended, not required),
`src/features/statements/upload/ReviewEditor.tsx` (pass `namesLocked`), tests in `emptyFields.test.ts` and
`UploadPage.test.tsx`, `e2e/upload.spec.ts` only if it relied on the lock blocking Save.

**Steps.** 1. Unit tests for acceptance 1 (RED). 2. Change `emptyFields`/`saveBlocker`. 3. Rewrite the upload test "saving
without a company…" to save without deleting rows (acceptance 2) and add acceptance 3. 4. Pass the flag from
`ReviewEditor`. 5. Run the checks.

**Checks.** `npm run lint`, `npm run build`, `npx vitest run src/features/statements/upload`, full `npm test`, `npm run e2e`.

- [x] Docs updated  - [x] Tests RED  - [x] Code  - [x] Checks green, results recorded below

**Results (2026-11-04).** RED: the new `emptyFields.test.ts` case failed before the change. The two new or rewritten
`UploadPage.test.tsx` cases failed against a temporarily reverted `ReviewEditor`, then passed once it was restored.
`e2e/upload.spec.ts` asserted Save disabled while locked; it now asserts Save enabled while locked and disabled after a
company is chosen.
- `npm run lint`: clean.
- `npm run build`: passes (only the existing chunk-size warning).
- `npx vitest run --maxWorkers=2`: **68 files, 793 tests passed**.
- `npm run e2e`: first run 1 failed (the upload flow's old expectation above), 7 passed. After updating it: **8 passed**.

