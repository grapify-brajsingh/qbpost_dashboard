# QbAutopost Dashboard: manual PDF upload — specification

**Date**: 2026-10-28 · **Status**: implemented 2026-10-28 against the mock API (see §8) · **Ticket**: GitHub issue #4 (branch `feature/manual-pdf-upload`)
**Builds on**: `2026-10-27-qbautopost-dashboard-design.md` (v1), `2026-10-28-dashboard-v2-pages-design.md` (v2),
`2026-10-28-ui-refresh-ledger-spec.md` (look and feel). Everything there still holds, including the v1 anti-goals,
unless this document changes it.
**Plan**: `docs/superpowers/plans/2026-10-28-manual-pdf-upload-plan.md`.
**API**: `docs/api-requirements-for-dashboard.md` R-13 and R-14 (new). The mock API implements them exactly as written
there.

---

## 1. Goal and scope

### 1.1 Why
Every statement today arrives from n8n (Gmail → PDF text → OpenRouter → tidy-up → save). The owner wants an editor or
admin to be able to **upload a statement PDF they got from anywhere**, have it read **the same way n8n reads email
attachments**, correct the rows **before anything is saved**, and then work with it exactly like an emailed statement.

### 1.2 Decisions made with the owner (2026-10-28)
| # | Decision |
|---|---|
| D1 | The **API calls OpenRouter itself** (same model `google/gemini-pro-latest`, same prompt and schema as the n8n "Information Extractor"). n8n keeps its own copy for email; the prompt version and model are recorded on each upload so drift is visible (R-13.5). |
| D2 | Fields the model did not find are **left empty** for the accountant. None of the n8n Code node's defaults (`Capital One - 3188`, `6891`, `zemen-2019-12-p01`, `Uncategorized`, `Ask My Accountant`) are applied. |
| D3 | **Review before save** with the **full editor** (mockup option B): edit any cell, add and delete rows, set the reference and control total. Nothing is saved until **Save statement**. |
| D4 | The **PDF is discarded** after reading. Only file name, size and SHA-256 are kept. |
| D5 | **Possible duplicates warn** and the user may save anyway. |
| D6 | n8n's HTTP node changes from validate-and-post to `POST /saved-requests` (save to database). That is an n8n change with no dashboard or new API work. |

### 1.3 In scope
- An **Upload PDF** button on the Statements page (editors and admins) and in the Ctrl K menu.
- A new page **`/statements/upload`**: choose a file → reading → review editor → save or discard.
- Showing uploaded statements correctly wherever the app shows email details today (list, statement page, Home queue,
  audit trail sentences, search).
- Mock API for R-13 and R-14, and tests.

### 1.4 Out of scope (non-goals)
- Storing or viewing the PDF (D4). Multi-file upload. Drag-and-drop of several files.
- Changing n8n (D6 is the owner's change in n8n) or making n8n call R-13.
- A list filter by source (email / upload). Search by file name is enough for now.
- Keeping an unsaved review across a refresh or a closed tab (the 24-hour extraction record is for saving, not for
  resuming; see §4.7).
- Background or queued extraction. The read is a single request the page waits on.

### 1.5 Anti-goals (a failure even if it works)
- Saving anything the user did not see and confirm (the review is mandatory).
- Writing, computing or rounding `controlTotal` (it starts empty; the user types the printed total).
- Filling a missing field with a guess.
- Rendering any extracted text or file name as HTML.
- Sending the PDF anywhere other than our API.

## 2. What it touches in the codebase (read 2026-10-28)

| Area | Today | Change |
|---|---|---|
| `src/router.tsx` | `/statements` index + `:id` | add `upload` child route, crumb "Upload PDF", guarded by `hasScope(me, 'requests:submit')` |
| `features/statements/list/StatementsPage.tsx` | `PageHeader` with `aside` = new-arrivals pill | add **Upload PDF** button (only with `requests:submit`) |
| `features/statements/list/StatementsTable.tsx` | Received = `email.receivedUtc`, subject + from | uploads show created time, file name, "Uploaded by {name}" |
| `features/statements/detail/StatementPage.tsx` `titleOf` | email subject, else SR ref | email subject, else upload file name, else SR ref |
| `features/statements/detail/StatementHeader.tsx` | Received / From meta from `email` | uploads: "Uploaded" (created time) and "File" (name) |
| `features/home/WaitingCard.tsx` | title = subject ?? reference | subject ?? file name ?? reference |
| `features/statements/sheet/StatementSheet.tsx`, `layout/CommandMenu.tsx` search results, `features/requests/posting/PostDialog.tsx` | show the email subject ("No subject" in the Post dialog) | same fallback: subject, else file name, else reference (one shared helper `statementTitle()`) |
| `layout/CommandMenu.tsx` | pages list | add "Upload PDF" (only with `requests:submit`) |
| `features/audit/*` sentence for `received` | "received from n8n"-style wording | uploads read "uploaded {file name}" when `detail.source === 'upload'` |
| `features/requests/transactions/` (`TxTable`, `draft.ts`, `useDraft`, `UnsavedGuard`, `AddTransactionDialog`, `ReconciliationMeter`) | editor for a saved statement | **reused** unchanged where possible; see §5.3 for the two small extensions |
| `api/schema.ts` | `RequestSummary` without upload | `upload: UploadMeta \| null`; extraction types |
| `api/queries/` | no upload calls | new `extractions.ts`: `useExtractPdf`, `useSaveUpload` |
| `src/mocks/` | `POST /saved-requests` (n8n save) | R-13 handler, R-14 in `saveRequest`, extraction store, fixtures |

## 3. Roles and permissions
- The button, the Ctrl K entry and the route need scope **`requests:submit`** (editor, admin). Viewers do not see the
  button; opening `/statements/upload` directly shows the app's "Page not found" (same pattern as `RequireAdmin`).
- The API enforces the scope on both calls (R-13.1, R-14.1); a `403` is shown with `ProblemAlert`.
- After saving, everything on the statement page is driven by `allowedActions` as today.

## 4. Behaviour and UI states

The page is one route with four steps. Layout follows the ledger look (`.page` frame, `PageHeader`, semantic
tokens, status = icon + word). It must not scroll sideways at 375 px (the table scrolls inside its own panel as on the
statement page).

### 4.1 Step 1: choose a file
- `PageHeader` title **Upload a statement PDF**, description "We read it the same way as emailed statements. Nothing
  is saved until you review it."
- A drop zone (a `<label>` wrapping a visually hidden `<input type="file" accept="application/pdf">`, keyboard
  reachable) with "Drop a PDF here, or choose a file" and "PDF only · up to 10 MB · one file".
- **Client checks** before sending (the API checks again): type `application/pdf` or name ending `.pdf`; size ≤ 10 MB;
  exactly one file. A failed check shows an inline error under the drop zone and sends nothing.

### 4.2 Step 2: reading
- Shows the file name and size, a spinner, "Reading the statement… This usually takes 10 to 40 seconds.", and the
  elapsed seconds (updated each second; no fake progress bar).
- **Cancel** aborts the request and returns to step 1. Leaving the page while reading also aborts.
- Client timeout **150 s**, then a timeout message with **Try again**.

### 4.3 Errors from reading (each with **Choose another file**; retryable ones also with **Try again**)
| API answer | Message |
|---|---|
| `415 not-a-pdf` | "That file isn't a PDF." |
| `413 file-too-large` | the problem's detail (size or page limit) |
| `422 not-a-bank-statement` | "This PDF doesn't look like a bank or card statement." |
| `422 no-text` | "This PDF has no readable text. It may be a scan." |
| `422 pdf-protected` | "This PDF is password-protected. Remove the password and upload it again." |
| `502 extraction-failed`, `504 extraction-timeout`, client timeout | "We couldn't read the statement this time." + Try again |
| `503 extraction-unavailable` | "Reading PDFs isn't available right now." (no Try again) |
| `429 too-many-extractions` | the problem's detail |
| `403` / anything else | `ProblemAlert` |

### 4.4 Step 3: review (the full editor)
- **Header**: title = file name; meta line: pages, "Read by {model} · prompt {promptVersion}", and "Not saved yet"
  (warning tint, icon + words).
- **Reference** text input, pre-filled with the model's `reference`, else the file name without `.pdf`. Required
  (non-blank) to save.
- **Duplicate warning** (only when `possibleDuplicates` is non-empty): a `warning` alert "This may already be in the
  dashboard" listing each match: SR ref (link opening the statement in a **new tab**, so the draft is kept), reference,
  status badge, received time, source ("email" / "upload"), and the reasons in words (`same-file` → "same PDF
  uploaded before", `same-reference` → "same reference", `overlapping-rows` → "some rows match"). It never blocks.
  It is computed once, at read time, on the model's reference. A reference typed afterwards that matches another
  statement is caught after saving by the existing duplicate flag and Post dialog warning (R-14.7); no re-check.
- **Reconciliation meter** (existing `ReconciliationMeter`), control total **empty** at start; the user types it.
- **Rows table** (existing `TxTable` with editing on): every cell editable, add row (existing
  `AddTransactionDialog`), delete / undelete, don't-post toggle. Row filters are **not** shown on this page (no
  saved history to filter by; the statement page keeps them).
- **Empty fields**:
  - **Required** (block saving): `kind`, `date`, `amount`, `account` (the same four the API's `missing-field` rule
    checks). Each empty required cell is marked as a problem in the existing problem style, and the row shows
    "Empty: account, date".
  - **Recommended** (do not block): `payee`, `lineAccount`. Empty ones are marked in the same cell style with the
    word "Empty", and the row note says "Empty (optional): payee". Validation after saving still reports them as it
    does today.
  - Deleted rows are ignored.
- **Zero rows read**: the table's empty state says "No transactions were found in this PDF. Add them by hand or
  choose another file." Saving needs at least one non-deleted row.
- **Action bar** (existing `ActionBarFrame`): left, a summary ("14 rows · 3 empty required fields"); right,
  **Discard** (outline) and **Save statement** (primary).
  - Save is disabled with a tooltip giving the reason: "Fill in N empty required fields", "Fix N values that could not be read", "Enter a reference",
    "Add at least one row", or "Saving…".
  - **Discard** asks "Discard this upload? The rows you've read and any changes will be lost." → back to step 1.
    Nothing is sent to the API (the extraction record expires on its own; D4/R-13.6).
- **Leaving with work on screen**: the existing `UnsavedGuard` is active for the whole review step (the draft is
  always unsaved, edited or not), so route changes and tab close ask first.

### 4.5 Step 4: saving
- `POST /saved-requests` with `{ upload: { extractionId }, reference, controlTotal, transactions }`, where
  `transactions` is the draft's rows (deleted rows removed, added rows appended, `post: false` kept), exactly as
  `draftToPayload` builds it for the statement page. `reference` is the input's value (it overrides the payload's).
  `controlTotal` is the typed value, or `null` when empty (never omitted, never computed).
- **Versions** (R-14.3): version 1 = the rows as read, with the saved reference and control total; version 2 only when
  the rows were changed during review. Typing the reference or control total is not a review edit (both always need
  the user), so it never creates version 2 on its own.
- While saving, the editor is read-only and Save shows a spinner.
- **201**: invalidate `requestKeys.all` and `['audit']`, toast "Statement saved", navigate (replace) to
  `/statements/{id}`. The guard does not prompt for this navigation.
- **409 extraction-already-saved**: toast "This upload was already saved", navigate to `savedRequestId`.
- **410 extraction-expired**: alert "This upload has expired. Upload the PDF again." Edits stay on screen (so the user
  can copy anything); Save is disabled; **Choose another file** is offered.
- **400** (unreadable payload) / **403** / other: `ProblemAlert` above the action bar; the draft is kept; Save can be
  tried again.

### 4.6 After saving
The statement is an ordinary statement. Differences from an emailed one, everywhere it is shown:
- **Statements list**: the Received column shows the created time; the subject cell shows the **file name** with a
  small "Uploaded" label (icon + word), and the second line shows "Uploaded by {source.name}" instead of the sender.
- **Statement page**: title = file name (unless an email subject exists); meta shows **Uploaded** (created time) and
  **File** (file name) instead of Received / From. History shows version 1 "Read from {file}" and, if the user edited
  during review, version 2 "Reviewed before saving" with its changes.
- **Home queue / Waiting card**: title falls back to the file name.
- **Audit trail**: the `received` event reads "{user} uploaded {file name}" when `detail.source === 'upload'`.
- **Search** (`q`): finds the file name (R-14.6).

### 4.7 Partial data and edge cases
- `upload` is missing from an older API response → treat as null (no crash, shows "—" as for a missing email).
- `possibleDuplicates` missing → treat as empty.
- A value the API could not read (a date that is not `yyyy-MM-dd`, such as `08/01/2026`; an amount that is not a number;
  a kind outside `TxnKind`) is shown as a read-error cell, as on a saved statement. Save is disabled with "Fix N
  values that could not be read" until it is fixed (`badValues()` in `emptyFields.ts`).
- Refreshing the page during review loses the draft (the guard warns first). Re-uploading the same file then shows a
  `same-file` warning only if the first one was saved.
- Two tabs uploading at once: the API may answer `429`; shown as in §4.3.

## 5. Data and technical design

### 5.1 Endpoints (all from the API requirements doc)
| Call | Requirement | Hook |
|---|---|---|
| `POST /statement-extractions` (multipart `file`) | R-13 | `useExtractPdf()` mutation; `timeoutMs: 150_000`; `signal` for Cancel |
| `POST /saved-requests` with `upload.extractionId` | R-14 | `useSaveUpload()` mutation; invalidates `requestKeys.all`, `['audit']` |
| `GET /saved-requests`, `GET /saved-requests/{id}`, `GET /audit-events` | R-14.4, R-14.5 | existing hooks; types gain `upload` |
| `GET /quickbooks/lists` | existing | `useQbLists` for the editor's pickers |

### 5.2 Types (`api/schema.ts`)
`UploadMeta { fileName, sizeBytes, sha256, model, promptVersion, extractedUtc }`; `RequestSummary.upload: UploadMeta |
null` (detail inherits); `Extraction` and `PossibleDuplicate` as in R-13.7.

### 5.3 Reuse and the two small extensions
- `createDraft(payload)` / `draftToPayload` / `addRow` / `setCell` / `setPost` / `toggleDeleteRow` /
  `setControlTotal`: used as is on the extraction payload.
- `useDraft(id, version, payload)` keys the draft by `upload:{extractionId}`; its dirty-store entry is harmless.
- **Extension 1**: a pure `emptyFields(draft)` in `features/statements/upload/emptyFields.ts` returns, per display
  index, the empty required and recommended fields. The page turns it into the `readErrors` map and `findings` the
  `TxTable` already understands (no `TxTable` change is expected; if the cell marker needs a different label for
  "Empty", `TxTable` gets one optional prop).
- **Extension 2**: `UnsavedGuard` is used with `dirty` = "review step on screen and not saving". The save navigation
  must bypass it (set not-dirty before navigating, as the statement page does after a save).
- No new dependencies. Any missing shadcn primitive is added with the CLI per CLAUDE.md.

### 5.4 Mock API (`src/mocks/`)
- `POST /statement-extractions`: requires `requests:submit`; reads the multipart `file`; checks `%PDF-`, 10 MB;
  computes SHA-256 (`crypto.subtle`); waits `mockControl.extractDelayMs` (default 1500 ms, 0 in tests); returns a
  fixture extraction. The file name selects test outcomes: contains `not-statement` → 422 not-a-bank-statement,
  `scan` → 422 no-text, `protected` → 422 pdf-protected, `fail` → 502, `empty` → 200 with no rows; otherwise a
  14-row Chase-style statement with three rows missing `account` or `payee`. `mockControl.nextExtraction` can force any
  outcome. Duplicates are computed with the existing `duplicateReasons` plus `same-file` against saved uploads.
- Extraction store in `mockDb` (cleared by `reset()`), with `expiresUtc`; `mockControl.expireExtractions()` for tests.
- `saveRequest` handles `upload`: checks (410 / 404 / 409), version 1 = extraction payload with note
  `Read from {file}`, version 2 = body payload when `diffPayload` is non-empty, `upload` metadata from the record,
  `email: null`, event `created` with `detail: { source: 'upload', fileName }`. n8n saves add
  `detail: { source: 'email' }`.
- `toSummary` / `toDetail` include `upload`; list `q` matches `upload.fileName`.
- `mocks/audit.ts` passes `detail` through for `received`.

### 5.5 Security
- The file name and every extracted string are rendered as text only (`react/no-danger` lint stays clean).
- The access token is sent as today (memory only); the multipart request goes through `apiFetch`, so a 401 refreshes
  once and retries.
- No OpenRouter key or call ever exists in the dashboard.

### 5.6 Accessibility
- The drop zone is a real file input with a visible focus ring; "choose a file" works by keyboard.
- Reading state uses `role="status"` with the elapsed time announced at most every 10 s.
- Error and duplicate alerts use `role="alert"` / existing `ProblemAlert`.
- Respect `prefers-reduced-motion` for the spinner (existing `motion.ts`).

## 6. Acceptance criteria
1. A viewer sees no Upload PDF button or Ctrl K entry, and `/statements/upload` shows "Page not found".
2. An editor uploads a PDF, sees the reading state, then the review editor with the extracted rows, an empty control
   total and the reference pre-filled.
3. Rows with an empty `account` (or `kind`, `date`, `amount`) are marked and **Save statement** is disabled with
   "Fill in N empty required fields"; filling them enables it. Empty `payee` / `lineAccount` are marked but do not
   block.
4. The user can edit a cell, add a row, delete a row and mark a row don't post before saving.
5. Saving creates a statement and opens `/statements/{id}`; its history has version 1 (as read) and version 2 with
   exactly the review edits; the audit trail shows "{user} uploaded {file}" and the row events.
6. Saving without any row edits (only reference and control total typed) creates only version 1.
7. A PDF that is not a statement shows "This PDF doesn't look like a bank or card statement." and nothing is saved.
8. Uploading a PDF whose reference matches an existing statement shows the duplicate warning with a link that opens in
   a new tab; Save still works.
9. Discard and leaving the page both ask first; after Discard, nothing exists in the Statements list or audit trail.
10. Cancel during reading returns to step 1.
11. Saving the same extraction twice (double click, retry) leads to one statement (409 path).
12. Uploaded statements show file name and "Uploaded by …" in the list, "Uploaded" / "File" on the statement page,
    and are found by searching the file name.
13. No control total is ever filled in automatically; no missing field is ever filled with a default.
14. At 375 px the upload page and review editor have no sideways page scroll.
15. `npm run lint`, `npm run build`, `npm test` pass; the new e2e test passes.
16. The Post dialog, statement sheet and Ctrl K results show the file name for an uploaded statement, never
    "No subject".

## 7. Calls made while writing this spec (for the owner to check)
- Step 1 is on the upload page itself, not a dialog as in the mockup: the review editor needs a full page anyway.
- Required-to-save fields are the API's four (`kind`, `date`, `amount`, `account`); `payee` and `lineAccount` are
  marked but do not block.
- The control total does not block saving (validation still refuses a post without it).
- The model's reading is kept as version 1 so review edits are audited (R-14.3). Reference and control total typed
  at review go into version 1.
- Duplicates are checked once at read time (see §4.4).
- Upload is open to editors and admins via the existing `requests:submit` scope.
- Limits suggested to the API: 10 MB, 50 pages, 120 s, one extraction at a time per user, 24-hour record.

## 8. Implementation notes (2026-10-28)
- **Built as specified** against the mock API: the steps, the states, entry points, permissions and the display of uploaded
  statements. Results and verification output are in the plan's §4.
- **Where the build differs from §4–§5**:
  - Empty cells are marked by findings with the reason `empty-<field>`. `TxTable` shows each under that field's cell
    (a 3-line change, not a new prop).
  - Values the API could not read are marked through `readErrors` and block saving (§4.7).
  - `statementSubject()` returns the email subject, else the file name, else null. Each caller keeps its own last
    fallback (SR ref, reference or "No subject"), so emailed statements display exactly as before.
  - The Post dialog labels the line "File" when an uploaded statement has no email subject.
  - In the Statements list, the upload icon sits on the "Uploaded by {name}" line. There is no separate "Uploaded"
    label next to the file name. The column header reads "Email or file".
  - The mock records `received` detail `{ source: 'email' }` for n8n-style saves (R-14.5, suggested).
  - The mock fixture's default reading has no reference, so the page pre-fills the file name. A file name containing
    `dup` reads the reference of statement 1, to show the duplicate warning.
- **Not built (deferred)**: see plan §4.
