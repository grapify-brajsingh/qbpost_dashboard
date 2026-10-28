# QbAutopost Dashboard: manual PDF upload — implementation plan

**Date**: 2026-10-28 · **Spec**: `docs/superpowers/specs/2026-10-28-manual-pdf-upload-spec.md` (section numbers below
refer to it) · **API**: `docs/api-requirements-for-dashboard.md` R-13, R-14 · **Branch**: `feature/manual-pdf-upload`
(issue #4).

Rule for the whole plan: reuse the statement editor (`TxTable`, `draft.ts`, `useDraft`, `UnsavedGuard`,
`AddTransactionDialog`, `ReconciliationMeter`, `ActionBarFrame`) and the shared components (`PageHeader`,
`ProblemAlert`, `StatusBadge`, `Timestamp`, `EmptyState`). No new dependencies. Tests first for pure logic and mock
handlers.

## 1. File structure

```
src/
  api/schema.ts                                   MOD  UploadMeta, upload on RequestSummary, Extraction, PossibleDuplicate
  api/queries/extractions.ts                      NEW  useExtractPdf (multipart, 150 s, abortable), useSaveUpload
  mocks/db.ts                                     MOD  mockDb.extractions; mockControl.extractDelayMs, nextExtraction, expireExtractions()
  mocks/fixtures/extractions.ts                   NEW  fixture payload (14 rows, 3 with empty account/payee) + outcome by file name
  mocks/handlers/extractions.ts                   NEW  POST /statement-extractions (R-13)
  mocks/handlers/extractions.test.ts              NEW
  mocks/handlers/index.ts                         MOD  register extraction handlers
  mocks/handlers/requests.ts                      MOD  saveRequest: upload branch (R-14.2–14.5); n8n saves get detail.source
  mocks/handlers/requestHelpers.ts                MOD  toSummary/toDetail upload; list q matches file name
  mocks/handlers/requests.upload.test.ts          NEW  R-14 save paths
  mocks/audit.ts                                  MOD  received events carry detail
  features/statements/upload/
    UploadPage.tsx                                NEW  route component: step state machine (choose → reading → review → saving)
    FilePicker.tsx                                NEW  drop zone + client checks
    ReadingState.tsx                              NEW  spinner, elapsed seconds, Cancel
    ExtractionError.tsx                           NEW  problem type → message + actions (spec §4.3)
    ReviewEditor.tsx                              NEW  header, reference input, duplicates, meter, TxTable, action bar
    DuplicateWarning.tsx                          NEW  possibleDuplicates alert
    emptyFields.ts                                NEW  pure: empty required/recommended fields per row; save blockers
    emptyFields.test.ts                           NEW
    uploadErrors.ts                               NEW  pure: ApiError → { message, retry, choose }
    uploadErrors.test.ts                          NEW
    UploadPage.test.tsx                           NEW
  features/statements/list/StatementsPage.tsx     MOD  Upload PDF button (requests:submit)
  features/statements/list/StatementsTable.tsx    MOD  upload rows: created time, file name, "Uploaded by"
  features/statements/detail/StatementPage.tsx    MOD  titleOf falls back to upload.fileName
  features/statements/detail/StatementHeader.tsx  MOD  Uploaded / File meta for uploads
  features/home/WaitingCard.tsx                   MOD  title fallback to file name
  lib/statementTitle.ts                           NEW  pure: subject ?? file name ?? reference ?? SR ref (+ test)
  features/statements/sheet/StatementSheet.tsx    MOD  title via statementTitle
  features/requests/posting/PostDialog.tsx        MOD  title via statementTitle (no "No subject" for uploads)
  features/audit/auditSentence.ts                 MOD  received + detail.source upload → "uploaded {file}"
  layout/CommandMenu.tsx                          MOD  Upload PDF entry (requests:submit)
  router.tsx                                      MOD  /statements/upload (RequireScope requests:submit), crumb "Upload PDF"
e2e/upload.spec.ts                                NEW  upload → review → fill → save → statement page
e2e/fixtures/chase-aug-2026.pdf                   NEW  tiny valid PDF (a few hundred bytes, starts with %PDF-)
docs/…                                            MOD  spec §7 notes, this plan's results, API doc tracker "Mock API" column
```

## 2. Tasks, in order

### T1. Types and query hooks
- **Do**: add the types to `schema.ts` (spec §5.2). `extractions.ts`: `useExtractPdf()` posts a `FormData` with
  `file` via `api.post('/statement-extractions', form, { timeoutMs: 150_000, signal })` (the client passes `FormData`
  through without JSON encoding; let the browser set the multipart boundary). `useSaveUpload()` posts the R-14 body and
  invalidates `requestKeys.all` and `['audit']` on success.
- **Depends on**: nothing. **Outcome**: `npm run build` passes.

### T2. Mock API: extraction (R-13) — tests first
- **Do**: `extractions.test.ts` covering: 403 for viewer; 415 for non-PDF bytes; 413 over 10 MB; the five file-name
  outcomes; 200 shape (`controlTotal: null`, no default values, `externalId` row-n, `model`, `promptVersion`,
  `expiresUtc`); `same-reference` and `overlapping-rows` against a fixture statement; `same-file` after a saved upload;
  no record kept for 422. Then implement `handlers/extractions.ts`, the fixture, and the `mockDb` / `mockControl`
  additions (reset clears them; delay 0 in tests via the test setup).
- **Depends on**: T1. **Outcome**: handler tests pass.

### T3. Mock API: save a reviewed upload (R-14) — tests first
- **Do**: `requests.upload.test.ts` covering: 201 with version 1 = extraction rows + body reference/controlTotal and
  version 2 = row edits (note texts); no version 2 when only reference / control total differ; `upload` kept out of
  `withoutMeta`-style hashing and diffs; `upload` on detail and list; `email: null`; 409 with `savedRequestId` on
  second save; 410 after `expireExtractions()`; 404 for another user's extraction; audit feed `received` with
  `detail.source = 'upload'` and the row events; list `q` finds the file name; n8n saves get `detail.source = 'email'`.
  Then change `saveRequest`, `requestHelpers`, `audit.ts`.
- **Depends on**: T2. **Outcome**: new and existing mock tests pass.

### T4. Pure logic — tests first
- **Do**: `emptyFields.ts`: for a `Draft`, per display index (loaded rows, then added rows; deleted rows skipped) the
  empty **required** (`kind`, `date`, `amount`, `account`) and **recommended** (`payee`, `lineAccount`) fields
  (empty = missing, null, or blank string); `saveBlockers(draft, reference)` returns the first reason in spec §4.4
  order. `uploadErrors.ts`: maps problem `type` / status (and `ApiTimeoutError`) to the spec §4.3 table.
- **Depends on**: nothing. **Outcome**: unit tests pass.

### T5. Upload page components
- **Do**: `FilePicker`, `ReadingState`, `ExtractionError`, `DuplicateWarning`, `ReviewEditor`, `UploadPage` as in spec
  §4. `ReviewEditor` builds the draft with `useDraft('upload:' + extractionId, '1', payload)`, feeds `TxTable` with
  `edit` on, `findings`/`readErrors` from `emptyFields` (plus any binding read errors), and no row filters. Reference
  input outside the draft; `controlTotal` via `setControlTotal`. Payload for save = `draftToPayload(draft)` with
  `reference` overridden by the input and `controlTotal: null` when empty. Guard: `UnsavedGuard dirty={step === 'review'}`; set step to
  `saving` before navigating so the guard lets the navigation through.
- If `TxTable`'s problem marker cannot word "Empty" for recommended fields, add one optional prop (record the change
  in spec §7).
- **Depends on**: T1, T4. **Outcome**: page renders in `dev:mock`.

### T6. Route, entry points, display of uploaded statements
- **Do**: router child `upload` before `:id`, wrapped in a `RequireScope` helper (generalise `RequireAdmin` to take a
  scope, keep `RequireAdmin` as `RequireScope scope="users:manage"`). Statements page button (`Button asChild` +
  `Link`, `UploadIcon`). Ctrl K entry. `statementTitle()` helper used by `titleOf`, WaitingCard, StatementSheet,
  CommandMenu results and PostDialog. List, header, Home and audit sentence changes (spec §4.6).
- **Depends on**: T5. **Outcome**: entry points visible to editor/admin only.

### T7. Page tests (`UploadPage.test.tsx`, plus small additions)
- Viewer: no button, no Ctrl K entry, `/statements/upload` → Page not found.
- Happy path: choose file → reading → review (rows, empty control total, reference pre-filled) → Save disabled with
  "Fill in 3 empty required fields" → fill → save → lands on `/statements/:id`, history has versions 1 and 2.
- No edits → only version 1.
- Error mapping: not-statement, scan, fail (with Try again), 503 (no Try again).
- Cancel during reading returns to step 1 (use `mockControl.extractDelayMs` > 0 for this test only).
- Duplicate warning appears for the fixture reference; Save still works.
- Discard asks and returns to step 1; nothing saved (list count unchanged).
- 409 navigates to the existing statement; 410 shows the expired message and disables Save.
- `StatementsTable` / `StatementHeader` / `auditSentence` tests: uploaded statement shows file name, "Uploaded by", "uploaded {file}".
- **Depends on**: T6.

### T8. End-to-end
- **Do**: `e2e/upload.spec.ts`: sign in as Asha, Statements → Upload PDF → `setInputFiles('e2e/fixtures/chase-aug-2026.pdf')`
  → wait for review → fill the three accounts → type control total → Save → statement page shows the file name title
  and Uploaded meta. Also a 375 px viewport check that the page does not scroll sideways.
- **Depends on**: T6.

### T9. Responsive and accessibility pass
- 375 px: header wraps, drop zone full width, table scrolls inside its panel, action bar wraps. Keyboard: drop zone
  reachable, Save/Discard reachable, focus moves to the review heading after reading. Reduced motion respected.
- **Depends on**: T5–T6.

### T10. Verification
```
npm run lint
npm run build
npm test
npm run e2e
npm run dev:mock     # manual: sign in as asha@example.com, upload a PDF, walk the spec §6 list
```
Record actual output below (including the known `StatementPage.test.tsx` timeout flake if it appears).

### T11. Documentation
- Tick milestones, record results, note deviations in spec §7 (new section "Implementation notes").
- API doc: Tracker "Mock API" column for R-13 and R-14 → Implemented; Changelog line if any shape changed.

## 3. Milestones
- [x] M1 Types, hooks, mock R-13 and R-14 with tests (T1–T3)
- [x] M2 Pure logic with tests (T4)
- [x] M3 Upload page working in `dev:mock` (T5–T6)
- [x] M4 Page tests and e2e green (T7–T8)
- [x] M5 375 px / a11y pass (T9)
- [x] M6 lint, build, test, e2e pass; docs updated (T10–T11)

## 4. Results and known limitations (2026-10-28)

**Verification** (actual output):
- `npm run lint`: exit 0, no warnings.
- `npm run build`: exit 0. The existing "chunks larger than 500 kB" warning is unchanged.
- `npm test`: on an idle machine **483/483 passed**. After the final review fix, the last full run had **483 passed, 2 failed
  out of 485**: `auth.test.tsx` "valid refresh cookie signs in without showing the form" and `StatementPage.test.tsx`
  "Add transaction dialog appends a row…". Both are load timeouts and pass alone (48/48). The same two failed on the
  untouched baseline (`HEAD` in a separate worktree: 2 failed / 430). Other loaded runs also timed out in
  `StatementSheet.test.tsx`, `users.test.tsx`, `users.v2.test.tsx` and `dialogs.test.tsx`; all pass alone.
- `npm run e2e`: `e2e/upload.spec.ts` **2/2 passed** (upload → fill → save; 375 px has no sideways scroll). The existing
  `e2e/v2.spec.ts` "in-app navigation keeps the user signed in" **fails** with a strict-mode error (Home has six links
  named "Audit trail"). It fails identically on the baseline `HEAD`, so it predates this work and is not fixed here.
- `npm run dev:mock`: running on http://localhost:5174 (5173 was in use).

**Changes from the plan** (also in spec §8):
- `mocks/audit.ts` needed no change; it already passes event `detail` through.
- No `e2e/fixtures/*.pdf` file: the e2e passes an in-memory buffer to `setInputFiles`.
- `src/test/setup.ts` gained a multipart bridge (test infrastructure only): under jsdom, Node's fetch cannot send jsdom's
  `FormData`, so the bridge writes the multipart bytes itself.
- The mock handler parses the multipart `file` part by hand: undici's `request.formData()` fails under jsdom.
- `TxTable` maps a finding reason `empty-<field>` to that field's cell (3 lines) instead of taking a new prop.
- Added `badValues()` (final review): a non-ISO date, non-numeric amount or unknown kind blocks Save, as spec §4.7 says.
- `CommandMenu` page entries take a `scope` (replacing `adminOnly`); the router has `RequireScope`, and `RequireAdmin`
  wraps it.
- The heavy happy-path page test has a 15 s timeout because it runs slowly under full-suite load.

**Deferred** (final review, minor):
- **Try again shown when it can't help**: `ExtractionError` shows Try again for unmapped 4xx errors such as 403.
- **Mock save skips the 400 check**: it doesn't return 400 for a non-array `transactions` or a missing `extractionId`.
- **Garbled non-ASCII file names**: the mock decodes the multipart file name as latin1, so non-ASCII names garble in
  `dev:mock` only.
- **Edits unprotected after expiry**: after a 410 the unsaved-changes guard is off, though the edits stay on screen.
- **Test gaps**: a leave-the-route prompt during review, UI-level proof that an unedited save makes only version 1,
  and the client timeout path.
- **Raw link in the duplicate warning**: `DuplicateWarning` uses a raw `<a href>`, which ignores any router basename.
- **Label position in the list**: the upload icon sits on the "Uploaded by" line, not next to the file name.
