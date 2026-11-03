# Dashboard ↔ API integration — plan

**Spec**: `docs/superpowers/specs/2026-10-29-api-integration-spec.md`

## 1. Files

| File | Change |
|---|---|
| `Dockerfile`, `.dockerignore`, `docker/nginx.conf` | Dashboard image (node build → nginx, `/api/` proxy) |
| `docker/openrouter-stub/server.mjs` | Deterministic stand-in for the model behind uploads |
| `docker/seed/qb-lists.json` | QuickBooks names for the simulated company |
| `docker-compose.integration.yml` | db, migrate, api-net, api, web |
| `playwright.integration.config.ts`, `e2e-integration/*` | End-to-end suite against the real API |
| `src/api/client.ts`, `session.ts`, `queries/audit.ts` | `/api/v2` |
| `src/api/schema.ts` | `Items<T>`, `QbListsResponse`, `User.rowVersion?: string`, `DashboardSummary` |
| `src/api/queries/{lists,requests,auth,home}.ts` | Shapes I-2…I-4, R-11 hooks |
| `src/auth/{SessionProvider,useSession,ChangePasswordPage}.tsx` | `adoptSession` (I-4) |
| `src/features/users/UserPage.tsx` | key on the ETag (R-15) |
| `src/features/statements/detail/useVersionChanges.ts` | shared `fetchVersions` |
| `src/features/home/*` | summary (Home plan §5) |
| `src/mocks/handlers/{common,requests,support,auth,users,userHelpers,dashboard,index}.ts` | real shapes; R-11 mock |
| Tests: `StatementSheet.test.tsx`, `users.test.ts`, `requests.upload.test.ts`, `HomePage.test.tsx`, `homeMetrics.test.ts`, `dashboard.test.ts`, every test with a `/api/v1` URL | follow the shapes |
| `eslint.config.js`, `vitest.config.ts` | ignore `.vite`/`test-results`; vitest skips `e2e-integration` |
| `docs/api-requirements-for-dashboard.md`, `README.md` | R-15, R-7.3, statuses, changelog; how to run the stack |

## 2. Tasks

| # | Task | Depends on | Outcome |
|---|---|---|---|
| 1 | Containers and compose; stack healthy | — | Sign-in works through nginx |
| 2 | Switch to `/api/v2`; sweep every page | 1 | Findings I-1…I-8 |
| 3 | Dashboard fixes I-1…I-4 with the mock in step | 2 | Pages work against the real API |
| 4 | Requirements doc: R-15, R-7.3, statuses | 2 | API asks written down |
| 5 | API M13 (spec, plan, T-1301…T-1304) | 4 | API green, image rebuilt |
| 6 | Dashboard side of R-15 | 5 | Enable from list works |
| 7 | Home on R-11 (Home plan §5) | 3 | One summary call |
| 8 | E2E suite, full checks, docs | 3–7 | All green, results below |
| 9 | Realistic-data walkthrough (`demo/`), fix I-9 (toast over the Save bar): `src/main.tsx` Toaster top right | 8 | Walkthrough green on an empty stack; e2e still green |
| 10 | Fix I-10 (`homeMetrics.queryEnd`, `HomePage.tsx`) and I-11 (`schema.ts` `AUDIT_ACTIONS`, `auditSentence.ts`), tests first | 9 | `homeMetrics.test.ts`, `auditSentence.test.ts` red then green; walkthrough asserts Home's figures |

## 3. Verification

```
npm run lint && npm run build && npm test
docker compose -f docker-compose.integration.yml up -d --build
npx playwright test -c playwright.integration.config.ts
```

## 4. Milestones

- [x] Stack in Docker, healthy, dashboard served by nginx
- [x] `/api/v2` and the response shapes (I-1…I-4)
- [x] Requirements doc updated (R-15, R-7.3, statuses, changelog)
- [x] API M13 done (T-1301 R-15, T-1302 R-7.3, T-1303 Dockerfile, T-1304 499)
- [x] Dashboard side of R-15
- [x] Home on `/dashboard/summary` with the 404 fallback
- [x] End-to-end suite green against the real API

## 5. Results (2026-10-29)

- **End to end** (`playwright.integration.config.ts`, real API in Docker): **13 passed** (statement flow 1, review 6,
  upload 4, users 2), run green after the last change. Earlier runs failed and were fixed: test data that reused rows
  (the API's duplicate detector rightly flagged them), a float amount with more than two decimals in seed data (the
  API rightly refused it), the API's per-user rate limit (raised for the test stack only; see API Q-118), stale
  selectors, and a picker opened before the QuickBooks lists loaded on the first page after a restart (the test now
  reopens it; in the app the picker simply fills when the lists arrive).
- **Lint**: clean. **Build**: clean (`tsc -b` + `vite build`).
- **Unit tests** (`npm test`): two consecutive full runs, **498 of 499 passed**; the failure in both was
  `StatementPage.test.tsx › add and delete › Add transaction dialog …` hitting the 5 s timeout under full-suite load,
  the known issue in `CLAUDE.md`. It passes when its file runs alone (57/57 across the three files that flaked).
- **API** (M13): `dotnet build -warnaserror` 0 warnings; `dotnet test` Core 1231, Api 1515, Data 478 passed, 1 skipped
  (the opt-in performance test).
- **Live log check**: after T-1304, a full suite run left **0** `responded 5xx` lines and 24 `responded 499` lines
  (cancelled reads) in the API log.
- **Not done**: the real model and real QuickBooks were not exercised (no OpenRouter key; QuickBooks needs the
  Windows server). R-12 (posted-time filters) exists in the API but the dashboard does not link Home's Posted figure to
  it yet; that is a separate change.

### Results, realistic-data walkthrough and fixes I-9…I-11 (2026-10-29, later)

- `demo/realistic-data.spec.ts` on an **empty** stack: **7 passed** (43 s). It found I-9 (a toast covering Validate:
  the first run waited 10 minutes on that click), I-10 (Home counted 0 for the current minute) and I-11 (raw
  `flagged-duplicate` in the audit trail). After the fixes it also asserts Home's figures (5 received, 2 posted,
  1 discarded, 16 rows posted) and the duplicate sentence.
- New unit tests seen failing first: `queryEnd` (homeMetrics), the four extra audit actions (auditSentence).
- E2E suite: **13 passed** after the fixes. `npm test`: two consecutive full runs **501/501**. One earlier full run
  failed `auth.test.tsx › valid refresh cookie …` at its 1 s `findBy` wait under load (passes alone 3/3; the file's
  only change is the `/api/v2` URL), the same load-timing class as the documented StatementPage timeouts.
- vitest now also excludes `demo/`. A full-page screenshot showed the sidebar part-way down a scrolled page; a
  viewport screenshot confirmed it is a capture artifact (the sidebar stays at the top), not a bug.
- The stack now holds only the walkthrough's data (see README › Full stack in Docker).
