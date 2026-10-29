# Dashboard ↔ API integration — specification

**Date**: 2026-10-29 · **Status**: implemented and verified (see the plan's Results)
**Plan**: `docs/superpowers/plans/2026-10-29-api-integration-plan.md`
**API side**: `D:\qb_post-issue-2\docs\dashboard-integration-m13.md` (M13) and its plan.

## 1. Goal and scope

Run the dashboard against the real QbAutopost API instead of the fake one (MSW), in Docker, and prove every page works
end to end. Fix whatever does not match, on whichever side is wrong, and record what the API must add.

In scope: the API base path; every response shape the pages read; the dashboard as a container; a full-stack compose
file; an end-to-end suite against the real API; Home on `GET /dashboard/summary` (R-11, its own dated section in
`2026-10-28-home-dashboard-spec.md` §11). Out of scope: a production deployment (the API serves the dashboard itself
there, R-2), real QuickBooks (Windows-only; the stack uses the API's simulated company), and the real OpenRouter model
(a stand-in reads uploads; the real model is one environment variable away).

## 2. What the codebase touches

- `src/api/client.ts`, `src/api/session.ts`, `src/api/queries/audit.ts`: base path.
- `src/api/schema.ts`, `src/api/queries/{lists,requests,auth,home}.ts`: response shapes.
- `src/auth/{SessionProvider.tsx,useSession.ts,ChangePasswordPage.tsx}`: the password-change answer.
- `src/features/users/{UsersPage,UserPage}.tsx`: the user version (R-15).
- `src/features/statements/detail/useVersionChanges.ts`: shared versions fetch.
- `src/mocks/handlers/*`: the fake API follows every real shape.
- New: `Dockerfile`, `.dockerignore`, `docker/` (nginx config, OpenRouter stand-in, QuickBooks lists seed),
  `docker-compose.integration.yml`, `playwright.integration.config.ts`, `e2e-integration/`.

## 3. Findings and behaviour

| # | Found against the real API | Fix (side) |
|---|---|---|
| I-1 | The API serves the dashboard surface under `/api/v2`; the dashboard called `/api/v1`. | Base `/api/v2` everywhere, including the refresh URL (cookie path `/api/v2/auth`) and the CSV link (dashboard). |
| I-2 | `GET /quickbooks/lists` sends accounts as `{ name, type }`; every account showed "not in QuickBooks". | `useQbLists` maps to names; mock sends the API shape (dashboard). |
| I-3 | `GET …/versions` and `…/attempts` are wrapped in `{ items }`; the Results sheet crashed (`filter is not a function`). | Hooks unwrap; one shared `fetchVersions`; mock wraps (dashboard). |
| I-4 | `POST /auth/change-password` rotates the session and answers with a new access token and user; the dashboard reused the old token, whose claims still said "must change password", so a first sign-in never left the change-password page. | Adopt the answer's token and user (`adoptSession`); mock answers like sign-in (dashboard). |
| I-5 | Users list rows carry no version, so **Enable** from the list always answered 412. | **R-15**: list rows carry `rowVersion` (API M13 T-1301); the user page keys on its ETag (both). |
| I-6 | User events in the audit feed carried only `userId` ("Created user 8070e704-…"). | **R-7.3** amended: `email` and `displayName` added when the feed is read (API M13 T-1302). |
| I-7 | Each cancelled read (normal React Query behaviour) was logged by the API as a 500 at Error. | API answers 499 at Information (API M13 T-1304). |
| I-8 | Home made about 22 calls per load, close to the API's 120 reads/minute per user. | Home reads `GET /dashboard/summary` (R-11) and falls back to the audit feed only on 404 (dashboard; Home spec §11). |

Unchanged and confirmed against the real API: ETag / `If-Match` on edit, 412 with who changed it, validation states,
post with the duplicate acknowledgement, TxnIDs per row, discard / restore with reason, `pushId` replay, the Statements
filters and tabs, audit filters and CSV, upload read → review → save with version 1 / version 2, viewer permissions.

## 4. The Docker stack

- **web**: `Dockerfile` builds with `npm ci && npm run build` (the build removes the mock worker) and serves `dist/`
  from nginx. `/api/` is proxied to the API on the same origin, so the `SameSite=Strict`, `Path=/api/v2/auth` refresh
  cookie works and no CORS is needed. nginx re-resolves the API every 10 s; proxy timeouts are 600 s (a post must
  never be cut off, R-3); body limit 11 MB (10 MB PDFs, R-13.2). `index.html` is `no-cache`, `/assets/` immutable, CSP
  and `nosniff` as R-2.5.
- **api**: the API repository's `Dockerfile` (Development, simulated QuickBooks), secrets as `QBAUTOPOST__*`
  variables, rate limits raised for the test stack only.
- **migrate**: applies the API's `deploy/migrations.sql` with `psql` before the API starts (the API never migrates
  itself).
- **api-net**: owns the API's network namespace and runs the OpenRouter stand-in on its loopback (the API accepts a
  plain-http model URL only on loopback).
- Cookies are `Secure`; browsers accept them on `http://localhost`, which is how the stack is reached. Any other host
  needs HTTPS (runbook §11).

## 5. Roles and permissions

Unchanged: buttons follow `allowedActions`; admin UI follows `users:manage`. Verified end to end for admin, editor
(no Users) and viewer (no edit, post or upload).

## 6. Acceptance criteria

1. `docker compose -f docker-compose.integration.yml up -d --build` brings up a healthy stack; the dashboard is at
   `http://localhost:8080`.
2. `npx playwright test -c playwright.integration.config.ts` passes: n8n push → edit → don't post → save → validate →
   post → TxnIDs → audit; discard / restore; duplicate push warning; `pushId` replay; audit CSV; Home on the summary;
   viewer permissions; upload → review → save → audit; same-file warning; not-a-statement; not-a-PDF; create user →
   first sign-in password change → reload keeps the session; disable on the user page → enable from the list → audit
   names the user.
3. `npm run lint`, `npm run build`, `npm test` pass (the documented StatementPage timeouts under full-suite load
   excepted, and reported).
4. The fake API matches every shape above, and `docs/api-requirements-for-dashboard.md` records R-15, the R-7.3
   amendment and the API status of every requirement.
