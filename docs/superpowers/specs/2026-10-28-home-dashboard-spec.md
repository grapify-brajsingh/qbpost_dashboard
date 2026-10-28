# QbAutopost Dashboard: Home page — specification

**Date**: 2026-10-28 · **Status**: implemented 2026-10-28 (see §10 for what changed during the build)
**Builds on**: `2026-10-27-qbautopost-dashboard-design.md` (v1) and `2026-10-28-dashboard-v2-pages-design.md` (v2).
Everything there still holds, including the v1 anti-goals (§2), unless this document changes it.
**Plan**: `docs/superpowers/plans/2026-10-28-home-dashboard-plan.md`.
**Location note**: the brief named `specs/home-dashboard-spec.md`; this repo keeps specs in `docs/superpowers/specs/` with
a date prefix, so the file follows that convention.

---

## 1. Objective and scope

### 1.1 Purpose
A **Home** page at `/`. It is where a signed-in user lands, and it answers three questions in this order:

1. **What needs me right now?** How many statements are waiting, how many have errors or look like duplicates, how
   many need an admin's decision, and how long the oldest one has been waiting.
2. **How is the flow going?** Over a chosen period: statements received from n8n, posted to QuickBooks, failed
   posts and discarded statements, compared with the period before.
3. **What just happened?** The latest entries from the audit trail.

Every number links to the existing page that lists the records behind it. The Home page only summarises. Editing and
posting stay on the Statements and statement pages.

### 1.2 Users
- **The accountant (admin)**: the daily user. Clears about 10 statements each morning, the largest about 200 rows
  (v1 context). Also sees partial and unknown posts, which only admins can resolve.
- **Editors**: review, edit and post. Same Home page, without the admin-only "needs a decision" figure.
- **Viewers**: read-only. Same as editors.

### 1.3 Problems it solves
- Today, signing in goes straight to the Statements table. That table shows one tab at a time, so there is no
  single view of the whole queue, of how old the oldest waiting statement is, or of how many posts failed this week.
- Post failures and discards are only visible one statement at a time, or by filtering the audit trail by hand.
- There is no view of throughput: whether statements are being cleared as fast as n8n saves them.

### 1.4 Out of scope
- Any new API endpoint or field. The page uses only endpoints the app already calls (§2.3).
- Money totals per period. No endpoint gives posted amounts by post date (see §4.3).
- Per-user productivity figures. They could be derived from the audit feed, but the brief never asks for them, and
  ranking people is not this tool's job.
- Bulk actions (a v1 non-goal).

## 2. Application analysis

### 2.1 Workflow
n8n reads a statement email → `POST /saved-requests` (status `pending`, audit action `received`) → a person reviews and
edits the rows on `/statements/:id` → **Post** (`posting`) → `posted`, or `partial` / `unknown` (admin resolves), or
the attempt fails (`post-failed` audit action, statement stays `pending`). A statement can be `discarded` and later
`restored`.

### 2.2 Routes and navigation (before this change)
| Route | Page | Crumb |
|---|---|---|
| `/` | redirect to `/statements` | — |
| `/requests`, `/requests/:id` | v1 redirects to `/statements…` | — |
| `/statements` | Statements list (status tabs `review`, `errors`, `posted`, `discarded`, `all`; URL filters `q`, `receivedFrom`, `receivedTo`, `reference`, `emailFrom`, `minTotal`, `maxTotal`, `duplicate`) | Statements |
| `/statements/:id` | Statement page | Statement |
| `/audit` | Audit trail (URL filters `q`, `actor`, `from`, `to`, `requestId`, `reference`, `action`) | Audit trail |
| `/users`, `/users/:id` | Users (admin, scope `users:manage`) | Users |
| `/account` | My account | My account |

Sign-in and change-password send the user to `next`, or to `/statements` when there is no `next`
(`SignInPage.tsx`, `ChangePasswordPage.tsx`). The sidebar (`AppSidebar.tsx`) has a **Work** group (Statements with a
to-review badge, Audit trail) and an **Admin/Account** group. The command menu (`CommandMenu.tsx`) lists the same pages.

### 2.3 Data sources (all existing)
| Endpoint | Hook | What the Home page uses |
|---|---|---|
| `GET /saved-requests/stats` | `useStats` | `byStatus` counts; `hasErrors.pending`; `duplicate.pending`; `needsAttention`. **Current state only, no time dimension.** |
| `GET /saved-requests?status=…&sort=received&pageSize=100` | `useRequestsList` | The to-review queue, oldest first: `email.receivedUtc` (or `created.utc`), `publicRef`, `email.subject`, `reference`, `transactionCount`, `controlTotal`, `validationSummary.problemCount`, `duplicate.flagged`, `lastAttempt`. Server max `pageSize` is 100. |
| `GET /audit-events?action=…&from=…&to=…&page=…&pageSize=…` | `useAuditEvents`, plus a new paged fetch | Time series and period counts. Each event has `atUtc`, `action`, `actor`, `request`. `total` is the full count for the filter. `from` / `to` are UTC instants. Max `pageSize` 200. Sorted newest first. Viewers and editors never receive `user-*` events (the API filters them). |

The `received`, `posted`, `post-failed` and `discarded` audit actions are exactly the events the throughput figures
need, and the audit feed is append-only, so a period's counts and the previous period's counts are both real.

### 2.4 Reusable UI and conventions
- **shadcn/ui (new-york)** components in `src/components/ui`: `card`, `badge`, `button`, `skeleton`, `separator`,
  `tooltip`, `toggle-group`, `table`, `alert`, `popover`, `calendar`, and others. **Missing**: `chart` (shadcn's
  Recharts wrapper). It is added with the shadcn CLI, which also installs `recharts`.
- **App components**: `PageHeader`, `DataPanel` / `EmptyState` / `TableSkeleton`, `ProblemAlert`, `StatusBadge`,
  `FlagChips`, `Money`, `Timestamp`, `PushId`; helpers `formatMoney`, `formatTimestamp`, `formatRelative`
  (`lib/dates.ts`), `useUrlFilters`, `formatDate`; `auditSentence` and `actionLabel` (Audit page).
- **Page frame**: `.page` (max 1440px, `gap-5`, `px-4 md:px-8`). The header bar is sticky with a breadcrumb.
- **Tokens** (`index.css`, "a ledger, not a dashboard"): paper and ink neutrals, one bottle-green `--primary` for
  action, status tokens `success` / `warning` / `destructive` / `info`, each with a `-soft` tint. Geist and Geist Mono.
  Radius 0.5rem. Components use semantic tokens, never raw palette colours. `prefers-reduced-motion` is honoured
  globally.
- **Patterns**: React Query (`requestKeys`, `['audit', …]` keys; mutations invalidate `requestKeys.all` and
  `['audit']`). Errors are RFC 7807 problems shown with `ProblemAlert`. Loading states are skeletons the same size as
  the content.

## 3. Information architecture

Top to bottom, in order of importance:

```
┌ PageHeader ───────────────────────────────────────────────────────────────────────────────┐
│ Good morning, Asha                                [7 days|30 days|90 days] [⟳] [Review statements →] │
│ What's waiting for you, and how the last 30 days went. · Updated 09:41                    │
└───────────────────────────────────────────────────────────────────────────────────────────┘
┌ A. Right now (live) ───────────────────────────────────────────────────────────────────────┐
│ ┌ Hero: To review ─────────────┐ ┌ Has errors ┐ ┌ Possible duplicates ┐ ┌ Needs a decision* ┐ │
│ │ 12                           │ │ 3          │ │ 1                   │ │ 2                 │ │
│ │ statements to review         │ │            │ │                     │ │ partial · unknown │ │
│ │ Oldest waiting 3 days        │ └────────────┘ └─────────────────────┘ └───────────────────┘ │
│ └──────────────────────────────┘          * admins; others see "Posting now"                │
└───────────────────────────────────────────────────────────────────────────────────────────┘
┌ B. Last 30 days ──────────────────────────────────────────────────────────────────────────┐
│ Received 41 (+6) │ Posted 37 (−2) │ Post failures 3 (92% succeeded) │ Discarded 2 (±0)     │
└───────────────────────────────────────────────────────────────────────────────────────────┘
┌ C1. Statement flow (2/3) ───────────────────────┐ ┌ C2. All statements (1/3) ─────────────┐
│ columns: received vs posted per day              │ │ Pending  ███████░░  12               │
│                                                  │ │ Posted   ██████████ 140  …           │
└──────────────────────────────────────────────────┘ └──────────────────────────────────────┘
┌ D1. Waiting for review (2/3) ───────────────────┐ ┌ D2. Recent activity (1/3) ───────────┐
│ age bars: Today · 1–2 days · 3–6 days · 7+ days  │ │ • Asha posted 12 rows · SR-000041 2m │
│ table: 5 oldest (ref, subject, waiting, rows,…)  │ │ • n8n received SR-000042 · 10m       │
└──────────────────────────────────────────────────┘ └──────────────────────────────────────┘
```

- **Heading**: `Good morning|afternoon|evening, {first name}` (local time; 05–12, 12–18, else evening). The
  breadcrumb says **Home**.
- **Description**: "What's waiting for you, and how the last {period} went." plus "Updated {HH:mm}", the time the
  live counts last loaded.
- **Primary action**: **Review statements** → `/statements` (the To review tab). **Secondary**: the period selector and
  Refresh.
- Band A always shows the **current state** and ignores the period. Its label says "Right now" so nobody reads it as
  period data. Bands B, C1 and the period part of D2 use the period. C2 and D1 are current state.

## 4. KPI and metric specification

Period `P` = the last *N* local calendar days including today (*N* = 7, 30 or 90): `from` = local midnight *N*−1
days ago, `to` = now. Previous period `P'` = the *N* days before `from`. Times go to the API as UTC instants
(`toISOString()`), the same way the Audit page already sends its date filter.

### 4.1 Band A: right now (current state, polled every 60 s like the Statements page)
| Metric | Meaning | Calculation | Source | Available | Display / click |
|---|---|---|---|---|---|
| **To review** (hero) | Statements a person must open | `byStatus.pending` (+ `partial` + `unknown` for admins). The same rule as the sidebar badge and the To review tab (`countFor('review')`). | stats | yes | ≥48px number; 0 shows "All clear". → `/statements` |
| **Oldest waiting** | How long the queue's oldest item has waited | `now − (email.receivedUtc ?? created.utc)` of the first row of the to-review list sorted `received` ascending | list | yes | "Oldest waiting 3 days" under the hero, as relative time |
| **Has errors** | Pending statements whose stored validation has problems | `hasErrors.pending` | stats | yes | tile → `/statements?tab=errors` |
| **Possible duplicates** | Pending statements flagged as a possible duplicate | `duplicate.pending` | stats | yes | tile → `/statements?duplicate=true` |
| **Needs a decision** (admin) | Posts in `partial` or `unknown`, which only an admin can resolve | `byStatus.partial + byStatus.unknown` | stats | yes | tile → `/statements` (admin To review includes them) |
| **Posting now** (non-admin) | Posts in progress | `byStatus.posting` | stats | yes | tile → `/statements?tab=all` |

Tiles whose value is above 0 and that mean trouble (errors, duplicates, needs a decision) show a status icon and a
`warning` / `destructive` accent. At 0 they stay neutral, with a check icon and the text "None".

### 4.2 Band B: period throughput (period `P`, compared with `P'`)
| Metric | Meaning | Calculation | Source | Display / click |
|---|---|---|---|---|
| **Received** | Statements n8n saved | `total` of `/audit-events?action=received&from&to&pageSize=1` | audit | count; delta vs `P'` → `/audit?action=received&from&to` |
| **Posted** | Successful post attempts | `total` for `action=posted` | audit | count; delta → `/audit?action=posted&…` |
| **Post failures** | Failed post attempts (held, refused, busy, unavailable, error, …) | `total` for `action=post-failed`; success rate `posted / (posted + failed)` when the denominator > 0 | audit | count + "92% of attempts succeeded"; delta → `/audit?action=post-failed&…` |
| **Discarded** | Statements thrown away | `total` for `action=discarded` | audit | count; delta → `/audit?action=discarded&…` |

- **Delta**: an absolute signed difference (`+6`, `−2`, `No change`) against `P'`, never a percentage. With
  ~10 statements a day, percentages swing wildly and divide by zero. If `P'` had 0 events the delta reads
  "none the 30 days before".
- **Delta colour**: direction × whether up is good. Received is neutral (no colour). Posted up = good. Failures and
  discards up = bad. The sign and the word are always shown, so colour is never the only signal.
- The counts come from `total` alone (pageSize 1), so they are exact even when the trend chart is capped (§5.1).
- Each count is the number of audit events, which can differ from the number of distinct statements: one
  statement can fail twice, then post. Tooltips say "post attempts".

### 4.3 Metrics considered and rejected
| Metric | Why not |
|---|---|
| Dollar value posted per period | No endpoint returns posted amounts by post date. The list sorts by received, created, updated, total and rows, not by post date, and `postSummary.postedUtc` is not filterable. Not shown. Logged as an API gap (§8.6). |
| Rows posted per period | `posted` events carry `detail.postedCount` in the mock, but the API contract does not require it, and summing it needs every event fetched. Not shown in v1 of Home. |
| Average time to post | Needs the received and posted times of each statement paired up. Possible from the audit feed, but costly and fragile with capped pages. Deferred. |
| Per-user activity | See §1.4. |

## 5. Data visualisation specification

Chart colours are two new tokens, used only by charts and checked with the dataviz validator (both modes PASS all
six checks: lightness band, chroma floor, CVD ΔE ≥ 8, normal-vision ΔE ≥ 15, contrast ≥ 3:1):

| Token | Light | Dark | Role |
|---|---|---|---|
| `--chart-1` | `#5a7fd0` | `#6a8fe0` | Received (identity) |
| `--chart-2` | `#2a9468` | `#33a473` | Posted (identity) |

Status meanings (failed, warning) use the existing status tokens, never chart tokens. Marks follow the dataviz spec:
columns ≤ 24px wide with 4px rounded tops, 1px solid recessive grid, a 2px gap between adjacent bars, text in text
tokens only, a legend for ≥ 2 series, and a tooltip on hover.

### 5.1 C1. Statement flow (grouped columns)
- **Question**: are statements being cleared as fast as they arrive?
- **Data**: audit events `action=received` and `action=posted` in `P`, fetched 200 per page, newest first, up to
  **10 pages (2,000 events)**. Bucketed by local day (7 and 30 days) or by week starting Monday (90 days). Empty
  buckets show as 0, so the time axis is continuous.
- **Form**: grouped columns (received, posted) per bucket. Columns rather than lines because the counts are small
  integers per discrete day, and many days have 0. One y-axis (count), integer ticks, x-axis labels `d MMM`, thinned
  automatically.
- **Tooltip**: "Tue 27 Oct · Received 4 · Posted 3"; weekly buckets say "Week of 19 Oct".
- **Click**: a column → `/audit?action={received|posted}&from={day}&to={day or week end}`. This drills into the exact
  events. The cursor and the tooltip footer ("Click to see these in the audit trail") make it discoverable.
- **Capped data**: if the feed holds more than 2,000 such events, the oldest buckets are incomplete. The card then shows
  an inline note: "Showing the latest 2,000 events; earlier days may be undercounted." The band B counts stay exact.
- **Empty**: "Nothing was received or posted in the last {period}."
- **Accessible**: a `figure` with an `aria-label` summary ("Received 41 and posted 37 statements in the last 30 days;
  busiest day 27 Oct with 6 received") and a visually hidden table of every bucket.

### 5.2 C2. All statements by status (labelled meter list, not a donut)
- **Question**: where does every statement stand?
- **Data**: `stats.byStatus` (current state).
- **Form**: six rows, in workflow order (pending, posting, partial, unknown, posted, discarded). Each row has a
  `StatusBadge`, the count, and a thin horizontal meter (width = count / max count) in the status's tone. Chosen over a
  donut because the six values are far apart (posted dwarfs the rest), so small slices would be unreadable. Labels
  carry identity, so colour is never the only signal.
- **Click**: row → the matching Statements tab (pending → `?tab=review`, posted → `?tab=posted`, discarded →
  `?tab=discarded`, others → `?tab=all`).
- **Footer**: total, "N statements in all".

### 5.3 D1. Waiting for review (age bars + oldest-first table)
- **Question**: is anything going stale?
- **Data**: the to-review list (`status` = pending, plus partial and unknown for admins), `sort=received`,
  `pageSize=100`. Age = local calendar days between the received date (`email.receivedUtc ?? created.utc`) and today.
- **Age bars**: four ordered buckets: **Today**, **1–2 days**, **3–6 days**, **7+ days**. Horizontal bars, one series in
  one colour (`--chart-1`), value at the bar tip. Click → `/statements?receivedFrom=…&receivedTo=…` for that bucket's
  dates (7+ days: `receivedTo` only).
- **If the queue holds more than 100**, the list holds the 100 *oldest*. Every older bucket is complete, but "Today"
  and the younger buckets may miss rows. The card says "Based on the 100 oldest of {total}".
- **Table**: the 5 oldest rows: Ref (`publicRef`, mono), Statement (`email.subject ?? reference ?? '—'`, truncated, title
  attribute), Waiting (relative), Rows, Control total (`Money`), Flags (the existing `FlagChips`: needs attention, possible duplicate). Each row
  links to `/statements/:id`. Footer link: "Open the queue" → `/statements`.
- **Empty**: "All clear. Nothing waiting." (the same words as the Statements page).

### 5.4 D2. Recent activity (timeline)
- **Data**: `useAuditEvents({ pageSize: 8 })`, newest first. It uses the API's own role filtering, so viewers never
  see user events.
- **Form**: a vertical timeline. Each entry has an action icon (tone by action: posted = success, post-failed =
  destructive, discarded = muted, others = muted), the actor's name, `auditSentence(e)`, a statement link
  (`publicRef` → `/statements/:id`) when the event has a request, and a relative time with the full timestamp on
  hover.
- **Footer**: "Open the audit trail" → `/audit`.

## 6. Interactions
- **Period selector**: a `ToggleGroup` (single, required) with 7 days / 30 days / 90 days. Kept in the URL as
  `?period=7|30|90` (default 30), through `useUrlFilters` with an `enum` spec, so it survives reload and back/forward.
  Changing it refetches B and C1 only. Previous data stays on screen, dimmed, while the new data loads
  (`keepPreviousData`).
- **Refresh**: an icon button with the tooltip "Refresh". It invalidates `requestKeys.all` and `['audit']`, so the
  sidebar badge refreshes too. The icon spins while any Home query is fetching.
- **Card navigation**: every stat tile is one `Link` (the whole card is the target), with a visible focus ring and a
  hover lift (border tint, no movement under reduced motion).
- **Chart tooltips**: hover and keyboard focus (Recharts `accessibilityLayer`).
- **Drill-down**: as in §4 and §5. All destinations are existing pages and existing URL filters. No new filters are
  needed on any page.
- **Search**: not duplicated. The sidebar's "Search or jump to…" (Ctrl K) already exists on every page.
- **Export**: none. The Audit trail already exports CSV of the same events.

## 7. UI/UX requirements
- **Layout**: `.page` frame. Band A is a 12-column grid: hero 5 columns, three tiles of 7/3 columns at `xl`. At `md`
  the hero is full width and the tiles are 3 across. Below `sm` everything stacks in one column. Band B has 4 tiles
  (`lg`), 2×2 (`sm`), 1 column below. Rows C and D are `lg:grid-cols-3` with spans of 2 + 1, stacked below `lg`.
- **No horizontal page scroll** at 360px. The D1 table hides Rows and Control total below `md` and scrolls inside its
  own panel if needed.
- **Hierarchy**: one hero figure (To review) per page, closed by the ledger's double rule (`.rule-double`). Section
  headings are sentence case (no all-caps eyebrows). Band A is **one** panel (hero left, a ruled list of the three
  queue figures right) and band B is **one** ruled ledger strip of four cells, rather than a grid of identical cards.
  Cards use `Card` with the existing border and `shadow-sm`.
- **Loading**: each card shows its own skeleton, the same shape as its content. The page never blocks on one query.
- **Errors (partial data)**: a failed query replaces only its own card body with a compact `ProblemAlert` and a
  **Try again** button. The rest of the page keeps working.
- **Empty**: as in §5. A brand-new install with no data shows zeros, "All clear" and empty-chart messages, never fake
  numbers.
- **Accessibility**: one `h1`; each band is a `section` with an `aria-labelledby` heading; tiles are links whose
  accessible name includes the number and label ("3 statements have errors"); deltas have text, not colour alone;
  charts have summaries and hidden tables; focus rings use the existing `ring` token; contrast uses existing tokens.
- **Motion**: card hover transitions of 150ms. Entry uses `animate-in fade-in-0` (tw-animate-css, already used),
  which is disabled by the global reduced-motion rule. Recharts animation is turned off when
  `prefers-reduced-motion: reduce`.

## 8. Technical requirements

### 8.1 Architecture
- A new feature folder, `src/features/home/`, the same as the other features. The page is `HomePage.tsx`. Pure metric
  functions live in `homeMetrics.ts` (no React; unit-tested). Data hooks live in `src/api/queries/home.ts`, beside the
  other query modules.
- Route `/` (index of the shell) → `HomePage`, `handle: { crumb: 'Home' }`. `RedirectToStatements` stays for
  `/requests` and `/requests/:id`.
- Sign-in and change-password fall back to `/` instead of `/statements` when there is no `next`.
- Sidebar: a **Home** item (lucide `LayoutDashboardIcon`) first in the Work group, active only on exactly `/`. The
  command menu gets a Home entry.

### 8.2 API integration
- `useStats({ refetchInterval: STATS_POLL_MS })`: the same key as the sidebar and Statements page, so there is one
  shared request.
- `useRequestsList({ status, sort: 'received', pageSize: 100 })`: an existing hook. Its key is the params object, so
  it does not collide with the Statements page's list.
- New hooks in `api/queries/home.ts`, all keyed under `['audit', 'home', …]` so that existing mutations, which
  invalidate `['audit']`, refresh them:
  - `useAuditCounts({ from, to, prevFrom })` → for each of the 4 actions and each of the 2 periods, one
    `GET /audit-events?action=a&from&to&pageSize=1` (8 small requests in one `queryFn`, `Promise.all`).
  - `useAuditTrend({ from, to })` → pages through `action=received&action=posted` up to 10 pages. Returns
    `{ events: {atUtc, action}[], truncated }`.
- `from` and `to` are memoised per period and per day, so the query keys stay stable within a session. `to` is "now"
  rounded down to the minute, so a refetch does not create a new key every render.

### 8.3 Aggregation and formatting
- Bucketing uses `date-fns` (already a dependency): `startOfDay`, `startOfISOWeek`, `eachDayOfInterval`,
  `eachWeekOfInterval`, `differenceInCalendarDays`, `format`.
- Numbers use `Intl.NumberFormat('en-US')`. Money uses the existing `formatMoney`. Percentages are rounded to whole
  numbers. Relative times use the existing `formatRelative`.

### 8.4 Dependencies
- `recharts` (MIT), through `npx shadcn@latest add chart`, which generates `src/components/ui/chart.tsx` (the shadcn
  `ChartContainer` / `ChartTooltip` / `ChartLegend` primitives). It is the charting library shadcn/ui itself is built
  on, and no other UI library is added.

### 8.5 Performance and testing
- 8 count requests (pageSize 1), 1 to 10 trend pages, 1 list page, 1 audit page and the shared stats on first load.
  At ~10 statements a day, 30 days is about 600 events, which is 3 trend pages.
- Recharts is only imported by the flow chart, which is loaded with `React.lazy` (own chunk, ~110 kB gzip) behind a
  skeleton. The page itself is not lazy: a lazy route renders nothing until its chunk arrives, which blanked the landing
  page on first load.
- Tests: unit tests for `homeMetrics.ts` (period ranges, bucketing, age buckets, deltas, greeting). Page tests with
  MSW: counts, role differences, links, period URL changes, error isolation. Existing tests updated for the new
  landing route.

### 8.6 Auth and API gaps
- All endpoints need only `requests:read`, which every role has. The admin-only tile uses `hasScope(me, 'users:manage')`,
  the same rule the sidebar and Statements page use for "admin sees partial and unknown".
- **Gap**: no posted-amount-by-date aggregate (§4.3). A future `GET /saved-requests/stats?from&to` with posted counts
  and sums would replace the 8 count calls and enable a value KPI. It is not built, and the UI does not pretend
  otherwise.
- **Day boundaries**: the list's `receivedFrom` / `receivedTo` filters are calendar dates. The API treats them as UTC
  dates (R-1.5), while Home computes ages in local days. Near midnight, a D1 bucket's drill-down can differ by a few
  rows from the bar. The same is true on the Statements page today.
- **Development data**: `npm run dev:mock` (MSW) is the existing development mode. Its fixtures are dated
  2026-10-19 to 2026-10-27, so they show up in the period charts only near those dates. No sample data is added for the
  Home page, and production never shows mock data.

## 9. Acceptance criteria
1. Signing in with no `next` lands on `/`, which shows the Home page with the h1 greeting and the crumb "Home". With a
   `next`, sign-in still goes to `next`.
2. The sidebar shows **Home** first in Work, active on `/` only. Statements, Audit trail, Users and My account work as
   before. `/requests…` still redirects to `/statements…`.
3. The hero To review equals `pending` for editors and viewers, and `pending + partial + unknown` for admins (the same
   as the sidebar badge).
4. Has errors = `hasErrors.pending`, Possible duplicates = `duplicate.pending`. Admins see Needs a decision =
   `partial + unknown`; others see Posting now = `posting`. Each tile is a link to the destination in §4.1.
5. Band B shows exact `total`s for received, posted, post-failed and discarded in the selected period, with a signed
   delta against the previous period of the same length. Each tile links to the audit trail filtered by that action and
   period.
6. Changing the period updates the URL (`?period=7`), band B and the flow chart. Reloading keeps the period.
7. The flow chart shows one bucket per day (7 and 30 days) or per week (90 days), including empty ones. The tooltip shows
   received and posted counts. Clicking a column opens `/audit` filtered to that action and date range.
8. The status list shows all six statuses with counts from stats. Each row links to the matching Statements tab.
9. Waiting for review shows the four age buckets and the 5 oldest statements, each linking to its statement page.
   With an empty queue it shows "All clear. Nothing waiting."
10. Recent activity shows the 8 newest audit entries as sentences and links to `/audit`.
11. If any one endpoint fails, only its card shows the error and a Try again button. Every other card still renders.
12. No horizontal page scroll at 360px, 768px and 1280px+. Charts resize with their cards.
13. `npm run lint`, `tsc -b` (through `npm run build`), `npm run build` and `npm test` pass.
14. No figure on the page comes from anything other than the API responses listed in §2.3.

## 10. Implementation notes (2026-10-28)

What changed from the draft above while building, and what is known to be missing.

- **Layout of bands A and B** (§3, §7): built as one panel and one ledger strip, as described in §7. The draft's
  separate tiles read as a generic card grid; one ruled surface per band matches the app's "ledger" design language.
  The links, figures and accessible names are unchanged.
- **Code split** (§8.5): the chart is lazy-loaded inside the page, not the route (see §8.5).
- **Age bars** (§5.3): plain CSS bars inside links (four ordered values, one colour), not Recharts, so each bar is
  a focusable link with its count at the tip.
- **Legend order**: Recharts sorts legends alphabetically by default; the flow chart passes `itemSorter={null}` so the
  legend reads Received, Posted.
- **Known limitations**:
  - No money figures per period (API gap, §4.3, §8.6).
  - Band B counts are post *attempts* and audit events, not distinct statements (§4.2).
  - The flow chart is capped at 2,000 events per period; beyond that it says so (§5.1).
  - D1 drill-down dates are local days, while the API's `receivedFrom/To` are UTC dates (§8.6).
  - In `dev:mock`, fixture data is dated 2026-10-19 to 2026-10-27, so the "previous period" comparisons all read
    "None in the previous N days".
