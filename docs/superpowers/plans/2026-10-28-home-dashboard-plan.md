# QbAutopost Dashboard: Home page — implementation plan

**Date**: 2026-10-28 · **Spec**: `docs/superpowers/specs/2026-10-28-home-dashboard-spec.md` (section numbers below
refer to it).
**Location note**: the brief named `specs/home-dashboard-plan.md`; this repo keeps plans in `docs/superpowers/plans/`.

Rule for the whole plan: reuse what exists (`PageHeader`, `EmptyState`, `ProblemAlert`, `StatusBadge`, `FlagChips`,
`Money`, `formatRelative`, `useUrlFilters`, `auditSentence`, shadcn `Card` / `ToggleGroup` / `Button` / `Tooltip` /
`Skeleton` / `Table`). No new abstractions beyond the feature folder and one query module.

## 1. File structure

```
src/
  api/queries/home.ts                 NEW  useAuditCounts, useAuditTrend (+ fetch helpers)
  components/ui/chart.tsx             NEW  shadcn chart (CLI-generated; recharts)
  features/home/
    HomePage.tsx                      NEW  page: header, bands, layout, period, refresh
    homeMetrics.ts                    NEW  pure: periods, buckets, ages, deltas, greeting, links
    homeMetrics.test.ts               NEW
    QueueBand.tsx                     NEW  band A (hero + 3 tiles)
    ThroughputBand.tsx                NEW  band B (4 period tiles)
    FlowChart.tsx                     NEW  C1 grouped columns (recharts via ChartContainer)
    StatusBreakdown.tsx               NEW  C2 labelled meter list
    WaitingCard.tsx                   NEW  D1 age bars + oldest table
    RecentActivity.tsx                NEW  D2 timeline
    CardState.tsx                     NEW  per-card skeleton / error-with-retry helpers
    HomePage.test.tsx                 NEW
  router.tsx                          MOD  `/` → HomePage, crumb Home
  layout/AppSidebar.tsx               MOD  Home nav item
  layout/CommandMenu.tsx              MOD  Home page entry
  auth/SignInPage.tsx                 MOD  default destination `/`
  auth/ChangePasswordPage.tsx         MOD  default destination `/`
  lib/motion.ts                       NEW  prefersReducedMotion()
  index.css                           MOD  --chart-1, --chart-2 tokens (light + dark) and @theme mapping
  test/setup.ts                       MOD  drop Recharts' jsdom 0×0 size warning
  layout/AppShell.test.tsx            MOD  `/` is Home now; sidebar lists Home
  auth/auth.test.tsx                  MOD  change-password success lands on `/`
e2e/v2.spec.ts                        MOD  sign-in lands on `/`
```

## 2. Tasks, in order

### T1. Chart primitive and tokens
- **Do**: `npx shadcn@latest add chart` (installs `recharts`, writes `src/components/ui/chart.tsx`). Add
  `--chart-1` / `--chart-2` to `:root` and `.dark` and `--color-chart-1/2` to `@theme inline` with the validated
  values (spec §5).
- **Depends on**: nothing. **Outcome**: `ChartContainer` importable; `bg-chart-1` utility works; build passes.

### T2. Pure metrics (`homeMetrics.ts`) — test first
- `PERIODS = [7, 30, 90]`, `periodRange(days, now)` → `{ from, to, prevFrom }` as `Date`s (local midnight
  arithmetic) (§4).
- `bucketEvents(events, range, days)` → `[{ key, start, end, label, received, posted }]`, daily for 7/30, ISO weeks
  for 90, empty buckets filled (§5.1).
- `ageBuckets(items, now)` → 4 ordered buckets with counts and `receivedFrom/To` dates (§5.3).
- `delta(curr, prev)` → `{ diff, text }` (`+6`, `−2`, `No change`, `none the 30 days before`) (§4.2).
- `successRate(posted, failed)` → integer % or null.
- `greeting(date)`; `reviewCount(stats, isAdmin)` reusing `countFor('review')`.
- Link builders: `auditHref(action, from, to)`, `statusHref(status)`.
- **Depends on**: none. **Outcome**: `homeMetrics.test.ts` green.

### T3. Data hooks (`api/queries/home.ts`)
- `fetchAuditTotal(params)` (pageSize 1 → `total`), `useAuditCounts(range)` (8 totals in one `Promise.all`),
  `useAuditTrend(range)` (paged, cap 10 × 200, `truncated` flag). Keys under `['audit','home',…]`;
  `placeholderData: keepPreviousData`. Params are serialised ISO strings so the keys are stable.
- **Depends on**: T2 (range type). **Outcome**: hooks type-check; exercised by page tests (T6).

### T4. Components
1. `CardState.tsx`: `CardError({ error, onRetry })` (compact `ProblemAlert` + Try again), skeleton blocks.
2. `StatTile.tsx`: a `Card` wrapped in a `Link`; props `label`, `value`, `hint`, `tone`, `icon`, `to`, `aria-label`.
3. `QueueBand.tsx` (A): stats + oldest-waiting from the queue list.
4. `ThroughputBand.tsx` (B): counts + deltas + success rate; links to `/audit`.
5. `FlowChart.tsx` (C1): `ChartContainer` + `BarChart` (two `Bar`s, radius `[4,4,0,0]`, `maxBarSize` 24,
   `accessibilityLayer`, `isAnimationActive` off under reduced motion); click → `navigate(auditHref)`; sr-only
   table; truncated note; empty state.
6. `StatusBreakdown.tsx` (C2): six rows of `StatusBadge` + count + meter, each a `Link`.
7. `WaitingCard.tsx` (D1): horizontal age bars (plain CSS bars inside links, one colour, value at tip — 4 bars do not
   need a chart library and stay clickable/focusable) + shadcn `Table` of the 5 oldest.
8. `RecentActivity.tsx` (D2): `<ol>` timeline using `auditSentence`, `actionLabel`, `formatRelative`.
- **Depends on**: T1–T3. **Outcome**: each renders loading / error / empty / data.

### T5. Page, route, navigation
- `HomePage.tsx`: `PageHeader` (greeting, description with "Updated HH:mm"), actions = `ToggleGroup` period
  (URL `period` via `useUrlFilters` enum spec), Refresh (`invalidateQueries` `requestKeys.all` + `['audit']`),
  primary **Review statements**. Bands A, B, rows C, D in the grid of spec §7.
- `router.tsx`: replace `{ path: '/', element: <RedirectToStatements /> }` with
  `{ index: true, element: <HomePage />, handle: { crumb: 'Home' } }` under the shell (keep `path: '/'`).
- `AppSidebar.tsx`: Home item first in Work, `active={pathname === '/'}`.
- `CommandMenu.tsx`: `{ label: 'Home', to: '/', icon: LayoutDashboardIcon }` first.
- `SignInPage.tsx`, `ChangePasswordPage.tsx`: fallback `'/'`.
- **Depends on**: T4. **Outcome**: app lands on Home; all old routes intact.

### T6. Tests
- `HomePage.test.tsx` (MSW, `renderApp('/')`):
  - stats override → hero 7 for editor / 10 for admin; admin sees Needs a decision, editor sees Posting now.
  - tile hrefs (`/statements?tab=errors`, `/statements?duplicate=true`).
  - audit totals per action via `server.use` → band B values + delta text; `period=7` in URL changes the requested
    `from` (asserted on the captured request URL).
  - clicking the 7-days toggle writes `?period=7`.
  - audit endpoint 500 → band B shows Try again; band A still shows its numbers (partial data).
  - empty queue → "All clear. Nothing waiting."
  - recent activity renders sentences from the mock feed and links to `/audit`.
- Update `AppShell.test.tsx` (`/` stays on `/` and shows Home; sidebar has Home), `auth.test.tsx`
  (change-password → `/`), `e2e/v2.spec.ts` sign-in URL.
- **Depends on**: T5. **Outcome**: `npm test` green.

### T7. Responsive and accessibility pass
- Check 360 / 768 / 1280 / 1440 widths in the browser on `npm run dev:mock`: no horizontal scroll, tiles reflow,
  chart resizes, table hides columns below `md`.
- Keyboard: Tab order header → tiles → chart → lists; visible focus; chart tooltip on focus.
- Dark mode check of chart colours and meters.
- **Depends on**: T5. **Outcome**: screenshots inspected, issues fixed.

### T8. Validation
- `npm run lint`, `npm run build` (includes `tsc -b`), `npm test`. Check the build's chunk-size output; if Recharts
  pushes the main chunk past the warning, code-split the Home route with `lazy`.
- **Depends on**: T6, T7. **Outcome**: all green, recorded in §4.

### T9. Documentation
- Update the spec for any decision that changed; tick §3 below; record results and limitations in §4.

## 3. Milestones
- [x] M1 Chart primitive and tokens (T1)
- [x] M2 Metrics with unit tests (T2)
- [x] M3 Data hooks (T3)
- [x] M4 Components (T4)
- [x] M5 Page, route, navigation (T5)
- [x] M6 Tests (T6)
- [x] M7 Responsive / a11y / visual pass (T7)
- [x] M8 Lint, build, tests (T8)
- [x] M9 Docs updated (T9)

## 4. Results and known limitations

**Changes from the plan**
- No `StatTile.tsx`: bands A and B became one panel and one ledger strip (spec §10), so each band renders its own
  linked cells.
- `npx shadcn add chart` also installed an unrelated `cn` package and generated `import { cn } from "cn"`; the package
  was removed and the import pointed at `@/lib/utils` like every other ui file. The generated `ChartStyle` used
  `dangerouslySetInnerHTML` (fails the repo's `react/no-danger` rule); it now renders the same CSS as a text child.
- Route-level `lazy` blanked the landing page until the chunk loaded (and broke tests under load); replaced with
  `React.lazy` for the chart only.

**Validation (2026-10-28)**
- `npm run lint`: clean.
- `npm run build` (`tsc -b` + Vite): passes. `FlowChart` chunk 364 kB (110 kB gzip). The main chunk (948 kB) still
  triggers Vite's 500 kB warning, as it did before this work (the main bundle was ~925 kB before Home).
- `npm test`: 432 tests, 18 of them new (11 in `homeMetrics.test.ts`, 7 in `HomePage.test.tsx`). One full run passed
  432/432. Other full runs had 1–2 failures, always in `StatementPage.test.tsx` (`add and delete`, `⋯ menu shows …`),
  each a 5 s per-test timeout under parallel load. They take 2–3 s and pass when that file runs alone. This work does
  not touch that page; raising its timeout is a separate fix.
- E2E (`e2e/v2.spec.ts`): sign-in helper updated for the new landing page; **not run** in this session.
- Browser (mock mode, Chrome): checked at 1440 (light), 768 (dark) and 375 (phone).
  - No horizontal scroll at any of the three widths, after fixing a queue-list overflow at 375.
  - The flow chart tooltip shows the day and both counts.
  - Clicking a column opened `/audit?action=posted&from=2026-10-20&to=2026-10-20` with exactly the one counted event.
  - The 90-day weekly buckets sum to the band B totals.
  - Console: only the existing `next-themes` script notice and the session-restore 401.

**Known limitations**: see spec §10.

## 5. Change 2026-10-29: summary endpoint (spec §11)

**Files**
- `src/api/schema.ts`: `DashboardSummary` type.
- `src/api/queries/home.ts`: `summaryOptions`, `useSummaryCounts`, `useSummaryTrend`, `useSummaryFigures` (one query,
  three `select`s; 404 → `null`); `useAuditCounts` / `useAuditTrend` take `{ enabled }`.
- `src/features/home/homeMetrics.ts`: `bucketSeries` (series → `FlowBucket[]`, shares the bucket frame with
  `bucketEvents`), `formatMinutes`.
- `src/features/home/FlowChart.tsx`: buckets from `trend.series` when present.
- `src/features/home/PostedFigures.tsx` (new): Posted value and Time to post.
- `src/features/home/HomePage.tsx`: summary first, audit feed only on 404.
- `src/mocks/handlers/dashboard.ts` (new), `src/mocks/handlers/index.ts`: the R-11 mock.
- Tests: `homeMetrics.test.ts` (`bucketSeries`, `formatMinutes`), `HomePage.test.tsx` (summary path; existing tests
  pinned to the fallback with a 404 override), `src/mocks/handlers/dashboard.test.ts`.

**Tasks**
1. Types and query hooks (depends on nothing) → `tsc -b` clean.
2. `bucketSeries`, `formatMinutes` with unit tests.
3. FlowChart and PostedFigures; HomePage wiring.
4. Mock handler and its test; Home tests for both paths.
5. Integration: `e2e-integration/review.spec.ts` Home test checks the summary call and the new figures.

**Verification**: `npm run lint`, `npm run build`, `npm test`, then the integration suite against Docker.

**Milestones**
- [x] Hooks and types
- [x] Metrics helpers and tests
- [x] Components and page
- [x] Mock and tests
- [x] Integration test green

**Results (2026-10-29)**: `homeMetrics.test.ts` 20 passed (new `bucketSeries`, `formatMinutes`); `HomePage.test.tsx`
9 passed (two new summary tests; the audit-feed tests now run with a summary 404); `dashboard.test.ts` 3 passed
(mock counts equal the mock audit totals, series sums to them). Against the real API, the integration Home test sees
one `/dashboard/summary` call, no `pageSize=1` audit counts, and the Posted value and Time to post figures. No
sideways scroll at 375 px. Built as specified; no deviation.
