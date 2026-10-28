# CLAUDE.md

QbAutopost dashboard. n8n saves transactions extracted from bank and card statement emails to the QbAutopost API. In
this web app an accountant reviews each statement, fixes rows, posts it to QuickBooks Desktop, and sees exactly what
was posted. Every change is audited. React 19, TypeScript, Vite, Tailwind v4, shadcn/ui (new-york), TanStack Query,
React Router 7, Recharts (via shadcn `chart`), MSW for the fake API.

## Rule 1: no code change without a spec and a plan

**Every code change needs a written spec and a written plan before any file under `src/`, `e2e/`, `public/` or
config is edited.** This covers features, bug fixes, refactors, dependency changes and styling. Write the spec first,
then the plan, review both for consistency, and only then write code.

- **Where**: `docs/superpowers/specs/YYYY-MM-DD-<topic>-spec.md` and `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`
  (today's date; same `<topic>` in both). Older files use `-design.md` for specs; keep their names.
- **Change inside an existing feature**: update that feature's spec and plan (add a dated section) instead of starting
  new files. Find them first:

  | Area | Spec | Plan |
  |---|---|---|
  | v1 foundations (auth, posting, versions, attempts) | `specs/2026-10-27-qbautopost-dashboard-design.md` | `plans/2026-10-27-qbautopost-dashboard.md` |
  | Statements, statement page, audit trail, users (v2) | `specs/2026-10-28-dashboard-v2-pages-design.md` | `plans/2026-10-28-dashboard-v2-pages.md` |
  | Home dashboard | `specs/2026-10-28-home-dashboard-spec.md` | `plans/2026-10-28-home-dashboard-plan.md` |

- **Spec must cover**: goal and scope; what in the codebase it touches (read the real files, do not guess); behaviour
  and UI states (loading, empty, error, partial data); data sources (existing endpoints only, unless the API
  requirements doc is updated too); roles and permissions; testable acceptance criteria.
- **Plan must cover**: files to create and modify; ordered tasks, each with its dependencies and expected outcome;
  tests to add or change; the verification commands; a milestone checklist.
- **Small fixes** (a one-line bug, copy, a style tweak) still get both files, but short: a few lines each is fine
  (problem, cause, fix, test / files, steps, checks).
- **After implementing**: tick the plan's milestones, record verification results (actual output, including failures)
  and anything deferred, and update the spec where the build differed from it. The docs must match the code.
- **If the change needs anything new from the API**: also update `docs/api-requirements-for-dashboard.md`: add or
  amend an `R-n` item, its row in the **Tracker** (and in "APIs the dashboard needs built" if it is an endpoint), and a
  **Changelog** line. Never reuse an `R-n` id. Implement the new shape in `src/mocks/` exactly as written there.

If a request arrives without a spec and plan, write them first and say so. Do not skip this because a change looks
trivial.

## Commands

```
npm run dev:mock      # app + fake API in the browser (MSW); sign in as asha@example.com / correct horse battery
npm run dev           # against a real API: VITE_API_PROXY_TARGET=https://localhost:5443
npm run lint          # eslint
npm run build         # tsc -b + vite build (this is the type-check)
npm test              # vitest (jsdom + MSW); npx vitest run <path> for one file
npm run e2e           # playwright against dev:mock on port 5174
```

Done means lint, build and test pass. Report failures as they are. `StatementPage.test.tsx` has two tests that can hit
the 5 s timeout under full-suite load but pass when run alone; say so if it happens, do not hide it.

## Architecture

```
src/
  main.tsx            providers (theme, QueryClient, Tooltip, Router); starts MSW when MODE === 'mock'
  router.tsx          route table: / (Home), /statements[/:id], /audit, /users[/:id] (admin), /account, auth pages
  api/
    client.ts         fetch wrapper: base /api/v1, bearer token from memory, one refresh-and-retry on 401
    schema.ts         hand-written API types (to be replaced by `npm run gen:api` output)
    problem.ts        RFC 7807 problems → ApiError
    queries/*.ts      every server call lives here as a React Query hook, with its query keys
  auth/               SessionProvider, RequireAuth, sign-in, change password, hasScope()
  layout/             AppShell (sidebar, sticky header, breadcrumb, Ctrl K menu, DB health)
  components/ui/      shadcn primitives (added with the shadcn CLI; see below)
  components/         app-wide pieces: PageHeader, DataPanel/EmptyState/Pager, ProblemAlert, StatusBadge,
                      FlagChips, Money, Timestamp, PushId, filters/ (URL-backed filter chips)
  features/<area>/    one folder per page/area: home, statements/{list,detail,sheet}, requests/{transactions,
                      posting,versions,attempts,dialogs}, audit, users, account
  lib/                pure helpers (dates, money, pushId, pageParam, motion)
  mocks/              fake API: handlers/ per area, fixtures/, in-memory db, derived audit feed
  test/               vitest setup (MSW server, jsdom shims) and renderApp / renderWithProviders
docs/
  api-requirements-for-dashboard.md   what the API must provide: R-1…R-12, tracker, changelog
  superpowers/specs, superpowers/plans
```

**Data flow**: page component → hook in `api/queries/` → `api` client → `/api/v1/...` (the real API, or MSW in mock mode
and tests). No other state library. URL search params hold filters and view state (`useUrlFilters`). Small stores hold
cross-component flags (`draftDirtyStore`, `postFlightStore`).

## Conventions to follow

- **Data**: add calls only in `api/queries/`. Keys hang off `requestKeys`, `['audit', …]`, `userKeys`. Mutations
  invalidate `requestKeys.all` and `['audit']` when they change statement state. Lists use `keepPreviousData`.
- **Permissions**: drive statement buttons from the API's `allowedActions`, never from local role/status rules. Admin
  UI uses `hasScope(me, 'users:manage')`. The API enforces everything anyway.
- **Never** (v1 anti-goals): post twice or auto-retry a post; post a version the user did not see (send `If-Match` with
  the ETag on screen); silently write, round or recompute `controlTotal` or any stored amount; render payload or email
  strings as HTML; store the access token anywhere but memory.
- **UI**: shadcn/ui only, no other component library. Add missing primitives with `npx shadcn@latest add <name>`,
  answer **no** to overwriting existing files, and check the generated file: it must import `cn` from `@/lib/utils`,
  and must not add stray packages or `dangerouslySetInnerHTML` (lint rule `react/no-danger`). Compose app components
  from the primitives; reuse `PageHeader`, `DataPanel`, `EmptyState`, `ProblemAlert` and `StatusBadge` instead of new
  look-alikes.
- **Design tokens** (`src/index.css`): "a ledger, not a dashboard". Semantic colours only (`primary`, `success`,
  `warning`, `destructive`, `info` and their `-soft` tints, `chart-1`, `chart-2`); never raw palette colours. Pages
  use the `.page` frame. Status is always icon + word, never colour alone. Respect `prefers-reduced-motion`. Layouts
  must not scroll sideways at 375 px.
- **Charts**: Recharts through `components/ui/chart.tsx`, loaded with `React.lazy` so it stays out of the main chunk.
  Never fabricate data: every figure comes from an API response. Give each chart an accessible summary or a hidden
  table.
- **Mock API**: `src/mocks/` must match `docs/api-requirements-for-dashboard.md`. When a shape changes, change both.
- **Tests**: colocated `*.test.ts(x)`. Use `renderApp(route)` for page tests, `mockControl.signInAs(...)` for the role, and
  `server.use(...)` to override one endpoint. Pure logic gets unit tests (see `features/home/homeMetrics.test.ts`).
- **Style**: match the surrounding code: small modules, short JSDoc comments that say why, sentence-case UI copy,
  active verbs on buttons.
