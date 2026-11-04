# Spec: Multiple company files (sidebar "Companies")

**Date**: 2026-11-03 · **Status**: approved by the owner 2026-11-04 · **Requirements**: R-18, R-19, R-20
**Plan**: `docs/superpowers/plans/2026-11-03-multi-company-plan.md`
**API side**: `D:\qbautopost\qb_post\docs\multi-company-m17.md` (M17, T-1700…T-1715) — the contract for every
shape below. If the two disagree, the API spec wins and this file is corrected.
**Builds on**: lists page (`2026-10-30-qb-lists-page-spec.md`), manual PDF upload (`2026-10-28-manual-pdf-upload-spec.md`),
v2 pages (`2026-10-28-dashboard-v2-pages-design.md`), home (`2026-10-28-home-dashboard-spec.md`).
**Source**: owner, 2026-11-03: "one more tab/page in the frontend named as company … select a folder … that folder will
contain different company files of QuickBooks … listed and synced to backend … provide a sync button … the pdf
extraction should also take out company name and post the pdf based on the company." Follow-ups: match on **PDF
content, not the file name**; the folder is a **server path in `appsettings.json`** whose subfolders each hold a
`.qbw`; each new company gets a copy of the rules; the owner does not know whether QuickBooks is usually left open,
so the app must handle both.

## 1. Goal and scope

An accountant works across many QuickBooks Desktop company files. The dashboard shows which companies the server
knows about, lets an admin re-scan the company folder, shows each company's QuickBooks access state, and makes every
statement belong to a company — read from the PDF, or chosen by a person when the PDF can't be matched.

**In scope**: Companies page; company on statements (list column, filter, header, hold banner + picker); company on
the upload review; company selector on Lists and Home; company in audit sentences; fake API for all of it.

**Out of scope**: n8n / email intake changes (owner, 2026-11-04: emailed statements with several companies arrive
on hold); choosing a folder from the browser (the folder is fixed on the server; a browser folder picker
cannot give the server a path); per-company permissions; credit-card row types; editing rules per company in the UI;
audit filter by company (shown, not filterable, this round).

## 2. What it touches (read from the code)

- `src/router.tsx`: new child route `/companies` beside `/lists` (:100), crumb "Companies".
- `src/layout/AppSidebar.tsx`: new `NavItem to="/companies"` in the Work group after Lists (:104).
  `src/layout/CommandMenu.tsx`: new `PAGES` entry.
- `src/api/schema.ts`: new `Company`, `CompanyRef`, `CompaniesResponse`, `CompanyScanResult`, `CompanyMatch`;
  `RequestSummary.company`, `companySource`; `RequestDetail.companyMatch`; `Stats.needsCompany`; `Action` gains `'set-company'`;
  `Extraction.company`; `AUDIT_ACTIONS` gains `companies-scanned`, `company-checked`, `company-updated`,
  `company-assigned`.
- `src/api/queries/companies.ts` (new): `companyKeys`, `useCompanies`, `useScanCompanies`, `useCheckCompany`,
  `useUpdateCompany`.
- `src/api/queries/requests.ts`: `ListParams.company`, `listQuery`, `useStats(company?)`, new `useSetCompany`.
- `src/api/queries/lists.ts`: `listKeys.qb(company)`, `syncs(company, f)`; `useQbLists(company)`,
  `useQbListsDetail(company)`, `useQbListSyncs(company, f)`, `useSyncQbLists(company)`.
- `src/api/queries/extractions.ts`: `useSaveUpload` sends `companyId` when chosen.
- `src/api/queries/home.ts`: `company` passed to stats, review list and `/dashboard/summary`.
- `features/lists/ListsPage.tsx`, `features/requests/transactions/{QbListsStatus,TransactionsTab}.tsx`,
  `features/statements/upload/ReviewEditor.tsx`: lists for the right company.
- `features/statements/list/{StatementsPage,StatementsToolbar,StatementsTable}.tsx`: company filter + column.
- `features/statements/detail/StatementPage.tsx`, `StatementHeader.tsx`: company meta, hold banner, picker dialog.
- `features/home/HomePage.tsx`: company selector.
- `features/audit/auditSentence.ts`: sentences for the four new actions.
- `src/mocks/`: `fixtures/companies.ts`, `handlers/companies.ts`, `db.ts` (`companies`, `RequestRecord.companyId`,
  `mockControl` flags), `handlers/{requests,requestHelpers,extractions,support}.ts`, `handlers/index.ts`.
- `docs/api-requirements-for-dashboard.md`: R-18, R-19, R-20 (added with this spec).

## 3. Behaviour

### 3.1 Sidebar and route

"Companies" (icon `Building2Icon`) appears for everyone who can read lists (`lists:read`). Admin-only controls on the
page check `hasScope(me, 'requests:admin')` — the API scope for scan/check/edit. (*My call*: `requests:admin` rather
than `users:manage`, because these are QuickBooks operations, not user management; in practice both are the admin
role.)

### 3.2 Companies page

`.page` frame, `PageHeader` title "Companies", description: "Company files found in `<rootFolder>` on the
QuickBooks server." plus "Last scanned 5 minutes ago" (`Timestamp`). Header action (admin): **Sync** button
(`RefreshCwIcon`, "Sync"; while running `Loader2Icon` "Scanning…"; state from `useIsMutating`, like `QbListsStatus`).
Sync calls `POST /companies/scan` and toasts "Found 2 new, 1 missing" style text (or "No changes"). The folder
itself is **not editable** in the UI.

Table in a `DataPanel` (min width, horizontal scroll inside the panel only at 375 px):

| Column | Content |
|---|---|
| Code | `18` (muted `—` when none) |
| Company | display name; second line QuickBooks name when it differs |
| File | file name; full path in a tooltip; `ambiguous` → "2 files — choose one" |
| QuickBooks access | badge, icon + word: *Approved*, *Needs approval*, *Not checked*, *File missing*, *Error*; checked time below |
| Lists | last sync time + outcome, link to `/lists?company=<id>` |
| Waiting | pending statements count, link to `/statements?company=<id>` |
| ⋯ (admin) | *Check access*, *Choose file* (ambiguous only), *Edit match names*, *Disable/Enable* |

- Rows in state `missing` or `disabled` sort last and are dimmed, with a badge "Folder missing" / "Disabled".
- **Needs approval help**: when any company is *Needs approval*, an info `Alert` above the table explains the one-time
  step in plain words: open that company file in QuickBooks as admin, accept the QbAutopost certificate, choose
  "Yes, always; allow access even if QuickBooks is not running", pick a QuickBooks user, then press *Check access*.
- **Check access** → `POST /companies/{id}/check`; toasts: approved; "QuickBooks has *X* open — close it or open *Y*,
  then check again" (409 `company-file-open-elsewhere`); "QuickBooks isn't running" (503). Never retried
  automatically.
- **Edit match names** dialog: chips list of extra names (e.g. "Zemen Market") with add/remove; explains "Statements
  whose printed business name equals one of these are assigned to this company." Saves with `If-Match`.
- **Choose file** dialog: radio list of `candidateFiles`; saves `PATCH { filePath }`.

States: loading (`TableSkeleton`); root not configured → `EmptyState` "No company folder is set. Set
`Companies:RootFolder` in the API's appsettings.json." (single-company installs still list their one default company
under it); root unreachable → `ProblemAlert` with the path + "Try again"; no companies → `EmptyState` "No company files
found in `<root>`. Each company needs its own subfolder with a .qbw file." (+ Sync for admin); `GET` 404 →
`EmptyState` "Companies need a newer API."

### 3.3 Statements list

- New column **Company** after "Email or file": code + display name; "Needs company" warning badge (icon + word) when
  null. Table min width grows accordingly; skeleton column count updated.
- New `FilterChip` "Company" in `StatementsToolbar` with options = companies (+ "No company"), URL param
  `company` (`enum`-like text in `FILTER_SPEC`), cleared by Clear filters.
- `useStats({ company })` so tab counts respect the filter. Sidebar badge stays all-companies.

### 3.4 Statement page

- `StatementHeader` gains `<Meta label="Company">` (code + name). When `allowedActions` has `set-company`, a small
  "Change" link opens the **Choose company** dialog.
- **Hold banner** (beside `StatusBanner`) when `company` is null on a pending statement (or one with `set-company`): warning tone, "Choose the company before validating
  or posting. The printed name on this statement was *SA CONVENIENCE MARKET*." (from `companyMatch.printedName`;
  the sentence is left out when there is none). Button "Choose company" (if `set-company` allowed).
- **Choose company** dialog: `Select` of active companies (code + name), with candidates from the match listed first;
  confirm → `POST /saved-requests/{id}/company` with `If-Match`; note "Validation will be cleared" when the statement
  was validated. Success invalidates `requestKeys.all` and `['audit']`. 412 → the usual stale-version message.
- Validate/Post buttons already follow `allowedActions` (the API omits them while unassigned); a 409
  `company-required` is shown as a `ProblemAlert` if it ever arrives.
- A company that is not ready (`company-not-ready`: missing, disabled, ambiguous, or not approved in QuickBooks):
  the API omits Validate/Post; the header shows the company with its access badge and a link to `/companies`.
- A single-company install (or one active company) never shows the hold: the API assigns that company itself.
- Post failure `company-file-open-elsewhere` (or the generic `company-file-unavailable`) → error toast in plain words naming both files; no retry (existing
  never-auto-retry rule).
- Lists used by the editor (`TransactionsTab`, `QbListsStatus`) are the statement company's; with no company the
  account/payee pickers are disabled with the hint "Choose the company first".
- The Post confirmation names the company of the version it opened on: "Post 4 rows to QuickBooks for S & A Convenience
  Market LLC?" (unchanged "Post 4 rows to QuickBooks?" when the statement has no company or the API sends no `company`).

### 3.5 Upload review

`ReviewEditor` shows a **Company** block next to Reference:
- `matched` → company name + "Read from statement: *TAKOMA PARK GROCERY STORE INC*", with "Change".
- `ambiguous` → `Select` preloaded with the candidates, warning text "More than one company matches".
- `none` → `Select` of all companies, text "No company matched the printed name *…*" (or "No business name was found
  on the statement").
Choosing is optional: saving without one creates a statement on hold. A chosen company is sent as `upload.companyId`.
The lists used for the review's pickers follow the chosen/matched company. With no match and nothing chosen, and more than
one company to choose from, the name pickers are locked with "Choose the company first" and no lists are read (§5).

### 3.6 Lists page and Home

- **Lists**: a company `Select` in the page header (URL `?company=`; default = the default company from
  `GET /companies`). Names, Sync now and Sync history all use that company. `QbListsStatus` takes a `company` prop.
- **Home**: a company `Select` ("All companies" default, URL `?company=`) passed to stats, the waiting list and
  `/dashboard/summary`. Recent activity stays all-companies.
- **Audit**: sentences for the new actions, e.g. "Asha assigned SR-000123 to *S & A Convenience Market LLC*",
  "Asha scanned the company folder: 2 new". Company shown in event detail when present.

### 3.7 Roles

| Role | Sees Companies | Sync / Check / Edit | Assign company to a statement |
|---|---|---|---|
| viewer | yes | no | no |
| editor | yes | no | yes (`set-company` from API) |
| admin | yes | yes | yes |

The API enforces all of it; the UI only hides what the scopes/`allowedActions` don't allow.

### 3.8 Data

All calls in `api/queries/`. `companyKeys = { all: ['companies'] }`. Scan/check/update invalidate `companyKeys.all`;
`set-company` and upload save invalidate `requestKeys.all` and `['audit']`. Lists keys include the company id, so two
companies' lists never share a cache entry. A missing `company` field on old API answers is treated as "unknown" (no
column value, no hold banner) so the dashboard still works against an API without M17.

### 3.9 Fake API

Matches R-18…R-20 exactly. Fixtures: three companies — `18` Takoma Park Grocery Store Inc (approved, default),
`440` S & A Convenience Market LLC (needs approval), `7` Sunrise Liquors (ambiguous, two files) — and one missing
company. Seeded statements get company ids; one pending statement has none. `mockControl` adds
`companyRootMissing`, `companyOpenElsewhere` (name of the "open" file), `scanAdds` (folders the next scan finds),
`nextMatch` (match result for the next extraction).

## 4. Acceptance criteria

1. Sidebar shows "Companies" for viewer, editor and admin; only admin sees Sync, Check access and the ⋯ menu.
2. Sync shows the spinner, then the new company appears in the table without a reload; the toast says what changed.
3. Root unreachable shows the path and Try again; root not configured shows the setup message.
4. A *Needs approval* company shows the approval help; Check access with another file open shows the plain message
   naming both files, and nothing retries.
5. Statements list filters by company (`?company=<id>`, e.g. the id of company 440) and by "No company"; the column shows the company or the
   "Needs company" badge.
6. A statement with no company shows the hold banner with the printed name, has no Validate/Post buttons, and after
   choosing a company shows the company in the header and Validate becomes available.
7. Upload of a matched PDF shows the matched company; an unmatched one shows the picker; saving with a chosen company
   sends `upload.companyId`.
8. Lists page shows the selected company's names and sync history; Sync now syncs that company.
9. Home counts change with the company selector.
10. 375 px: no sideways page scroll on Companies, Statements, Statement and Upload.
11. `npm run lint`, `npm run build`, `npm test` pass; new tests cover 1–9 against the fake API.

## 5. As built

Built 2026-11-04 against the fake API (Tasks 1-10 of the plan). Checked against the real API (M17) **statically only**, on
2026-11-04: the dashboard's types, mocks and message mappers were compared with the API's code and `openapi-v2.json`; the
fake API and the docs were corrected where they differed (marked "API M17" below). The live run (Docker stack and the
real-stack suite) has **not** been done. Where the build differs from this spec or adds to it:

**Contract and data**
- **Ids in URLs, not codes.** `?company=` on Statements, Lists and Home carries the company *id*, as R-19.2 says. The fixture
  ids (1-4) differ from the codes (18, 440, 7, 12). Acceptance 5 is tested with `?company=2` (the company with code 440).
  Home and Lists accept only a positive integer; anything else, or on Lists an id that is not a known company, falls back
  (All companies / the default company) and is never sent. Statements accepts a positive integer or `none` (final review
  fix); anything else is ignored: no chip, not counted as a filter, never sent.
- **Fake fixtures.** Four companies (the fourth, `12` Harbor Deli, is missing). New statement 14 is pending with no company;
  statement 7 (posted) moved to company 2. Other seeded statements are company 1 (`migrated`).
- **`Company.rowVersion` (settled).** In R-18 and the M17 `Company` shape; `PATCH` sends `If-Match: "<rowVersion>"`.
- **`upload.companyId` (settled).** The upload save sends `companyId` inside `upload`, only when the user picked one; for a matched
  upload nothing is sent. A top-level `companyId` is ignored by the API and by the mock.
- **Audit `detail` shapes (API M17, settled).** `companies-scanned` `{ added, updated, missing, ambiguous, noCompanyFile }`,
  `company-checked` `{ companyId, access }`, `company-updated` `{ companyId, filePath?, state?, matchNames? }` (only what
  changed), `company-assigned` `{ companyId, from, to, source: "chosen" }` (`from`, `to` are `{ id, code, displayName }`; a
  removed company has `code` and `displayName` null). Only `company-assigned` names a company, so the checked and updated
  sentences read "a company" (the audit row already shows the company filter and `companyId`). The audit sentences read
  "file not found" for `file-not-found` (an earlier version changed only the first hyphen).
- **Audit sentences have no actor.** The table shows the actor in its own column, so the sentences read "Assigned SR-000014 to
  S & A Convenience Market LLC" and "Scanned the company folder: 2 new, 1 missing", not "Asha assigned ...". The scan wording
  comes from one helper, `src/lib/companyScan.ts` (`scanSummaryText`), shared with the scan toast.
- **Check access answers (API M17).** In the API's order: `409 company-not-ready` for a company that is not `active` (ambiguous,
  disabled or missing, so a missing company is no longer recorded as `file-not-found`; that happens only to an active company
  whose file is gone from disk); `412 edited-by-someone-else` when the file was re-pointed while QuickBooks answered (the
  toast says the company changed and the list reloads, since every settle refreshes it); `503 quickbooks-not-open`;
  `409 company-file-open-elsewhere`; `503 company-file-unavailable` ("QuickBooks couldn't open <file>").
- **Mock validations.** `company-required` is checked before `company-not-ready`, both before the status check, on validate and
  post. `PATCH /companies/{id}` answers 400 `invalid-request` for a bad body or a `filePath` that is not a candidate, 428 without
  `If-Match`, 412 (with `rowVersion`) on a stale version; re-enabling a
  company returns it to `ambiguous`, `missing` or `active`. A post with another company file open adds one `unavailable`
  attempt and the statement stays pending. Lists sync for a not-ready company answers `409 company-not-ready`.
- **Statement `companyMatch` (API M17).** On a saved statement `companyMatch.candidates` are company ids (`number[]`); only the
  extraction's own `company.candidates` are `{ id, code, displayName }` references. The Choose company dialog reads the ids.
- **Set company and upload save (API M17).** `POST …/company` and `upload.companyId` answer `400 invalid-request` for an unknown,
  missing or disabled company (an `ambiguous` one is accepted); a bad `upload.companyId` is also 400. An upload without
  `companyId` takes the only active company as `default` before it uses the match.
- **Company on lists (API M17).** `company=` that is not a positive integer, or an id no company has, is `400` on lists and
  sync; the history returns an empty page for an unknown id. The dashboard never sends an unknown id (Lists falls back first).
- **Sync now refused by the company's file (API M17 `SyncProblem`, final review fix).** `409 company-file-open-elsewhere` toasts
  `companyFileMessage(p, 'sync')` ("… then sync again."); `503 company-file-unavailable` toasts "QuickBooks couldn't open <file>.
  Check that QuickBooks can open it, then sync again." Both are errors, never retried, and not "still running". The fake API
  answers them from `mockControl.companyOpenElsewhere` / `companyFileUnavailable` and records a `skipped` attempt with that
  reason, as the API does (R-20.2).
- **Not modelled.** `GET /companies` without a database returns only the default company with `folderName: null`, `rowVersion: 0`,
  and the default company of a migrated database may also have a null `folderName`; `Company.folderName` stays typed `string`
  because nothing reads it (a follow-up if the page ever shows it).
- **Older API.** A missing `company` key means "unknown": no hold banner, no column value (a dash), no selectors; a 404 from
  `GET /companies` gives "Companies need a newer API." and hides every company selector.
- **n8n save.** The mock assigns the only active company with `companySource: 'default'` (R-19.1).

**UI**
- **`NativeSelect`, not Radix `Select`.** `CompanySelect` (`src/components/CompanySelect.tsx`) wraps the NativeSelect the rest of
  the app uses. The one new primitive is `radio-group` (Choose file dialog).
- **Companies page.** Admin controls check `requests:admin`; the route and nav entry check `lists:read`; Ctrl K lists it. With the
  root unreachable only the problem and Try again show. Dialogs capture `rowVersion` when opened, so a 412 stays a 412.
  One message builder, `companyFileMessage(p, 'check' | 'post' | 'sync')`, serves the Check access toast, the post failure and
  Sync now. While one Check access runs, Check access is disabled for every company. "Folder missing" and "Disabled" badges
  carry the same icons as the statement page's readiness badge. The file name with the full-path tooltip is keyboard-focusable.
  Match names: Save is disabled (with "Add this name or clear it before saving.") while the "Add a name" box holds text, so a
  typed name is never silently dropped.
- **Statements.** Company chip, Company column (label, "Needs company" badge, or a dash), table min width 1080 px.
- **Statement page.** The hold banner appears only when `company` is `null` and the statement is pending (or `set-company` is
  still in `allowedActions`); a discarded or posted statement without a company shows only the "Needs company" badge. "Choose company" and "Change" show only with
  `set-company` in `allowedActions`. The dialog starts with nothing selected (candidates first, active companies only). While
  no company is set the account and payee cells are locked ("Choose the company first", also in `TxTable`); the transactions dialog
  stays usable (free text, no suggestions). A readiness badge ("Folder missing", "Disabled", access word) shows beside the
  company when it is not ready. Unsaved row edits survive assigning a company.
- **Upload.** `CompanyBlock` beside Reference: matched shows the company, ambiguous or none shows the picker. An older API
  shows the text but no select.
- **Upload name lock (final review ruling).** When the extraction has a company block with `match` `none` or `ambiguous`, the
  user has chosen nothing, and there is more than one assignable (active) company, the payee, account and line account cells
  are locked with "Choose the company first" (as on the statement page), Sync now and the lists status are replaced by that
  hint, and no lists are fetched. While the companies load, the lists wait too. With one assignable company (or the
  companies endpoint failing, or an older API without the block) nothing is locked and the default company's lists are used.
  ~~Consequence: an unmatched upload with an empty account can only be saved after choosing a company (or removing that row).~~
  Superseded 2026-11-04 by "Save before choosing" below.
- **Lists and Home.** Selectors appear only when there is more than one company (Home since the final review fixes). Lists
  waits for `useCompanies` to settle before its first fetch. Home sends the id as a number to the summary and as text to stats
  and the queue list. The `CompanySelect` wrapper is `max-w-full`, so a long name cannot push a 375 px page sideways.
- **Post confirmation (final review ruling).** The dialog title names the company of the version it opened on: "Post 4 rows to
  QuickBooks for S & A Convenience Market LLC?". A statement with no company, or an older API without the key, keeps "Post 4
  rows to QuickBooks?". A reload that changes the company under the open dialog does not change the title.
- **Re-enable state.** A disabled company that is enabled again returns to `ambiguous`, `missing` or `active`, never straight
  to `active` when it had no chosen file.
- **Hooks.** `useStats({ refetchInterval?, company? })`; `listKeys.qb(company?)` and friends include the company;
  `useSyncQbLists(company)` uses `mutationKey: listKeys.sync(company)`.

**Spec conflicts, as resolved** (plan "Spec conflicts found"): 1 and 13 settled (above); 2 ids in URLs; 3 audit labels and
sentences added in Task 1; 5 `namesLocked` in `TxTable`; 6 `companyFileMessage` called from `outcome.ts`, which also maps
`company-required` and `company-not-ready`; 8 statement 14; 10 open (above); 11 no actor; 12 `useStats` options;
14 `CompanyRef[]` for the extraction's candidates (ids on a saved statement, above); 15 Sync now succeeds only for a ready company; 18 NativeSelect.

**Not done / deferred**: the live real-API run (Task 11 steps 1, 2 and the hand checks; needs Docker). See plan §6 for the static
check table's result and the deferred minor review notes.

## 6. Change 2026-11-04: save an unmatched upload before choosing a company

**Problem.** With the upload name lock on, an empty account counted as a required field that blocks Save statement, but the
locked cell could not be filled. So an unmatched upload with any row missing an account could not be saved until a company
was chosen, against §3.5 ("Choosing is optional").

**Decision (owner, 2026-11-04).** Allow saving first. While the names are locked, an empty account does not block Save: it is
marked "Empty (optional)" like payee and line account, the footer does not count it, and the statement is saved on company
hold. The API already accepts this (the upload save does not refuse empty accounts; validation reports them as
`missing-field` after saving, as it does for emailed statements, and the hold stops validate and post anyway). Once a
company is chosen, on the upload or on the statement page, the account is required again. Nothing else changes: date,
amount and kind still block, and the lock itself stays.

**Acceptance.**
1. `saveBlocker(draft, reference, saving, { namesLocked: true })` returns null for a draft whose only gap is an empty account;
   without the option it still returns "Fill in 1 empty required field".
2. Upload page: an unmatched PDF with two companies and rows without an account can be saved without choosing a company or
   deleting rows; the new statement is on company hold and the body carries no `companyId`.
3. Choosing a company on the upload makes the empty account blocking again.

