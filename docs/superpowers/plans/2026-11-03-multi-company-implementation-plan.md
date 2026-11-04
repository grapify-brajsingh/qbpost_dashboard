# Multiple company files (sidebar "Companies") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dashboard a Companies page and make every statement, upload, list, Home figure and audit sentence company-aware, against a fake API that matches R-18, R-19 and R-20.

**Architecture:** First the types (`src/api/schema.ts`), then the fake API (`src/mocks/`), then the React Query hooks (`src/api/queries/`), then the pages. Companies come from `GET /companies` through one shared hook (`useCompanies`), and one shared `CompanySelect` handles every company choice. Statement buttons still come only from `allowedActions` (the API adds `set-company` and leaves out `validate`/`post` while a statement waits for a company). List caches are keyed by company id, so two companies never share lists.

**Tech Stack:** React 19, TypeScript, TanStack Query 5, React Router 7, shadcn/ui (new-york, `radix-ui`), Tailwind v4, MSW, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-multi-company-spec.md` (approved 2026-11-04). Task list: `docs/superpowers/plans/2026-11-03-multi-company-plan.md` (approved). API contract: `D:\qbautopost\qb_post\docs\multi-company-m17.md` (it wins over the spec wherever they differ). Shapes: `docs/api-requirements-for-dashboard.md` R-18, R-19, R-20.

---

## Spec conflicts found

These come from checking the spec against the real code and the contracts. Each one gives the resolution this plan uses. The owner should confirm them before Task 1.

1. **`Company.rowVersion`.** R-18 lists `rowVersion` on `Company`, but the M17 `Company` shape (§5.1) leaves it out, even though `PATCH /companies/{id}` needs `If-Match: "<rowVersion>"`. **Resolution:** keep `rowVersion: number` as R-18 says, and send `If-Match: "<rowVersion>"`. Ask the API side to add it to the M17 shape.
2. **`?company=440` (acceptance criterion 5) against `company=<id>` (R-19.2).** 440 is a company *code*, but the API filters by *id*. **Resolution:** URLs and queries always carry the id. The fixture ids (1–4) are deliberately different from the codes (18 / 440 / 7 / 12), so a mix-up shows in tests. The test for criterion 5 uses `?company=2`, which is the company with code 440.
3. **Exhaustive audit records.** `ACTION_LABEL` and `SENTENCE` in `features/audit/auditSentence.ts` are `Record<AuditAction, …>`. Adding the four audit actions in Task 1 therefore breaks `npm run build` until Task 9, which owns the sentences. **Resolution:** Task 1 adds the four labels and sentences, with their test. Task 9 keeps only the Lists and Home selectors.
4. **Mock record fields and task order.** The approved task list puts `RequestRecord.companyId/companySource` and `ExtractionRecord.company` in Task 2. But records are built in `fixtures/requests.ts`, `handlers/requests.ts` and `handlers/extractions.ts`, which belong to Task 3, so Task 2 would not build. **Resolution:** those record fields move to Task 3. Task 2 keeps the companies table, the per-company lists store and the `mockControl` flags.
5. **Disabled pickers need `TxTable.tsx`.** The spec (§3.4) wants the account and payee pickers disabled with "Choose the company first". The name editor lives in `features/requests/transactions/TxTable.tsx`, which is not in the plan's file list. **Resolution:** Task 7 adds an optional `namesLocked?: string` to `TxEditing` in `TxTable.tsx`.
6. **Post failure message.** Post errors are turned into messages in `features/requests/posting/outcome.ts`, not in `qbListsSync.ts`. **Resolution:** Task 7 adds `companyFileMessage()` to `qbListsSync.ts`, as the plan says, and `outcome.ts` calls it in one new case. That case also maps the 409 codes `company-required` and `company-not-ready`.
7. **`requests.test.ts (query building)`.** No such file exists under `src/api/queries/`. **Resolution:** Task 4 creates `src/api/queries/requests.test.ts`. Separately, every pending statement now carries `set-company` (M17 §4.6: "includes the new `set-company` (for `requests:edit`, while `pending`)"). So Task 3 updates the one exact assertion in `src/mocks/handlers/requests.test.ts:111` to `['edit', 'validate', 'post', 'discard', 'set-company']`.
8. **Seeded statement without a company.** Every existing pending statement is already used by a test that validates or posts it: 13 by `e2e/v2.spec.ts`, 12 by `Posting.test.tsx`, and so on. **Resolution:** add a new statement 14 (pending, uploaded, `company: null`) instead of changing an existing one. Statement 7 (posted) moves to company 2, so the company filter has something to find.
9. **Task 11 command.** `npm run e2e:integration` does not exist. The real-stack suite runs with `npx playwright test -c playwright.integration.config.ts` after starting `docker-compose.integration.yml` (see `README.md`). **Resolution:** Task 11 uses that command.
10. **Audit "event detail".** The Audit page has no detail view; the sentence is the detail. R-18 to R-20 and M17 name the four audit actions but never fix their `detail` shapes. **Resolution:** the fake API uses the shapes listed in Task 3. Each sentence names the company from `detail`, and falls back to a shorter sentence when a field is missing. Ask the API side to confirm the shapes.
11. **Audit sentences have no actor.** The existing sentences leave the actor out, because the table shows it in its own column (`Changed payee on row 7`). The spec's examples include one ("Asha assigned …"). **Resolution:** `Assigned SR-000014 to S & A Convenience Market LLC` and `Scanned the company folder: 2 new`.
12. **`useStats(company?)`.** The existing signature is `useStats(opts: { refetchInterval?: number })`, used by the sidebar, Home and Statements. **Resolution:** `useStats({ refetchInterval?, company? })`.
13. **Where `companyId` goes in the upload save body.** R-19.5 does not say whether it sits at the top level or inside `upload`. The mock's `saveUpload` copies every key except `upload` into the payload. **Resolution (settled with the API plan, 2026-11-04):** send it inside `upload`, as `{ …, upload: { extractionId, companyId } }`. The API reads `upload.companyId` and ignores a top-level field; the mock does the same, so nothing reaches the payload.
14. **`companyMatch.candidates` type** is not fixed for the detail answer; the extraction uses `CompanyRef[]`. **Resolution:** use `CompanyRef[]` in both places.
15. **Sync now for a company that is not ready.** Under M17 §4.7, a list sync for company 440 (*Needs approval*) answers `409 company-not-ready`. So criterion 8 ("Sync now syncs that company") can only succeed for company 18. **Resolution:** the criterion 8 tests show company 2's own names and history, show the company-not-ready message when Sync now is pressed for company 2, and show a successful sync for company 1 sending `company=1`.
16. **Task dependencies.** The approved table says Tasks 6 and 7 depend only on Task 4, but they use `companyLabel`, `CompanySelect` and `AccessBadge` from Task 5. **Resolution:** run Task 5 before Tasks 6 and 7 (the numbering already does this).
17. **The e2e flow has no task.** Plan §3 lists one Playwright flow but no task owns it. **Resolution:** Task 8 writes `e2e/companies.spec.ts`, and Task 10 runs it with the full suite.
18. **"Select" in the spec.** The codebase builds every select with shadcn `NativeSelect`; the Radix `select.tsx` is installed but nothing uses it. **Resolution:** `CompanySelect` wraps `NativeSelect`, which also keeps tests simple with `user.selectOptions`.

## Global Constraints

- The API base is `/api/v2` (`src/api/client.ts`); the `/api/v1` in CLAUDE.md is out of date. Fake API paths are `${API}/…` from `src/mocks/handlers/common.ts`.
- Use shadcn/ui only. The one new primitive is `npx shadcn@latest add radio-group`. Answer **no** to every overwrite. Check that the new file imports `cn` from `@/lib/utils`, imports from `radix-ui` (already a dependency), and adds no package and no `dangerouslySetInnerHTML`.
- Use semantic tokens only (`warning`, `info`, `success`, `destructive`, `muted` and their `-soft` tints). Status is always icon + word. Pages use `.page`. Nothing scrolls sideways at 375 px; wide tables scroll inside `DataPanel` only.
- Statement buttons come only from `allowedActions` (`validate`, `post`, `set-company`). Companies admin controls check `hasScope(me, 'requests:admin')`. The Companies nav entry and route check `hasScope(me, 'lists:read')`.
- Server calls live only in `src/api/queries/`, with `companyKeys = { all: ['companies'] }`. Scan, check and update invalidate `companyKeys.all`. `set-company` and the upload save invalidate `requestKeys.all` and `['audit']`. List keys include the company id.
- Never retry automatically: not Check access, not posting, not sync. `PATCH /companies/{id}` and `POST /saved-requests/{id}/company` always send `If-Match`.
- An older API keeps working. A missing `company` field means "unknown": no column value, no hold banner. A `404` from `GET /companies` means "Companies need a newer API." and no company selectors.
- Problem codes, exactly: `company-required`, `company-not-ready`, `company-file-open-elsewhere` (with `openFile`, `neededFile`), `company-file-unavailable`, `company-root-unavailable`, and `quickbooks-not-open` (503 on check).
- Fixed copy: "Choose the company before validating or posting.", "The printed name on this statement was *X*.", "Choose company", "Needs company", "Validation will be cleared", "Choose the company first", "No company folder is set. Set `Companies:RootFolder` in the API's appsettings.json.", "No company files found in `<root>`. Each company needs its own subfolder with a .qbw file.", "Companies need a newer API.", "More than one company matches", "No company matched the printed name *…*", "No business name was found on the statement", "Read from statement: *…*", "All companies", "No company", "Statements whose printed business name equals one of these are assigned to this company.", "QuickBooks isn't running", access words *Approved*, *Needs approval*, *Not checked*, *File missing*, *Error*, and row badges "Folder missing", "Disabled".
- Fake companies: id 1 `18` Takoma Park Grocery Store Inc (approved, default); id 2 `440` S & A Convenience Market LLC (needs approval); id 3 `7` Sunrise Liquors (ambiguous, two files); id 4 `12` Harbor Deli (missing). Root: `D:\Accountexx Data\Quickbook - Accounting File\Quickbook - Accounting File`.
- Tests sit next to the code they test. Page tests use `renderApp(route)`, `mockControl.signInAs('u-viewer' | 'u-editor' | 'u-admin')`, `server.use(…)` for one-off answers, and `vi.mock('sonner', …)` to assert toasts.
- Rule 3: **no commits** in any task. The owner commits when they ask. Every task ends with `npx vitest run <its test files>`, `npm run lint` and `npm run build`.

## Review Focus

1. **Older API with no M17.** Detail and list rows have no `company` key, and `GET /companies` answers 404. Expected: no hold banner, Validate and Post exactly as before, Lists and Home show no selector and load the default lists, and the Statements page has no Company chip. (Tests in Tasks 7 and 9.)
2. **A company id in the URL that no longer exists** (for example a bookmarked `/lists?company=99`). Expected: the Lists page falls back to the default company, sends no unknown id, and the selector shows the default. (Test in Task 9.)
3. **Unsaved edits when the company changes.** The user has unsaved row edits, then assigns a company. Expected: the edits stay on screen, still marked dirty, and Save still works with the new ETag. (Test in Task 7.)
4. **`company-file-open-elsewhere` without `openFile`** (the SDK cannot always name the open file). Expected: a sentence that still reads well and names the needed file: "Another company file is open in QuickBooks — close it or open Takoma Park Grocery Store Inc.qbw, then check again." (Tests in Tasks 5 and 7.)
5. **Blank, padded or duplicate match names** ("  Zemen Market ", "zemen market"). Expected: names are trimmed, blanks are refused, and a name equal to an existing one (ignoring case) is not added twice. (Test in Task 5.)

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `src/api/schema.ts` | 1 | Company types, statement and extraction fields, `set-company`, four audit actions |
| `src/features/audit/auditSentence.ts` (+ test) | 1 | Labels and sentences for the four actions (conflict 3) |
| `src/mocks/fixtures/companies.ts` | 2 | The four companies, the root, per-company list fixtures |
| `src/mocks/db.ts` | 2, 3 | `companies`, `companyRoot`, `companyLists`, `companyAudit`, `mockControl` flags (2); record fields (3) |
| `src/mocks/handlers/companies.ts`, `handlers/index.ts` | 2 | R-18 routes |
| `src/mocks/handlers/{requests,requestHelpers,extractions,support,dashboard,audit}.ts`, `mocks/audit.ts`, `fixtures/{requests,lists}.ts` | 3 | R-19 and R-20 |
| `src/api/queries/companies.ts` | 4 | `companyKeys`, `useCompanies`, `useScanCompanies`, `useCheckCompany`, `useUpdateCompany` |
| `src/api/queries/{requests,lists,extractions,home}.ts` | 4 | `company` params and keys, `useSetCompany` |
| `src/features/companies/*` | 5 | Page, table, badge, help, the two dialogs, pure view helpers |
| `src/components/CompanySelect.tsx` | 5 | The shared company select |
| `src/router.tsx`, `src/layout/{AppSidebar,CommandMenu}.tsx` | 5 | Route, nav, Ctrl K |
| `src/features/statements/list/*` | 6 | Column, chip, stats by company |
| `src/features/statements/detail/{StatementPage,StatementHeader}.tsx`, `features/requests/detail/CompanyHoldBanner.tsx`, `features/requests/dialogs/ChooseCompanyDialog.tsx`, `features/requests/transactions/{QbListsStatus,TransactionsTab,TxTable,qbListsSync}.ts(x)`, `features/requests/posting/outcome.ts` | 7 | Statement page |
| `src/features/statements/upload/{ReviewEditor,CompanyBlock}.tsx`, `e2e/companies.spec.ts` | 8 | Upload review, e2e flow |
| `src/features/lists/{ListsPage,SyncHistory}.tsx`, `src/features/home/HomePage.tsx` | 9 | Selectors |
| docs | 10 | As built |

---

### Task 1: Types in `schema.ts` (+ the four audit sentences)

**Files:**
- Modify: `src/api/schema.ts`
- Modify: `src/features/audit/auditSentence.ts`
- Test: `src/features/audit/auditSentence.test.ts`

**Interfaces:**
- Produces (all in `src/api/schema.ts`):
  ```ts
  export type CompanyState = 'active' | 'ambiguous' | 'missing' | 'disabled'
  export type CompanyAccess = 'unchecked' | 'approved' | 'needs-approval' | 'file-not-found' | 'error'
  export type CompanySource = 'matched' | 'chosen' | 'migrated' | 'default'
  export interface CompanyRef { id: number; code: string | null; displayName: string }
  export interface Company extends CompanyRef {
    folderName: string; fileName: string | null; filePath: string | null; state: CompanyState
    candidateFiles: string[]; access: CompanyAccess; accessCheckedUtc: string | null; accessMessage: string | null
    qbCompanyName: string | null; qbLegalName: string | null; matchNames: string[]; isDefault: boolean
    rowVersion: number; lists: { syncedUtc: string | null; outcome: QbListSync['outcome'] | null } | null; waitingCount: number
  }
  export interface CompaniesResponse { rootFolder: string | null; rootConfigured: boolean; rootReachable: boolean; lastScanUtc: string | null; items: Company[] }
  export interface CompanyScanResult { added: number; updated: number; missing: number; ambiguous: number; noCompanyFile: string[]; items: Company[] }
  export interface CompanyPatch { matchNames?: string[]; filePath?: string; disabled?: boolean }
  export interface CompanyMatch { match: 'matched' | 'none' | 'ambiguous'; printedName: string | null; dbaName: string | null; candidates: CompanyRef[] }
  export interface ExtractionCompany extends CompanyMatch { companyId: number | null }
  ```
  - `Action` gains `'set-company'`.
  - `RequestSummary` gains `company?: CompanyRef | null` and `companySource?: CompanySource | null`. Both are optional so that a missing key on an older API means "unknown".
  - `RequestDetail` gains `companyMatch?: CompanyMatch | null`.
  - `Stats` gains `needsCompany?: number`.
  - `Extraction` gains `company?: ExtractionCompany`.
  - `AuditEvent` gains `companyId?: number | null`.
  - `AUDIT_ACTIONS` gains `'companies-scanned'`, `'company-checked'`, `'company-updated'`, `'company-assigned'`, placed under a comment `// Multiple company files (R-18, R-19).`
- Detail shapes the sentences read (conflict 10; Task 3's mock writes them):
  - `companies-scanned`: `{ added, updated, missing, ambiguous }`
  - `company-checked`: `{ company: CompanyRef, access }`
  - `company-updated`: `{ company: CompanyRef, fields: string[] }`
  - `company-assigned`: `{ from: CompanyRef | null, to: CompanyRef, source }`

- [ ] **Step 1: Write the failing test** in `auditSentence.test.ts`. Use the existing `ev()` helper and add:

```ts
it('reads the company actions (R-18, R-19)', () => {
  const sa = { id: 2, code: '440', displayName: 'S & A Convenience Market LLC' }
  const takoma = { id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' }
  const request = { id: 14, publicRef: 'SR-000014', reference: null, pushId: null, emailSubject: null }
  expect(auditSentence(ev('company-assigned', { request, detail: { from: null, to: sa, source: 'chosen' } }))).toBe('Assigned SR-000014 to S & A Convenience Market LLC')
  expect(auditSentence(ev('company-assigned', { request, detail: { from: takoma, to: sa } }))).toBe('Assigned SR-000014 to S & A Convenience Market LLC (was Takoma Park Grocery Store Inc)')
  expect(auditSentence(ev('company-assigned'))).toBe('Assigned the statement to a company')
  expect(auditSentence(ev('companies-scanned', { detail: { added: 2, updated: 0, missing: 1, ambiguous: 0 } }))).toBe('Scanned the company folder: 2 new, 1 missing')
  expect(auditSentence(ev('companies-scanned', { detail: { added: 0, updated: 0, missing: 0, ambiguous: 0 } }))).toBe('Scanned the company folder: no changes')
  expect(auditSentence(ev('company-checked', { detail: { company: takoma, access: 'approved' } }))).toBe('Checked QuickBooks access to Takoma Park Grocery Store Inc: approved')
  expect(auditSentence(ev('company-checked', { detail: { company: sa, access: 'needs-approval' } }))).toBe('Checked QuickBooks access to S & A Convenience Market LLC: needs approval')
  expect(auditSentence(ev('company-updated', { detail: { company: sa, fields: ['matchNames'] } }))).toBe('Updated company S & A Convenience Market LLC')
})
```

The existing test "every AUDIT_ACTIONS value has a sentence and a label" then covers the labels.

- [ ] **Step 2: Run it to make sure it fails.** Run `npx vitest run src/features/audit/auditSentence.test.ts`. Expected: FAIL, because `'company-assigned'` is not an `AuditAction` (type error) or the sentence falls back to the raw value.
- [ ] **Step 3: Add the types to `schema.ts` as listed above.** Then add the labels `'companies-scanned': 'Companies scanned'`, `'company-checked': 'Access checked'`, `'company-updated': 'Company updated'`, `'company-assigned': 'Company assigned'` and the four `SENTENCE` entries to `auditSentence.ts`. Scan parts are `added` → "N new", `updated` → "N updated", `missing` → "N missing", `ambiguous` → "N with several files". Zero counts are left out; all zero reads "no changes". Access words come from `access.replace('-', ' ')`. Read names through the existing `str()` helper only, as text.
- [ ] **Step 4: Run the test to make sure it passes.** Run `npx vitest run src/features/audit/auditSentence.test.ts`. Expected: PASS.
- [ ] **Step 5: Verify.** Run `npm run lint` (no errors) and `npm run build` (exit 0).

---

### Task 2: Fake companies API (R-18)

**Files:**
- Create: `src/mocks/fixtures/companies.ts`
- Create: `src/mocks/handlers/companies.ts`
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/handlers/index.ts`
- Test: `src/mocks/handlers/companies.test.ts`

**Interfaces:**
- Consumes: `Company`, `CompaniesResponse`, `CompanyScanResult`, `CompanyPatch`, `ExtractionCompany` (Task 1).
- Produces, in `fixtures/companies.ts`:
  - `COMPANY_ROOT`, the root path from Global Constraints.
  - `DEFAULT_COMPANY_ID = 1`.
  - `type CompanyRecord = Omit<Company, 'lists' | 'waitingCount'>`.
  - `buildCompanies(): CompanyRecord[]`, the four fixtures:
    - id 1: `folderName '18_Takoma Park Grocery Store Inc'`, `fileName 'Takoma Park Grocery Store Inc.qbw'`, `qbCompanyName 'Zemen Market'`, `matchNames ['Zemen Market']`, approved, `isDefault: true`.
    - id 2: `440`, `'S & A Convenience Market LLC.qbw'`, `needs-approval`, `matchNames []`.
    - id 3: `7`, state `ambiguous`, `fileName`/`filePath` null, `candidateFiles ['Sunrise Liquors.qbw', 'Sunrise Liquors 2024.qbw']`, `unchecked`.
    - id 4: `12` Harbor Deli, state `missing`, access `file-not-found`.
    - Every `rowVersion` is 1, and `filePath = \`${COMPANY_ROOT}\\${folderName}\\${fileName}\``.
  - `buildCompanyLists(): Record<number, { lists: QbLists; accountTypes: Record<string, string>; listSyncs: QbListSyncRun[] }>` for ids 2–4. Company 2 gets its own small synced lists: accounts `['SA Operating 7731', 'SA Card 0440']`, vendors `['Coastal Beverage Supply', 'Metro Tobacco Wholesale']`, customers `['Walk-in Customers']`, and two seeded syncs. Ids 3 and 4 get empty, never-synced lists with no syncs.
- Produces, in `db.ts`:
  - On `mockDb`:
    - `companies: CompanyRecord[]`
    - `companyRoot: { rootFolder: string | null; lastScanUtc: string | null }` (default `{ rootFolder: COMPANY_ROOT, lastScanUtc: <5 min ago> }`)
    - `companyLists` (from `buildCompanyLists`)
    - `companyAudit: { id: number; action: AuditAction; atUtc: string; actor: Actor; companyId: number | null; detail: Record<string, unknown> }[]`
    - all of these reset in `reset()`.
  - Company 1's lists stay in `mockDb.lists`, `accountTypes` and `listSyncs`, so existing tests keep working.
  - On `mockControl`, each reset in `reset()`:
    - `companyRootMissing: boolean`
    - `companyOpenElsewhere: string | null` (the file name QuickBooks has open)
    - `scanAdds: string[]` (folder names the next scan finds, for example `'22_Harbor Deli East'`)
    - `nextMatch: ExtractionCompany | null`
- Produces, in `handlers/companies.ts`: `companyHandlers` and the helpers that Task 3 uses:
  - `companyRef(id: number | null): CompanyRef | null`
  - `findCompany(id: number): CompanyRecord | undefined`
  - `isReady(c: CompanyRecord): boolean` (`state === 'active' && access === 'approved'`)
  - `toCompany(c: CompanyRecord): Company` (adds `lists` from that company's newest sync and `waitingCount` = pending requests with that `companyId`)
  - `recordCompanyAudit(action, user, companyId, detail)`
- Routes (via `authenticate`, `problem`, `parseIfMatch` from `common.ts`):
  - `GET ${API}/companies` (`lists:read`). Answers `{ rootFolder, rootConfigured: rootFolder !== null, rootReachable: !mockControl.companyRootMissing, lastScanUtc, items }`, with items in id order.
  - `POST ${API}/companies/scan` (`requests:admin`):
    - root missing → `503 company-root-unavailable` (detail = the path).
    - Otherwise each `scanAdds` folder becomes an `active`/`unchecked` company: `code` = leading digits before `_` (else null), `displayName` = the rest, file `<displayName>.qbw`. Clear `scanAdds`, set `lastScanUtc`, and answer `{ added, updated: 0, missing: 0, ambiguous: 0, noCompanyFile: [], items }`.
    - Audit `companies-scanned` with those counts.
  - `POST ${API}/companies/:id/check` (`requests:admin`). Unknown id → 404. The rules, in order:
    1. `companyOpenElsewhere` set and different from the company's `fileName` → `409 company-file-open-elsewhere` with `{ openFile, neededFile: fileName }`.
    2. `mockControl.qbNotOpen` → `503 quickbooks-not-open`.
    3. State `ambiguous` or `disabled` → `409 company-not-ready` with `{ state, access }`.
    4. State `missing` → access `file-not-found`.
    5. Otherwise → `approved`.
    - Steps 4 and 5 set `accessCheckedUtc` and bump `rowVersion`. The answer is `toCompany`. Audit `company-checked`.
  - `PATCH ${API}/companies/:id` (`requests:admin`):
    - No `If-Match` → `428 precondition-required`. Stale → `412 edited-by-someone-else`.
    - `filePath` must be one of `candidateFiles`, otherwise `400 invalid-file`. A valid one sets `fileName`/`filePath`, clears `candidateFiles` and sets `state: 'active'`.
    - `disabled: true` sets `'disabled'`; `false` sets `'active'`.
    - `matchNames` replaces the list.
    - Bump `rowVersion` and audit `company-updated` with `fields`.

- [ ] **Step 1: Write the failing tests.** Copy the `fetch` + `signInAs` pattern from `support.test.ts`, with `call(path, init)` adding the bearer token.

```ts
describe('GET /companies (R-18)', () => {
  it('lists the four fixture companies with codes 18, 440, 7 and 12', async () => {
    const body = (await (await call('/companies')).json()) as CompaniesResponse
    expect(body).toMatchObject({ rootConfigured: true, rootReachable: true })
    expect(body.items.map((c) => [c.id, c.code, c.state, c.access])).toEqual([
      [1, '18', 'active', 'approved'], [2, '440', 'active', 'needs-approval'], [3, '7', 'ambiguous', 'unchecked'], [4, '12', 'missing', 'file-not-found'],
    ])
    expect(body.items[0]).toMatchObject({ isDefault: true, matchNames: ['Zemen Market'], rowVersion: 1 })
    expect(body.items[2].candidateFiles).toHaveLength(2)
  })
  it('a viewer gets 200 here and 403 on scan, check and PATCH', async () => { /* signInAs('u-viewer'); statuses 200, 403, 403, 403 */ })
})
describe('POST /companies/scan', () => {
  it('adds the folders in scanAdds and a second scan reports added 0', async () => {
    mockControl.scanAdds = ['22_Harbor Deli East']
    const first = (await (await call('/companies/scan', { method: 'POST' })).json()) as CompanyScanResult
    expect(first.added).toBe(1)
    expect(first.items.at(-1)).toMatchObject({ code: '22', displayName: 'Harbor Deli East', state: 'active', access: 'unchecked' })
    expect(((await (await call('/companies/scan', { method: 'POST' })).json()) as CompanyScanResult).added).toBe(0)
  })
  it('answers 503 company-root-unavailable with the path when the root is missing', async () => {
    mockControl.companyRootMissing = true
    const res = await call('/companies/scan', { method: 'POST' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'company-root-unavailable', detail: expect.stringContaining('Quickbook - Accounting File') })
  })
})
describe('POST /companies/{id}/check', () => {
  it('approves 440 and records company-checked', async () => { /* 200, access 'approved', mockDb.companyAudit.at(-1).action === 'company-checked' */ })
  it('answers 409 company-file-open-elsewhere naming both files and changes nothing', async () => {
    mockControl.companyOpenElsewhere = 'S & A Convenience Market LLC.qbw'
    const res = await call('/companies/1/check', { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'company-file-open-elsewhere', openFile: 'S & A Convenience Market LLC.qbw', neededFile: 'Takoma Park Grocery Store Inc.qbw' })
    expect(mockDb.companies[0].rowVersion).toBe(1)
  })
  it('answers 503 quickbooks-not-open when QuickBooks is closed', async () => { /* mockControl.qbNotOpen = true */ })
})
describe('PATCH /companies/{id}', () => {
  it('needs If-Match (428), refuses a stale one (412), saves matchNames with the current one', async () => { /* … */ })
  it('choosing one of the candidate files makes the ambiguous company active; another path is 400', async () => { /* id 3 */ })
})
```

- [ ] **Step 2: Run the tests to make sure they fail.** Run `npx vitest run src/mocks/handlers/companies.test.ts`. Expected: FAIL (404 from MSW / module not found).
- [ ] **Step 3: Implement** the fixtures, the `db.ts` fields and flags, `handlers/companies.ts` and its entry in `handlers/index.ts`, as listed in Interfaces.
- [ ] **Step 4: Run the tests to make sure they pass.** Run `npx vitest run src/mocks/handlers/companies.test.ts`. Expected: PASS.
- [ ] **Step 5: Verify.** Run `npm run lint` and `npm run build`. Expected: both clean.

---

### Task 3: Fake API for statements, extraction, lists, summary and audit (R-19, R-20)

**Files:**
- Modify: `src/mocks/db.ts` (`RequestRecord.companyId: number | null`, `companySource: CompanySource | null`, `companyMatch: CompanyMatch | null`, `ExtractionRecord.company: ExtractionCompany`; conflict 4)
- Modify: `src/mocks/fixtures/requests.ts`, `src/mocks/fixtures/lists.ts`
- Modify: `src/mocks/handlers/{requestHelpers,requests,extractions,support,dashboard,audit}.ts`, `src/mocks/audit.ts`
- Modify: `src/mocks/handlers/requests.test.ts:111`
- Create: `src/mocks/handlers/companyScoped.test.ts`

**Interfaces:**
- Consumes: the Task 2 helpers `findCompany`, `companyRef`, `isReady`, `DEFAULT_COMPANY_ID`, `mockDb.companyLists`, `mockControl.{companyOpenElsewhere,nextMatch}`.
- Produces:
  - **Fixtures.** `build()` defaults to `companyId: 1, companySource: 'migrated', companyMatch: null`. Statement 7 gets `companyId: 2`. A new **statement 14** is pending, uploaded by Eli Editor, `email: null`, `upload.fileName 'Credit card 440 ; S & A CONVENIENCE MARKET LLC.pdf'`, `createdUtc '2026-10-20T09:00:00Z'`, 4 rows from `makeRows(4, 14)`, `companyId: null`, `companySource: null`, `companyMatch: { match: 'none', printedName: 'SA CONVENIENCE MARKET', dbaName: null, candidates: [] }`.
  - **`requestHelpers.ts`:**
    - `listsFor(companyId: number | null | undefined): { lists: QbLists; accountTypes: Record<string, string>; listSyncs: QbListSyncRun[] }`. `null`/`undefined`/`1` give the default company's `mockDb` fields; any other id gives `mockDb.companyLists[id]`.
    - `allowedActionsFor(status: RequestStatus, role: Role, companyId: number | null): Action[]`. For a pending statement, editors and admins get `['edit', 'validate', 'post', 'discard', 'set-company']` when `companyId` is set and `isReady(findCompany(companyId))`. Otherwise they get `['edit', 'discard', 'set-company']`. Every other branch is unchanged.
    - `toSummary` adds `company: companyRef(r.companyId)` and `companySource`. `toDetail` adds `companyMatch`.
    - `listRequests` accepts `company=<id>|none` (any other value → 400 `invalid-query`).
    - `stats(company?: string)` filters the same way and adds `needsCompany` (pending with `companyId === null`, counted over everything the filter keeps).
    - `revalidate` and `createRecord` validate against `listsFor(r.companyId).lists`.
  - **`requests.ts`:**
    - `GET /saved-requests/stats` passes `?company`.
    - validate and post first answer `409 company-required` when `companyId === null`, then `409 company-not-ready` with `{ state, access }` when the company is not ready. Both checks come before the status check.
    - Post: when `mockControl.companyOpenElsewhere` is set and differs from the company's `fileName`, add an attempt with outcome `unavailable` (status stays `pending`) and answer `409 company-file-open-elsewhere` with `{ openFile, neededFile, attemptId }`. Never retry.
    - New `POST ${API}/saved-requests/:id/company` (`requests:edit`):
      - No `If-Match` → 428; status not `pending` → `409 invalid-state`; stale → 412.
      - `companyId` must be an `active` company, otherwise `400 invalid-company`.
      - On success: set `companyId` and `companySource: 'chosen'`, clear validation (`r.validation = { state: 'ok' }`, which `validationSummaryOf` reports as `none`), call `touch()` (bumps `rowVersion`), add event `company-assigned` with `{ from, to, source: 'chosen' }`, and answer `detailResponse`.
    - `saveUpload` reads `upload.companyId` (conflict 13). The company is the sent `upload.companyId` (`chosen`), else the extraction's `companyId` when `match === 'matched'` (`matched`), else `null`. `companyMatch` is copied from the extraction without `companyId`.
    - `saveRequest` (n8n): `companyId` is the only active company when exactly one is active, otherwise `null`.
  - **`extractions.ts`:** the extraction `company` is `mockControl.nextMatch`, used once and then cleared. Without it: `{ match: 'none', printedName: null, dbaName: null, companyId: null, candidates: [] }`.
  - **`support.ts`:** the three list routes read `company` from the query (`SYNC_PARAMS` gains `'company'`). Unknown id → 404. The routes use `listsFor(company)`. Sync for a company that is not ready → `409 company-not-ready` with `{ state, access }`. `listsBody` and `record` take the company's store.
  - **`mocks/audit.ts`:** `REQUEST_EVENT_ACTIONS['company-assigned'] = 'company-assigned'`. Every derived event carries `companyId: r.companyId`. `mockDb.companyAudit` rows join the feed for every role.
  - **`handlers/audit.ts` and `dashboard.ts`:** accept `company=<id>` and keep only events or requests with that `companyId`. Without it, everything counts, as before.

- [ ] **Step 1: Update the exact assertion** in `requests.test.ts:111` to `['edit', 'validate', 'post', 'discard', 'set-company']` (conflict 7). Then write `companyScoped.test.ts`, with helpers as in `requests.v2.test.ts` (`call`, `list`, `detail`):

```ts
describe('company on statements (R-19)', () => {
  it('rows carry company and companySource; 14 has none and offers set-company without validate or post', async () => {
    const rows = await list()
    expect(rows.find((r) => r.id === 1)).toMatchObject({ company: { id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' }, companySource: 'migrated' })
    const { body } = await detail(14)
    expect(body.company).toBeNull()
    expect(body.companyMatch).toMatchObject({ match: 'none', printedName: 'SA CONVENIENCE MARKET' })
    expect(body.allowedActions).toEqual(['edit', 'discard', 'set-company'])
  })
  it('filters by company=2 and company=none; stats count needsCompany', async () => {
    expect((await list('company=2')).map((r) => r.id)).toEqual([7])
    expect((await list('company=none')).map((r) => r.id)).toEqual([14])
    const stats = (await (await call('/saved-requests/stats?company=none')).json()) as Stats
    expect(stats.needsCompany).toBe(1)
    expect((await call('/saved-requests?company=abc')).status).toBe(400)
  })
  it('validate and post answer 409 company-required without a company', async () => { /* both 409, code 'company-required' */ })
  it('a statement of a company that is not approved gets 409 company-not-ready with state and access', async () => {
    mockDb.requests.find((r) => r.id === 2)!.companyId = 2
    const res = await call('/saved-requests/2/validate', { method: 'POST' })
    expect(await res.json()).toMatchObject({ status: 409, code: 'company-not-ready', state: 'active', access: 'needs-approval' })
  })
  it('POST /company assigns, clears validation, records company-assigned, and then validate is allowed', async () => {
    const { etag } = await detail(14)
    const res = await call('/saved-requests/14/company', { method: 'POST', headers: { 'If-Match': etag }, body: JSON.stringify({ companyId: 1 }) })
    const body = (await res.json()) as RequestDetail
    expect(body).toMatchObject({ company: { id: 1 }, companySource: 'chosen', validationSummary: { state: 'none' } })
    expect(body.allowedActions).toContain('validate')
    expect(mockDb.requests.find((r) => r.id === 14)!.events.at(-1)).toMatchObject({ kind: 'company-assigned', detail: { from: null, to: { id: 1 } } })
  })
  it('POST /company: 428 without If-Match, 412 stale, 400 for a missing company (id 4)', async () => { /* … */ })
  it('a post while another company file is open is refused with both files and an unavailable attempt, never retried', async () => {
    mockControl.companyOpenElsewhere = 'S & A Convenience Market LLC.qbw'
    // statement 1 (company 1): POST /post with its ETag, as Posting tests do
    // expect 409, code company-file-open-elsewhere, openFile, neededFile 'Takoma Park Grocery Store Inc.qbw'
    // expect record(1).attempts.at(-1).outcome === 'unavailable' and record(1).status === 'pending', exactly one new attempt
  })
})
describe('upload and extraction (R-19.5, R-20.1)', () => {
  it('the extraction carries company from nextMatch once, then none', async () => { /* … */ })
  it('a saved upload takes the sent companyId as chosen and keeps it out of the payload', async () => {
    // extract, then POST /saved-requests { reference, controlTotal, transactions, upload: { extractionId, companyId: 2 } }
    // expect body.company.id === 2, companySource 'chosen', and 'companyId' not in the record's version payloads
  })
  it('a matched extraction saved without companyId gets the match as matched; none saves company null', async () => { /* … */ })
})
describe('company-scoped lists, summary and audit (R-20)', () => {
  it('company=2 lists differ from the default; a sync of 2 is 409 company-not-ready; a sync of 1 leaves 2 untouched', async () => {
    const two = (await (await call('/quickbooks/lists?company=2')).json()) as QbListsResponse
    expect(two.vendors).toContain('Coastal Beverage Supply')
    expect((await call('/quickbooks/lists/sync?company=2', { method: 'POST' })).status).toBe(409)
    const before = mockDb.companyLists[2].listSyncs.length
    expect((await call('/quickbooks/lists/sync?company=1', { method: 'POST' })).status).toBe(200)
    expect(mockDb.companyLists[2].listSyncs).toHaveLength(before)
    expect(((await (await call('/quickbooks/lists/syncs?company=2')).json()) as Page<QbListSyncRun>).total).toBe(before)
  })
  it('audit-events and dashboard/summary accept company; events carry companyId', async () => { /* company=2 → every item.companyId === 2 */ })
})
```

- [ ] **Step 2: Run the tests to make sure they fail.** Run `npx vitest run src/mocks/handlers/companyScoped.test.ts src/mocks/handlers/requests.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** everything listed under Produces.
- [ ] **Step 4: Run every mock test to make sure company-free answers are still valid.** Run `npx vitest run src/mocks`. Expected: PASS, including every untouched existing test.
- [ ] **Step 5: Verify.** Run `npm run lint` and `npm run build`.

---

### Task 4: Query hooks and keys

**Files:**
- Create: `src/api/queries/companies.ts`
- Modify: `src/api/queries/{requests,lists,extractions,home}.ts`
- Modify (call sites, same behaviour): `src/features/requests/transactions/{QbListsStatus,TransactionsTab}.tsx`, `src/features/statements/upload/ReviewEditor.tsx`, `src/features/lists/{ListsPage,SyncHistory}.tsx`
- Create: `src/api/queries/requests.test.ts`
- Modify: `src/api/queries/lists.test.tsx`

**Interfaces:**
- Consumes: Task 1 types; the Task 2 and Task 3 routes.
- Produces:
  - **`companies.ts`:**
    ```ts
    export const companyKeys = { all: ['companies'] as const }
    /** null = an API without M17 (404). Never retried on 4xx. */
    export function useCompanies(): UseQueryResult<CompaniesResponse | null>
    export function useScanCompanies(): UseMutationResult<CompanyScanResult, Error, void>   // mutationKey ['companies', 'scan']
    export function useCheckCompany(): UseMutationResult<Company, Error, { id: number }>     // retry: false
    export function useUpdateCompany(): UseMutationResult<Company, Error, { id: number; rowVersion: number; patch: CompanyPatch }>  // If-Match: "<rowVersion>"
    ```
    All three mutations invalidate `companyKeys.all` and `['audit']` when they settle.
  - **`requests.ts`:**
    - `ListParams.company?: string` (`'<id>'` or `'none'`). `listQuery` sets `company`.
    - `requestKeys.stats(company?: string)` is `[...all, 'stats']` without a company and `[...all, 'stats', company]` with one.
    - `useStats(opts: { refetchInterval?: number; company?: string } = {})`.
    - ```ts
      export function useSetCompany(id: string): UseMutationResult<RequestWithEtag, Error, { companyId: number; etag: string }>
      ```
      `POST /saved-requests/{id}/company` with `If-Match`. On success it puts the detail into the cache when an ETag came back, then invalidates `requestKeys.all` and `['audit']`. On error it invalidates the detail.
  - **`lists.ts`**: `undefined` means "the API's default company" (no `company=` sent).
    ```ts
    export const listKeys = {
      all: ['quickbooks', 'lists'] as const,
      qb: (company?: number) => ['quickbooks', 'lists', 'names', company ?? 'default'] as const,
      sync: (company?: number) => ['quickbooks', 'lists', 'sync', company ?? 'default'] as const,
      syncsAll: ['quickbooks', 'lists', 'syncs'] as const,
      syncs: (company: number | undefined, f: QbListSyncFilters) => ['quickbooks', 'lists', 'syncs', company ?? 'default', f] as const,
    }
    export function useQbLists(company?: number, opts?: { enabled?: boolean })
    export function useQbListsDetail(company?: number, opts?: { enabled?: boolean })
    export function useQbListSyncs(company: number | undefined, f: QbListSyncFilters)
    export function useSyncQbLists(company?: number)              // POST /quickbooks/lists/sync?company=<id>
    export function startQbListRechecks(qc: QueryClient, company?: number)
    ```
  - **`extractions.ts`:** `SaveUploadBody.companyId?: number`, sent as `upload.companyId` only when it is defined.
  - **`home.ts`:**
    - `SummaryParams.company?: number`, added to `summaryUrl`.
    - `useAuditCounts(current, previous, { enabled, company })` and `useAuditTrend(range, { enabled, company })` add `company` to `auditUrl`.
    - `homeKeys.counts(current, previous, company?)` and `homeKeys.trend(range, company?)`.
  - Call sites switch mechanically to the new signatures (`useQbLists(undefined, { enabled })`, `listKeys.sync()`, `useQbListSyncs(undefined, f)`). There is no behaviour change in this task.

- [ ] **Step 1: Write the failing tests.**

```ts
// src/api/queries/requests.test.ts
import { listQuery, requestKeys } from './requests'
test('listQuery sends company=<id> and company=none, and nothing when unset', () => {
  expect(new URLSearchParams(listQuery({ company: '2' })).get('company')).toBe('2')
  expect(new URLSearchParams(listQuery({ company: 'none' })).get('company')).toBe('none')
  expect(listQuery({ status: ['pending'] })).not.toContain('company')
})
test('stats keys: one per company, all-companies key unchanged', () => {
  expect(requestKeys.stats()).toEqual(['requests', 'stats'])
  expect(requestKeys.stats('2')).toEqual(['requests', 'stats', '2'])
})
```

```ts
// lists.test.tsx: switch listKeys.qb → listKeys.qb() in the existing tests, then add
test('two companies never share a lists cache entry, and the request names the company', async () => {
  const seen: (string | null)[] = []
  server.use(http.get('/api/v2/quickbooks/lists', ({ request }) => { seen.push(new URL(request.url).searchParams.get('company')); return undefined }))
  const { qc, wrapper } = setup()
  const { result } = renderHook(() => ({ one: useQbListsDetail(1), two: useQbListsDetail(2) }), { wrapper })
  await waitFor(() => expect(result.current.two.data).toBeDefined())
  expect(seen.sort()).toEqual(['1', '2'])
  expect(qc.getQueryData<QbListsResponse>(listKeys.qb(2))?.vendors).toContain('Coastal Beverage Supply')
  expect(qc.getQueryData<QbListsResponse>(listKeys.qb(1))?.vendors).not.toContain('Coastal Beverage Supply')
})
test('useSyncQbLists(1) posts company=1 and updates only that cache entry', async () => { /* … */ })
```

- [ ] **Step 2: Run the tests to make sure they fail.** Run `npx vitest run src/api/queries/requests.test.ts src/api/queries/lists.test.tsx`. Expected: FAIL (`company` not sent; `listKeys.qb` is not a function).
- [ ] **Step 3: Implement** the hooks and keys, and update the call sites.
- [ ] **Step 4: Run the tests to make sure they pass, and the callers' tests still do.** Run `npx vitest run src/api/queries src/features/lists src/features/requests/transactions src/features/statements/upload`. Expected: PASS.
- [ ] **Step 5: Verify.** Run `npm run lint` and `npm run build`.

---

### Task 5: Companies page, `CompanySelect`, route, sidebar, Ctrl K

**Files:**
- Run: `npx shadcn@latest add radio-group` → `src/components/ui/radio-group.tsx` (check it as Global Constraints say)
- Create: `src/components/CompanySelect.tsx`
- Create: `src/features/companies/{CompaniesPage,CompaniesTable,AccessBadge,ApprovalHelp,MatchNamesDialog,ChooseFileDialog}.tsx`, `src/features/companies/companiesView.ts`
- Modify: `src/router.tsx` (child route beside `/lists`), `src/layout/AppSidebar.tsx` (Work group, after Lists), `src/layout/CommandMenu.tsx` (`PAGES`)
- Test: `src/features/companies/companiesView.test.ts`, `src/features/companies/CompaniesPage.test.tsx`

**Interfaces:**
- Consumes: the `companies.ts` hooks (Task 4) and `outcomeView` from `features/lists/qbListsView.ts`.
- Produces:
  - **`companiesView.ts`** (pure; Tasks 6–9 import from it):
    ```ts
    export function companyLabel(c: Pick<CompanyRef, 'code' | 'displayName'>): string   // '18 · Takoma Park Grocery Store Inc'; displayName alone when code is null
    export function isCompanyReady(c: Pick<Company, 'state' | 'access'>): boolean        // active + approved
    export function assignableCompanies(items: readonly Company[], firstIds?: readonly number[]): Company[]  // state 'active'; firstIds first, then by code (numeric), then name
    export function defaultCompanyId(r: CompaniesResponse | null | undefined): number | undefined
    export function sortCompanies(items: readonly Company[]): Company[]                  // missing/disabled last, else by code then name
    export function accessView(a: CompanyAccess): { label: string; variant: 'success' | 'warning' | 'muted' | 'danger'; icon: LucideIcon }
    export function fileText(c: Company): string                                        // ambiguous → `${n} files — choose one`, else fileName ?? '—'
    export function scanToastText(r: CompanyScanResult): string                         // 'Found 2 new, 1 missing' | 'No changes'
    export function checkAccessToast(result: Company | unknown): { level: 'success' | 'warning' | 'error'; text: string }
    export function cleanMatchName(raw: string, existing: readonly string[]): string | null  // trimmed; null when blank or a case-insensitive repeat
    export function rootUnreachableError(rootFolder: string): ApiError                  // { title: "Can't reach the company folder", status: 503, detail: rootFolder }, shown by ProblemAlert
    ```
    - `accessView` labels: `approved` → *Approved* (success), `needs-approval` → *Needs approval* (warning), `unchecked` → *Not checked* (muted), `file-not-found` → *File missing* (danger), `error` → *Error* (danger).
    - `scanToastText` uses the same parts and order as the Task 1 sentence.
    - `checkAccessToast` copy (my call where the spec gives none):
      - approved → success `QuickBooks access approved for <name>`.
      - needs-approval → warning `QuickBooks hasn't approved <name> yet. Follow the steps above, then check again.`
      - file-not-found → error `<fileName> wasn't found. Sync the folder, then check again.`
      - error → error `<accessMessage ?? 'QuickBooks could not check this file.'>`.
      - 409 `company-file-open-elsewhere` → error `QuickBooks has <openFile> open — close it or open <neededFile>, then check again.` Without `openFile`: `Another company file is open in QuickBooks — close it or open <neededFile>, then check again.`
      - 503 `quickbooks-not-open` → warning `QuickBooks isn't running`.
      - anything else → error with the problem title.
  - **`CompanySelect.tsx`** (no other exports):
    ```ts
    export function CompanySelect(props: {
      companies: readonly Company[]; value: number | undefined; onChange: (id: number | undefined) => void
      label: string; id?: string; emptyLabel?: string /* 'All companies' | 'Choose a company' */; disabled?: boolean; size?: 'sm' | 'default'
    })
    ```
    It wraps `NativeSelect`, with an `aria-label` of `label`. Options use `companyLabel`, in the order given. `emptyLabel` is an option with value `''`, which maps to `undefined`.
  - **`AccessBadge({ access }: { access: CompanyAccess })`** is a `Badge` with an icon and a word (Task 7 uses it).
  - **`CompaniesPage`** (`.page`; route `/companies`, crumb "Companies", `RequireScope scope="lists:read"`):
    - `PageHeader` title "Companies". Description: "Company files found in `<rootFolder>` on the QuickBooks server." followed by `Last scanned <formatRelative(lastScanUtc)>`, with the absolute time as its `title`.
    - Admin action: **Sync** (`RefreshCwIcon` "Sync"; while running `Loader2Icon` "Scanning…"; running state from `useIsMutating({ mutationKey: ['companies', 'scan'] })`). Success → `toast.success(scanToastText(r))`; failure → `ProblemAlert`.
    - States:
      - loading → `TableSkeleton columns={6}`.
      - `null` (404) → `EmptyState` "Companies need a newer API.".
      - `rootConfigured: false` → `EmptyState` "No company folder is set." with description "Set `Companies:RootFolder` in the API's appsettings.json.", then the table if there are items.
      - `rootReachable: false` → `ProblemAlert error={rootUnreachableError(root)}` and a "Try again" button (`refetch`).
      - no items → `EmptyState` "No company files found in `<root>`." with description "Each company needs its own subfolder with a .qbw file." and Sync for an admin.
      - `ApprovalHelp` (info `Alert`) above the table when any company is `needs-approval`. It names those companies and lists the steps: open that company file in QuickBooks as admin; accept the QbAutopost certificate; choose "Yes, always; allow access even if QuickBooks is not running"; pick a QuickBooks user; then press *Check access*.
  - **`CompaniesTable({ items, isAdmin, onCheck, onEditNames, onChooseFile, onToggleDisabled })`**:
    - `Table aria-label="Companies" className="min-w-[880px]"` inside `DataPanel`.
    - Columns: Code (muted `—` when none) · Company (displayName; `qbCompanyName` on a second line when it differs; a "Folder missing" or "Disabled" badge) · File (`fileText`; `filePath` in a `Tooltip`) · QuickBooks access (`AccessBadge` with `accessCheckedUtc` below) · Lists (time + `outcomeView` word, link "Lists" to `/lists?company=<id>`, or "Never synced") · Waiting (link `/statements?company=<id>` with the count) · ⋯ (admin only, `aria-label="Actions for <displayName>"`).
    - The ⋯ menu: *Check access* (active only), *Choose file* (ambiguous only), *Edit match names*, *Disable* or *Enable*.
    - Missing and disabled rows sort last (`sortCompanies`) with `text-muted-foreground`.
    - Check access is disabled while that row's check is running, and is never retried.
  - **`MatchNamesDialog({ company, open, onOpenChange })`**: `Dialog` with the help text "Statements whose printed business name equals one of these are assigned to this company.", chips (`Badge` + remove button `aria-label="Remove <name>"`), an `Input` "Add a name" + "Add" (through `cleanMatchName`), and "Save" → `useUpdateCompany({ id, rowVersion, patch: { matchNames } })`. 412 shows `ProblemAlert` and the dialog stays open.
  - **`ChooseFileDialog({ company, open, onOpenChange })`**: `RadioGroup` of `candidateFiles`, "Save" → `PATCH { filePath }`.
  - **Navigation:**
    - `AppSidebar` gets `NavItem to="/companies" icon={Building2Icon} label="Companies"`, shown when `hasScope(me, 'lists:read')`, placed after Lists.
    - `CommandMenu PAGES` gets `{ label: 'Companies', to: '/companies', icon: Building2Icon, scope: 'lists:read' }`.

- [ ] **Step 1: Write the failing unit tests** in `companiesView.test.ts`:

```ts
test('companyLabel and fileText', () => {
  expect(companyLabel({ code: '18', displayName: 'Takoma Park Grocery Store Inc' })).toBe('18 · Takoma Park Grocery Store Inc')
  expect(companyLabel({ code: null, displayName: 'Sunrise Liquors' })).toBe('Sunrise Liquors')
  expect(fileText(company({ state: 'ambiguous', candidateFiles: ['a.qbw', 'b.qbw'] }))).toBe('2 files — choose one')
})
test('scanToastText', () => {
  expect(scanToastText(scan({ added: 2, missing: 1 }))).toBe('Found 2 new, 1 missing')
  expect(scanToastText(scan({}))).toBe('No changes')
})
test('check access: open elsewhere names both files, or the needed one when openFile is unknown (Review Focus 4)', () => {
  expect(checkAccessToast(apiError(409, { code: 'company-file-open-elsewhere', openFile: 'S & A Convenience Market LLC.qbw', neededFile: 'Takoma Park Grocery Store Inc.qbw' })))
    .toEqual({ level: 'error', text: 'QuickBooks has S & A Convenience Market LLC.qbw open — close it or open Takoma Park Grocery Store Inc.qbw, then check again.' })
  expect(checkAccessToast(apiError(409, { code: 'company-file-open-elsewhere', neededFile: 'Takoma Park Grocery Store Inc.qbw' })).text)
    .toBe('Another company file is open in QuickBooks — close it or open Takoma Park Grocery Store Inc.qbw, then check again.')
  expect(checkAccessToast(apiError(503, { code: 'quickbooks-not-open' }))).toEqual({ level: 'warning', text: "QuickBooks isn't running" })
})
test('cleanMatchName trims, refuses blanks and case-insensitive repeats (Review Focus 5)', () => {
  expect(cleanMatchName('  Zemen Market ', [])).toBe('Zemen Market')
  expect(cleanMatchName('   ', [])).toBeNull()
  expect(cleanMatchName('zemen market', ['Zemen Market'])).toBeNull()
})
test('sortCompanies puts missing and disabled last; assignableCompanies keeps active, firstIds first', () => { /* … */ })
```

- [ ] **Step 2: Write the failing page tests** in `CompaniesPage.test.tsx` (`vi.mock('sonner', …)` as in `ListsPage.test.tsx`; `open(route, as)` helper):

```ts
test.each(['u-viewer', 'u-editor', 'u-admin'])('%s sees Companies in the sidebar and the four companies', async (who) => {
  open('/companies', who)
  expect(await screen.findByRole('heading', { level: 1, name: 'Companies' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Companies' })).toHaveAttribute('href', '/companies')
  const table = await screen.findByRole('table', { name: 'Companies' })
  expect(within(table).getByText('Takoma Park Grocery Store Inc')).toBeInTheDocument()
  expect(within(table).getByText('Needs approval')).toBeInTheDocument()
  expect(within(table).getByText('2 files — choose one')).toBeInTheDocument()
  expect(within(table).getByText('Folder missing')).toBeInTheDocument()
})
test('only an admin gets Sync and the ⋯ menu', async () => { /* editor: no 'Sync' button, no 'Actions for …'; admin: both */ })
test('Sync shows Scanning…, then the new company appears without a reload and the toast says what changed', async () => {
  mockControl.scanAdds = ['22_Harbor Deli East']
  const { user } = open('/companies', 'u-admin')
  await user.click(await screen.findByRole('button', { name: 'Sync' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Found 1 new'))
  expect(await screen.findByText('Harbor Deli East')).toBeInTheDocument()
})
test('a Needs approval company shows the approval help naming it', async () => { /* role=alert or region text 'Yes, always; allow access even if QuickBooks is not running' and 'S & A Convenience Market LLC' */ })
test('Check access with another file open says which files, once, no retry', async () => {
  mockControl.companyOpenElsewhere = 'S & A Convenience Market LLC.qbw'
  let checks = 0
  server.use(http.post('/api/v2/companies/:id/check', () => { checks++; return undefined }))
  // open ⋯ for Takoma, click Check access
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('QuickBooks has S & A Convenience Market LLC.qbw open — close it or open Takoma Park Grocery Store Inc.qbw, then check again.'))
  expect(checks).toBe(1)
})
test('Check access approves 440: badge turns Approved and the help goes away', async () => { /* … */ })
test('root unreachable shows the path and Try again; root not configured shows the setup message', async () => {
  mockControl.companyRootMissing = true
  // expect "Can't reach the company folder" and the root path, and the 'Try again' button
  // then server.use GET → { rootFolder: null, rootConfigured: false, rootReachable: true, lastScanUtc: null, items: [default company] }
  // expect 'No company folder is set.' and the default company row
})
test('no companies → "No company files found in <root>." ; GET 404 → "Companies need a newer API."', async () => { /* server.use */ })
test('Edit match names adds a trimmed name, refuses a repeat, and saves with If-Match', async () => {
  // capture the PATCH If-Match header === '"1"' and body.matchNames === ['Zemen Market', 'Takoma Grocery']
})
test('Choose file saves the picked candidate and Sunrise Liquors becomes active', async () => { /* radio 'Sunrise Liquors 2024.qbw' → Save */ })
test('Ctrl K lists Companies', async () => { /* open menu with ctrl+k, option 'Companies' */ })
```

- [ ] **Step 3: Run the tests to make sure they fail.** Run `npx vitest run src/features/companies`. Expected: FAIL (module not found / route not found).
- [ ] **Step 4: Add `radio-group`** with the shadcn CLI and check the generated file. Then implement the view helpers, `CompanySelect`, the components, the route, the nav item and the `PAGES` entry.
- [ ] **Step 5: Run the tests to make sure they pass.** Run `npx vitest run src/features/companies src/layout src/router.test.tsx`. Expected: PASS.
- [ ] **Step 6: Verify.** Run `npm run lint` and `npm run build`.

---

### Task 6: Statements list column and filter

**Files:**
- Modify: `src/features/statements/list/{StatementsPage,StatementsToolbar,StatementsTable}.tsx`
- Test: `src/features/statements/list/StatementsPage.test.tsx`

**Interfaces:**
- Consumes: `useCompanies` (Task 4), `useStats({ refetchInterval, company })`, `ListParams.company`, `companyLabel` (Task 5).
- Produces:
  - `FILTER_SPEC.company = { kind: 'text' }` (values `'<id>'` or `'none'`).
  - `ToolbarFilters.company?: string`.
  - `StatementsToolbar` gets a new prop `companies?: readonly Company[]`. When it is defined, a `FilterChip label="Company"` appears with options `[{ value: 'none', label: 'No company' }, …companies.map((c) => ({ value: String(c.id), label: companyLabel(c) }))]`. When `useCompanies` gives `null` (an older API), the chip is left out. Clear filters clears it.
  - The page passes `company: f.company` to `useRequestsList` and to `useStats`. The sidebar badge stays all-companies.
  - `StatementsTable` gets a **Company** column after "Email or file". It shows `companyLabel(r.company)` when set, a `Badge variant="warning"` with an icon and "Needs company" when `r.company === null`, and a muted `—` when the key is missing. The table's `min-w` goes from `[920px]` to `[1080px]`, and `TableSkeleton columns` goes from 6 to 7.

- [ ] **Step 1: Write the failing tests.** Use the file's existing `summary()`, `useList()` and `signedIn()` helpers.

```ts
test('the Company column shows code and name, or a Needs company badge', async () => {
  useList([summary({ id: 1, company: { id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' } }), summary({ id: 2, company: null })])
  signedIn()
  expect(within(await cellRow('Subject 1')).getByText('18 · Takoma Park Grocery Store Inc')).toBeInTheDocument()
  expect(within(await cellRow('Subject 2')).getByText('Needs company')).toBeInTheDocument()
})
test('?company=2 (code 440) sends company=2 to the list and the stats, and shows the chip', async () => {
  const seen = recordUrls() // list and stats URLs
  mockControl.signInAs('u-editor'); renderApp('/statements?company=2')
  expect(await screen.findByRole('button', { name: /Company: 440 · S & A Convenience Market LLC/ })).toBeInTheDocument()
  await waitFor(() => expect(seen.list.at(-1)!.searchParams.get('company')).toBe('2'))
  expect(seen.stats.at(-1)!.searchParams.get('company')).toBe('2')
})
test('No company filters with company=none against the fake API and lists SR-000014 only', async () => { /* real mock: renderApp('/statements?company=none&tab=all') → link 'Credit card 440 ; S & A CONVENIENCE MARKET LLC.pdf' */ })
test('Clear filters removes company', async () => { /* … */ })
test('an older API: no Company chip when GET /companies is 404', async () => { /* server.use 404 → no 'Company' chip button */ })
```

- [ ] **Step 2: Run them to make sure they fail.** Run `npx vitest run src/features/statements/list/StatementsPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the column, the chip, and the params.
- [ ] **Step 4: Run them to make sure they pass.** Run `npx vitest run src/features/statements/list`. Expected: PASS.
- [ ] **Step 5: Verify.** Run `npm run lint` and `npm run build`.

---

### Task 7: Statement page: header, hold banner, Choose company, company-scoped lists, wrong-file post message

**Files:**
- Create: `src/features/requests/detail/CompanyHoldBanner.tsx`
- Create: `src/features/requests/dialogs/ChooseCompanyDialog.tsx`
- Modify: `src/features/statements/detail/{StatementPage,StatementHeader}.tsx`
- Modify: `src/features/requests/transactions/{QbListsStatus,TransactionsTab,TxTable,qbListsSync}.ts(x)`
- Modify: `src/features/requests/posting/outcome.ts` (conflict 6)
- Test: `src/features/requests/dialogs/ChooseCompanyDialog.test.tsx`, `src/features/statements/detail/StatementPage.test.tsx`, `src/features/requests/transactions/TransactionsTab.test.tsx`, `src/features/requests/transactions/qbListsSync.test.ts`, `src/features/requests/posting/outcome.test.ts`

**Interfaces:**
- Consumes: `useSetCompany`, `useCompanies`, `useQbLists(company, …)`, `useSyncQbLists(company)`, `listKeys.sync(company)` (Task 4); `CompanySelect`, `AccessBadge`, `companyLabel`, `isCompanyReady`, `assignableCompanies` (Task 5).
- Produces:
  - **`CompanyHoldBanner({ request, onChoose }: { request: RequestDetail; onChoose?: () => void })`**. It renders only when `request.company === null` (a missing key renders nothing). Warning `Alert` with `aria-label="Company hold"` and the text "Choose the company before validating or posting.", followed by " The printed name on this statement was *<companyMatch.printedName>*." only when that name exists. The button "Choose company" appears only when `onChoose` is given, which the page does only if `allowedActions` has `set-company`. It is placed directly after `StatusBanner`.
  - **`ChooseCompanyDialog({ open, onOpenChange, request, etag, companies }: { …; request: RequestDetail; etag: string; companies: readonly Company[] })`**:
    - Title "Choose company". The `CompanySelect` has `label="Company"`, `emptyLabel="Choose a company"`, and options `assignableCompanies(companies, request.companyMatch?.candidates.map((c) => c.id))`.
    - When `request.validationSummary.state !== 'none'`, a note reads "Validation will be cleared".
    - The confirm button "Assign company" is disabled until a company is picked and while saving. It calls `useSetCompany(id).mutate({ companyId, etag })`.
    - Success → close and `toast.success('Assigned to <displayName>')`. A 412 → `ProblemAlert` with "This changed since you opened it." / "The latest version was reloaded." (the existing stale wording); the dialog stays open. Other errors → `ProblemAlert`.
  - **`StatementHeader`** gets new props `company?: Company` (the full record from `useCompanies`, when known) and `onChangeCompany?: () => void`.
    - When `'company' in request`, it shows `<Meta label="Company">` with `companyLabel(request.company)`, or "Needs company" when it is null.
    - When `onChangeCompany` is given, a link-style `Button variant="link" size="sm"` "Change" follows.
    - When `company && !isCompanyReady(company)`, it shows `<AccessBadge access={company.access} />` (or the "Folder missing"/"Disabled" wording for those states) and a `Link to="/companies"` "Companies".
  - **`StatementPage`** wires all of this. Validate and Post stay driven by `allowedActions` (nothing new). A `validate.error` with code `company-required` or `company-not-ready` already shows through the existing `ProblemAlert`.
  - **`TxEditing`** in `TxTable.tsx` gets `namesLocked?: string`. When set, the `payee`, `account` and `lineAccount` cells are not editable (no editor opens on click or Enter) and carry `title={namesLocked}`.
  - **`TransactionsTab` / `TableEditor`:**
    - `company = request.company === undefined ? undefined : request.company?.id`.
    - `useQbLists(company, { enabled: editable && request.company !== null })`.
    - When `request.company === null`, it passes `namesLocked: 'Choose the company first'`, and the status line shows "Choose the company first" instead of `QbListsStatus`. Otherwise it renders `<QbListsStatus company={company} />`.
  - **`QbListsStatus({ className, company }: { className?: string; company?: number })`** uses `useQbLists(company)`, `useSyncQbLists(company)`, `useIsMutating({ mutationKey: listKeys.sync(company) })` and `startQbListRechecks(qc, company)`.
  - **`qbListsSync.ts`:**
    - `syncFailure` maps `company-not-ready` → warning `This company isn't ready in QuickBooks yet. Check its access on the Companies page.`
    - New `export function companyFileMessage(p: ApiProblem, retry: 'check' | 'post'): string | null`. For `company-file-open-elsewhere` it gives the same wording as `checkAccessToast`, ending "then post again." for posts. For `company-file-unavailable` it gives `QuickBooks couldn't open <neededFile ?? 'the company file'>. <detail>`. Anything else → null.
  - **`outcome.ts` `fromProblem`:**
    - Before the `switch`, when `companyFileMessage(p, 'post')` is non-null → `{ kind: 'unavailable', title: <message>, attemptId }` with no `retryAfter`, so `usePost` raises an error toast and never retries.
    - In `case 409`, `company-required` and `company-not-ready` → `{ kind: 'refused', title: p.title, detail: str(p.detail), errors: [], attemptId }`.

- [ ] **Step 1: Write the failing unit tests.**

```ts
// qbListsSync.test.ts
test('companyFileMessage names both files for a post, or the needed one only', () => {
  expect(companyFileMessage({ title: 'x', status: 409, code: 'company-file-open-elsewhere', openFile: 'S & A Convenience Market LLC.qbw', neededFile: 'Takoma Park Grocery Store Inc.qbw' }, 'post'))
    .toBe('QuickBooks has S & A Convenience Market LLC.qbw open — close it or open Takoma Park Grocery Store Inc.qbw, then post again.')
  expect(companyFileMessage({ title: 'x', status: 409, code: 'company-file-open-elsewhere', neededFile: 'Takoma Park Grocery Store Inc.qbw' }, 'post'))
    .toBe('Another company file is open in QuickBooks — close it or open Takoma Park Grocery Store Inc.qbw, then post again.')
  expect(companyFileMessage({ title: 'x', status: 409, code: 'busy' }, 'post')).toBeNull()
})
test('syncFailure: company-not-ready is a warning pointing at Companies', () => { /* … */ })
// outcome.test.ts
test('a 409 company-file-open-elsewhere post is unavailable with the plain message and no retryAfter', () => {
  const o = interpretPost(new ApiError({ title: 'Wrong company file', status: 409, code: 'company-file-open-elsewhere', openFile: 'A.qbw', neededFile: 'B.qbw', attemptId: 7 }, new Headers()))
  expect(o).toMatchObject({ kind: 'unavailable', title: 'QuickBooks has A.qbw open — close it or open B.qbw, then post again.', attemptId: 7 })
  expect(o.retryAfter).toBeUndefined()
})
test('company-required and company-not-ready are refusals with the API title', () => { /* … */ })
```

- [ ] **Step 2: Write the failing page and dialog tests.**

```ts
// StatementPage.test.tsx
describe('company (R-19)', () => {
  test('no company: hold banner with the printed name, no Validate or Post; choosing Takoma shows it in the header and Validate appears', async () => {
    const { user } = await open(14, 'u-editor')
    const banner = screen.getByRole('alert', { name: 'Company hold' }) // or role from Alert; match the element used
    expect(banner).toHaveTextContent('Choose the company before validating or posting. The printed name on this statement was SA CONVENIENCE MARKET.')
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post to QuickBooks' })).not.toBeInTheDocument()
    await user.click(within(banner).getByRole('button', { name: 'Choose company' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Company' }), '18 · Takoma Park Grocery Store Inc')
    await user.click(screen.getByRole('button', { name: 'Assign company' }))
    expect(await within(screen.getByTestId('statement-meta')).findByText('18 · Takoma Park Grocery Store Inc')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Validate' })).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: 'Company hold' })).not.toBeInTheDocument()
  })
  test('without a printed name the second sentence is left out; a viewer gets no Choose company button', async () => { /* mockDb record 14 companyMatch = null; open as u-viewer */ })
  test('a company that is not ready shows its access badge and a link to Companies', async () => {
    mockDb.requests.find((r) => r.id === 2)!.companyId = 2
    await open(2, 'u-editor')
    const meta = screen.getByTestId('statement-meta')
    expect(await within(meta).findByText('Needs approval')).toBeInTheDocument()
    expect(within(meta).getByRole('link', { name: 'Companies' })).toHaveAttribute('href', '/companies')
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
  })
  test('an older API without company fields shows no banner and keeps Validate (Review Focus 1)', async () => {
    server.use(http.get('/api/v2/saved-requests/:id', async ({ request }) => {
      const res = await fetch(bypass(request)); const body = await res.json(); delete body.company; delete body.companySource; delete body.companyMatch
      return HttpResponse.json(body, { headers: { ETag: res.headers.get('ETag')! } })
    }))
    await open(1, 'u-editor')
    expect(screen.queryByRole('alert', { name: 'Company hold' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument()
  })
  test('a post refused because another file is open toasts both file names, once', async () => {
    mockControl.companyOpenElsewhere = 'S & A Convenience Market LLC.qbw'
    // open 1, Post to QuickBooks → Confirm; expect toast.error called with 'QuickBooks has S & A Convenience Market LLC.qbw open — close it or open Takoma Park Grocery Store Inc.qbw, then post again.'
    // and exactly one POST /post seen
  })
  test('unsaved row edits survive choosing a company (Review Focus 3)', async () => {
    // open 14 as editor; edit a memo cell (TextCell) → Save bar shows '1 unsaved change'
    // choose company 18 → header shows it; the memo cell still has data-dirty="true" and the Save bar still says 1 unsaved change
  })
})
// TransactionsTab.test.tsx
test('with no company the name pickers are locked with "Choose the company first" and no lists are fetched', async () => {
  let listGets = 0
  server.use(http.get('/api/v2/quickbooks/lists', () => { listGets++; return undefined }))
  const { user } = open(14, 'u-editor')
  await screen.findByRole('columnheader', { name: 'Payee' })
  expect(screen.getByText('Choose the company first')).toBeInTheDocument()
  await user.click(document.querySelector<HTMLElement>('tr[data-row="0"] td[data-field="payee"]')!)
  expect(screen.queryByRole('combobox', { name: 'Payee' })).not.toBeInTheDocument()
  expect(listGets).toBe(0)
})
test('a statement of company 2 loads company 2 lists (company=2)', async () => { /* set record 2 companyId 2 + make company 2 approved; assert lists GET company=2 and option 'Coastal Beverage Supply' offered for payee */ })
// ChooseCompanyDialog.test.tsx (renderWithProviders with a fake request/companies)
test('lists active companies only, match candidates first, and says Validation will be cleared when validated', () => { /* options order; 'Sunrise Liquors' and 'Harbor Deli' absent */ })
test('sends If-Match with the ETag and companyId; a 412 keeps the dialog open with the stale message', async () => { /* server.use 412 */ })
```

- [ ] **Step 3: Run the tests to make sure they fail.** Run `npx vitest run src/features/requests/dialogs/ChooseCompanyDialog.test.tsx src/features/statements/detail/StatementPage.test.tsx src/features/requests/transactions/TransactionsTab.test.tsx src/features/requests/transactions/qbListsSync.test.ts src/features/requests/posting/outcome.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the banner, the dialog, the header props, `namesLocked`, the company-scoped lists, `companyFileMessage` and the `outcome.ts` cases.
- [ ] **Step 5: Run the tests to make sure they pass, along with the neighbouring suites.** Run the same command plus `src/features/requests src/features/statements/detail`. Expected: PASS. `StatementPage.test.tsx` has two tests known to time out under full-suite load; report them if they do.
- [ ] **Step 6: Verify.** Run `npm run lint` and `npm run build`.

---

### Task 8: Upload review company block (+ the e2e flow)

**Files:**
- Create: `src/features/statements/upload/CompanyBlock.tsx`
- Modify: `src/features/statements/upload/ReviewEditor.tsx`
- Create: `e2e/companies.spec.ts` (conflict 17)
- Test: `src/features/statements/upload/CompanyBlock.test.tsx`, `src/features/statements/upload/UploadPage.test.tsx`

**Interfaces:**
- Consumes: `Extraction.company`, `useCompanies`, `SaveUploadBody.companyId`, `useQbLists(company)`, `QbListsStatus company` (Tasks 1, 4, 7); `CompanySelect`, `companyLabel`, `assignableCompanies` (Task 5).
- Produces:
  - **`CompanyBlock(props: { match: ExtractionCompany | undefined; companies: readonly Company[] | undefined; value: number | undefined; onChange: (id: number | undefined) => void; disabled?: boolean })`**. It renders nothing when `match` is undefined (older API). Otherwise it shows a "Company" label and one of three states:
    - `matched`, while not editing: the company's display name, then "Read from statement: *<printedName>*", and a "Change" button that switches to the select.
    - `ambiguous`: `CompanySelect` with options = candidates first (`assignableCompanies(companies, candidateIds)`) and `emptyLabel="Choose a company"`, plus the warning text "More than one company matches".
    - `none`: `CompanySelect` over all assignable companies, plus "No company matched the printed name *<printedName>*", or "No business name was found on the statement" when `printedName` is null.
    - Under every select: "Optional. Without a company the statement waits until someone chooses one." (my copy).
  - **`ReviewEditor`:**
    - Keeps `chosen: number | undefined` (set only by the user).
    - `effective = chosen ?? (extraction.company?.match === 'matched' ? extraction.company.companyId ?? undefined : undefined)`.
    - It renders `CompanyBlock` in a grid next to the Reference field, so they sit on one row from `sm` up and stack at 375 px.
    - `useQbLists(effective)` and `<QbListsStatus company={effective} />`. With no company it uses the default company's lists, which keeps today's upload flow (my call; the spec is silent).
    - On save it sends `upload.companyId: chosen`, so a kept match is saved as `matched` by the server and a user's pick as `chosen`.

- [ ] **Step 1: Write the failing component tests** (`renderWithProviders`, fixture `Company` objects):

```ts
test('matched: shows the company and what was read, Change opens the select', async () => {
  const { user } = renderWithProviders(<CompanyBlock match={{ match: 'matched', printedName: 'TAKOMA PARK GROCERY STORE INC', dbaName: 'ZEMEN MARKET', companyId: 1, candidates: [takoma] }} companies={all} value={undefined} onChange={onChange} />)
  expect(screen.getByText('Takoma Park Grocery Store Inc')).toBeInTheDocument()
  expect(screen.getByText(/Read from statement:/)).toHaveTextContent('Read from statement: TAKOMA PARK GROCERY STORE INC')
  await user.click(screen.getByRole('button', { name: 'Change' }))
  expect(screen.getByRole('combobox', { name: 'Company' })).toBeInTheDocument()
})
test('ambiguous: candidates first and "More than one company matches"', () => { /* option order */ })
test('none: printed name sentence, or the no-name sentence', () => { /* both copies */ })
test('no company block on an older API (match undefined)', () => { /* container empty */ })
```

- [ ] **Step 2: Write the failing page tests** in `UploadPage.test.tsx`:

```ts
describe('company (R-19.5, R-20.1)', () => {
  it('a matched PDF shows the matched company and saves it as matched without sending companyId', async () => {
    mockControl.nextMatch = { match: 'matched', printedName: 'TAKOMA PARK GROCERY STORE INC', dbaName: 'ZEMEN MARKET', companyId: 1, candidates: [{ id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' }] }
    const r = await uploadAndReview()
    expect(screen.getByText('Read from statement: TAKOMA PARK GROCERY STORE INC', { exact: false })).toBeInTheDocument()
    // fill accounts as existing test, save
    const saved = mockDb.requests.at(-1)!
    expect(saved).toMatchObject({ companyId: 1, companySource: 'matched' })
  })
  it('an unmatched PDF shows the picker; choosing 440 sends companyId 2 and the statement belongs to it', async () => {
    const bodies = recordSaveBodies()
    const r = await uploadAndReview()
    expect(screen.getByText('No business name was found on the statement')).toBeInTheDocument()
    await r.user.selectOptions(screen.getByRole('combobox', { name: 'Company' }), '440 · S & A Convenience Market LLC')
    // fill accounts, save
    expect(bodies.at(-1)).toMatchObject({ upload: { extractionId: expect.any(String), companyId: 2 } })
    expect(mockDb.requests.at(-1)).toMatchObject({ companyId: 2, companySource: 'chosen' })
  })
  it('saving without a company creates a statement on hold', async () => { /* lands on statement page; hold banner visible */ })
})
```

- [ ] **Step 3: Write the e2e flow** `e2e/companies.spec.ts`. Copy `signIn` and `pickAccount` from `e2e/upload.spec.ts`.
  - Test 1: "upload an unmatched PDF, save on hold, choose the company, validate". Upload `PDF` → see "No business name was found on the statement" → fill accounts 2 and 9 and the control total `6249.02` → Save → on the statement page the hold banner text "Choose the company before validating or posting." is visible and no Validate button → "Choose company" → select `18 · Takoma Park Grocery Store Inc` → "Assign company" → the `statement-meta` contains `18 · Takoma Park Grocery Store Inc` → the Save bar's "Validate" is visible; click it and expect it enabled again.
  - Test 2: "Companies and Statements do not scroll sideways at 375 px". Navigate inside the app to `/companies` and to `/statements`, set the viewport to 375 × 800, and expect `document.documentElement.scrollWidth <= 375` on each.
- [ ] **Step 4: Run the unit tests to make sure they fail.** Run `npx vitest run src/features/statements/upload/CompanyBlock.test.tsx src/features/statements/upload/UploadPage.test.tsx`. Expected: FAIL.
- [ ] **Step 5: Implement** `CompanyBlock` and the `ReviewEditor` changes.
- [ ] **Step 6: Run the unit tests to make sure they pass.** Run `npx vitest run src/features/statements/upload`. Expected: PASS, existing upload tests included.
- [ ] **Step 7: Verify.** Run `npm run lint` and `npm run build`. The e2e spec runs in Task 10.

---

### Task 9: Lists page and Home selectors

**Files:**
- Modify: `src/features/lists/{ListsPage,SyncHistory}.tsx`
- Modify: `src/features/home/HomePage.tsx`
- Test: `src/features/lists/ListsPage.test.tsx`, `src/features/home/HomePage.test.tsx`

**Interfaces:**
- Consumes: `useCompanies`, `defaultCompanyId`, `CompanySelect` (Tasks 4, 5); `useQbListsDetail(company)`, `useQbListSyncs(company, f)`, `QbListsStatus company`; `useStats({ company })`, `ListParams.company`, `SummaryParams.company`, `useAuditCounts`/`useAuditTrend` `{ company }`.
- Produces:
  - **`ListsPage`:**
    - `FILTER_SPEC.company = { kind: 'text' }`.
    - `company = known(f.company) ?? defaultCompanyId(companies.data)`, where `known` accepts only an id present in `items`. An unknown id falls back to the default (Review Focus 2).
    - `PageHeader actions` holds `<CompanySelect label="Company" size="sm" companies={items} value={company} onChange={(id) => filters.set({ company: id === defaultCompanyId(...) ? undefined : String(id) })} />` before `<QbListsStatus company={company} />`.
    - No selector when `useCompanies` gives `null` or one company; `company` is then `undefined`.
    - The list query waits for `useCompanies` to settle (`enabled: !companies.isPending`), so it never fetches the default company first and then the right one.
  - **`SyncHistory`** gets a new prop `company?: number`, passed to `useQbListSyncs(company, …)`.
  - **`HomePage`:**
    - `VIEW_SPEC.company = { kind: 'text' }`.
    - `CompanySelect` with `label="Company"`, `emptyLabel="All companies"`, `size="sm"`, placed first in `PageHeader actions`, hidden when `useCompanies` gives `null`.
    - `companyParam = view.values.company`. It is passed to `useStats({ refetchInterval, company: companyParam })`, the queue's `useRequestsList({ …, company: companyParam })`, `summaryParams.company` and the audit fallback. `useAuditEvents` (recent activity) stays all-companies.

- [ ] **Step 1: Write the failing tests.**

```ts
// ListsPage.test.tsx
describe('company (R-20)', () => {
  test('defaults to the default company and sends company=1', async () => { /* record GET /quickbooks/lists URLs; expect company '1'; combobox 'Company' has value '1' */ })
  test('choosing 440 shows its own names and history, and puts ?company=2 in the URL', async () => {
    const { user, router } = open('/lists?tab=vendors')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Company' }), '440 · S & A Convenience Market LLC')
    expect(await screen.findByText('Coastal Beverage Supply')).toBeInTheDocument()
    expect(router.state.location.search).toContain('company=2')
    await user.click(screen.getByRole('tab', { name: 'Sync history' }))
    expect(within(await table('Sync history')).getAllByRole('row')).toHaveLength(3) // header + 2 seeded for company 2
  })
  test('Sync now for 440 shows the not-ready message; for 18 it syncs company=1 only', async () => {
    // ?company=2 → Sync now → toast.warning("This company isn't ready in QuickBooks yet. Check its access on the Companies page.")
    // ?company=1 → Sync now → POST URL has company=1; toast.success called
  })
  test('an unknown ?company=99 falls back to the default company (Review Focus 2)', async () => { /* GET URLs never contain company=99; combobox value '1' */ })
  test('an older API (GET /companies 404) shows no selector and loads the lists without company (Review Focus 1)', async () => { /* … */ })
})
// HomePage.test.tsx
test('the company selector filters stats, the waiting list and the summary; recent activity stays all-companies', async () => {
  const urls = recordUrls(['/api/v2/saved-requests/stats', '/api/v2/saved-requests', '/api/v2/dashboard/summary', '/api/v2/audit-events'])
  const { user } = open('/')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Company' }), '440 · S & A Convenience Market LLC')
  await waitFor(() => expect(urls['/api/v2/saved-requests/stats'].at(-1)!.searchParams.get('company')).toBe('2'))
  expect(urls['/api/v2/saved-requests'].at(-1)!.searchParams.get('company')).toBe('2')
  expect(urls['/api/v2/dashboard/summary'].at(-1)!.searchParams.get('company')).toBe('2')
  expect(urls['/api/v2/audit-events'].every((u) => !u.searchParams.has('company'))).toBe(true)
})
test('Home counts change with the company selector', async () => {
  // fake API, no overrides: read the waiting count shown for All companies, choose 440, expect a different count
})
test('"All companies" is the default and sends no company', async () => { /* … */ })
```

- [ ] **Step 2: Run them to make sure they fail.** Run `npx vitest run src/features/lists/ListsPage.test.tsx src/features/home/HomePage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** both selectors.
- [ ] **Step 4: Run them to make sure they pass, with the neighbouring suites.** Run `npx vitest run src/features/lists src/features/home`. Expected: PASS.
- [ ] **Step 5: Verify.** Run `npm run lint` and `npm run build`.

---

### Task 10: Docs as built (+ full verification)

**Files:**
- Modify: `docs/superpowers/plans/2026-11-03-multi-company-plan.md` (tick milestones 1–9 in §5; real output in §6 Results, including any `StatementPage.test.tsx` timeouts)
- Modify: `docs/superpowers/specs/2026-11-03-multi-company-spec.md` §5 "As built" (every place the build differs from the spec, including conflicts 2, 3, 5, 6, 8, 10–15, 18)
- Modify: `docs/api-requirements-for-dashboard.md` (Tracker rows R-18…R-20 "fake API done"; a Changelog line "R-18–R-20 implemented in the fake API (`src/mocks/handlers/companies.ts`, …) and used by Companies, Statements, Upload, Lists and Home"; the open questions from conflicts 1, 10 and 13 as notes on R-18 and R-19)
- Modify: `README.md`, `CLAUDE.md` (route list mentions `/companies`; in CLAUDE.md the architecture block's `router.tsx` line and the `features/<area>/` list gain `companies`)

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the four docs** as listed. Copy the actual command output; never paraphrase a failure into a pass.
- [ ] **Step 2: Run the full suite.** Run `npm run lint`, `npm run build`, `npm test`, `npm run e2e`. Expected: all pass, with the new `e2e/companies.spec.ts` included. Record the output in §6.

---

### Task 11: Real-API check against API M17

**Files:**
- Modify: `docs/superpowers/plans/2026-11-03-multi-company-plan.md` §6 Results (and §5 milestone)
- Modify: `docs/superpowers/specs/2026-11-03-multi-company-spec.md` §5 when the real API differs

**Interfaces:**
- Consumes: API M17 built through T-1712 (stated in the approved plan), and the stack in `docker-compose.integration.yml`.

- [ ] **Step 1: Start the stack.** Run `docker compose -f docker-compose.integration.yml up -d --build`. Expected: the containers are healthy and `http://localhost:8080` serves the dashboard.
- [ ] **Step 2: Run the existing real-stack suite** (conflict 9). Run `npx playwright test -c playwright.integration.config.ts`. Expected: every existing integration test passes, which shows old calls without `company` still answer as before (R-20 acceptance).
- [ ] **Step 3: Check by hand against the real API** and record each item as pass or fail:
  - `GET /companies` shape, including `rowVersion` (conflict 1).
  - Scan toast.
  - The `company-file-open-elsewhere` and `quickbooks-not-open` messages on Check access.
  - The hold banner → Choose company → Validate.
  - The upload `companyId` placement (conflict 13).
  - The audit `detail` shapes (conflict 10).
  - Lists `?company=` for two companies.
  - Any shape difference goes into spec §5 and the requirements doc first; then fix `src/mocks/` to match.
- [ ] **Step 4: Run the final verification.** Run `npm run lint`, `npm run build`, `npm test`, `npm run e2e`, then `docker compose -f docker-compose.integration.yml down -v`. Expected: all pass. Record the real output in §6.

---

## Self-review

- **Spec coverage.**
  - §3.1 → Task 5.
  - §3.2 → Task 5 (every state, both dialogs, the help, the toasts).
  - §3.3 → Task 6.
  - §3.4 → Task 7.
  - §3.5 → Task 8.
  - §3.6 → Tasks 9 and 1 (audit).
  - §3.7 roles → Tasks 2 and 5 (scope tests), Task 7 (viewer has no Choose company).
  - §3.8 → Tasks 4 and 7 (older API).
  - §3.9 → Tasks 2 and 3.
  - Acceptance 1–9 → Tasks 5–9. Acceptance 10 → Task 8 e2e plus the existing upload 375 px test. Acceptance 11 → every task's verification.
- **Types.** These names are used the same way in every task: `companyLabel`, `isCompanyReady`, `assignableCompanies`, `defaultCompanyId` (Task 5); `listKeys.qb(company)`, `listKeys.sync(company)`, `useQbLists(company, opts)`, `useSyncQbLists(company)` (Task 4); `useSetCompany(id).mutate({ companyId, etag })` (Tasks 4 and 7); `namesLocked` (Task 7); `CompanyRecord`, `listsFor`, `isReady` (Tasks 2 and 3); `RequestSummary.company?: CompanyRef | null` (Task 1, read in Tasks 6–8).
- **Review Focus.** Each line has a test in the task that owns the code: 1 → Tasks 7 and 9, 2 → Task 9, 3 → Task 7, 4 → Tasks 5 and 7, 5 → Task 5.
