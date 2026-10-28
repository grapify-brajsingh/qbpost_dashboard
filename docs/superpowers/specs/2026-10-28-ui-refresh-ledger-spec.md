# QbAutopost Dashboard: "ledger" UI refresh — specification (retroactive)

**Date**: 2026-10-28 · **Status**: **retroactive**. Written after the code, from the code, so the refresh has the
spec and plan that `CLAUDE.md` Rule 1 requires. Nothing here was designed in this document first. **Owner to confirm**
that the look described in §3 is the intended one; it replaces the look approved in v2 §4.
**Shipped in**: commit `5950cb4` on `feature/dashboard-v2`, bundled with the Home dashboard (the two were in the
working tree together and share files).
**Builds on**: `2026-10-28-dashboard-v2-pages-design.md` (v2). **Supersedes** v2 §4 "Look and feel" (tokens, sidebar
colour, radius). Everything else in v1 and v2 still holds, including the v1 anti-goals.
**Plan**: `docs/superpowers/plans/2026-10-28-ui-refresh-ledger-plan.md`.

---

## 1. Objective and scope

Give every signed-in and signed-out screen one consistent, calmer visual language that fits the job (bookkeeping),
and remove the per-page copies of the same layout pieces (title rows, bordered table panels, empty states, pagers).

**In scope**: design tokens, typography, the brand mark, the shell (sidebar, header, breadcrumb), shared page
components, shadcn primitive variants, and the restyle of every existing page to use them.
**Out of scope**: behaviour. No route, data, permission, or API change. Every existing test kept passing without
behavioural edits.

## 2. What it changes in the codebase

| Area | Files |
|---|---|
| Tokens, type, page frame | `src/index.css`, `src/main.tsx` (adds Geist Mono) , `package.json` (`@fontsource-variable/geist-mono`) |
| New shared components | `components/PageHeader.tsx`, `components/DataPanel.tsx` (`DataPanel`, `EmptyState`, `TableSkeleton`, `Pager`), `components/SettingsSection.tsx`, `components/BrandMark.tsx`, `auth/AuthFrame.tsx` |
| New shadcn primitives | `components/ui/alert.tsx`, `ui/breadcrumb.tsx`, `ui/native-select.tsx` |
| Changed primitives | `ui/button.tsx` (pressed nudge, `shadow-xs`, outline on card), `ui/badge.tsx` (square-ish, tone variants `success` `warning` `danger` `info` `brand` `muted`), `ui/table.tsx` (muted 12.5px headers, roomier cells, selected = `primary-soft`), `ui/sidebar.tsx` (one class) |
| Shell | `layout/AppSidebar.tsx`, `AppShell.tsx`, `Breadcrumb.tsx` (shadcn breadcrumb), `DbHealthLight.tsx`, `CommandMenu.tsx` |
| Shared pieces restyled | `StatusBadge.tsx` (icon + word per status, tone badges), `FlagChips.tsx`, `ProblemAlert.tsx` (shadcn `Alert`), `filters/*` chips |
| Pages restyled | sign-in, change password, Statements list/table/toolbar, statement page header/meter/toolbar/add dialog, sheet timeline, post dialog/progress/result banner, status banner, dialogs, Audit trail, Users, user page, My account |

## 3. The look

**Idea**: "a ledger, not a dashboard". Paper and ink neutrals, one bottle-green for anything that means *act*, red
ink for anything that is out. The bookkeeper's double rule (`border-top: 3px double`) marks a final figure, and the
brand mark is that sign (two rules under a figure).

### 3.1 Tokens (`src/index.css`)
All colours are semantic CSS variables mapped through `@theme inline`; components never use raw palette colours.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` / `foreground` | `#f6f7f5` / `#16201c` | `#0f1513` / `#e3e9e6` | page paper / ink |
| `card` | `#ffffff` | `#151d1a` | surfaces |
| `primary` / `primary-soft` | `#1d5c46` / `#e6f0eb` | `#6cc39d` / `#183229` | the only "act" colour; soft = selected / brand tint |
| `muted-foreground` | `#59655f` | `#9aa8a1` | secondary text |
| `destructive` (+`-soft`) | `#b3261e` | `#f08a80` | short, failed, destructive |
| `success` (+`-soft`) | `#1e7349` | `#74cd9c` | posted, ok |
| `warning` (+`-soft`) | `#8f5409` | `#e6b155` | partial, unknown, duplicates |
| `info` (+`-soft`) | `#2d4a8a` | `#9db3ec` | posting, neutral notices (new token) |
| `border` / `input` | `#dce2de` / `#cfd7d2` | `#26322d` / `#303d37` | hairlines |
| `sidebar` | `#eef1ee` | `#121916` | **light** sidebar in light mode (v2 had a dark sidebar in both) |
| `radius` | `0.5rem` | | was `0.625rem` |

Replaced v2 values: teal primary `#0e7490` / `#22d3ee`, slate neutrals, rose/amber/emerald status, dark sidebar
`#0b1220`.

### 3.2 Type and numbers
Geist (sans) for everything; **Geist Mono** for references only (`SR-…`, push IDs). Stylistic sets `ss01`, `cv11`.
Tabular figures on `.num`, `td` and `time`. Sentence-case copy; page titles 24px semibold with slight negative
tracking.

### 3.3 Layout pieces
- **`.page`**: every signed-in page's frame: max 1440px, one column grid, `gap-5`, `px-4 py-6` → `md:px-8 md:py-8`.
- **`PageHeader`**: h1, one-line description (max 70ch), an `aside` slot beside the title, actions on the right that
  wrap under the title on narrow screens.
- **`DataPanel`**: the bordered card a table sits on; scrolls sideways itself so the page never does.
  **`EmptyState`**: icon, what happened, one next step. **`TableSkeleton`**: rows the height of real rows.
  **`Pager`**: "Page 2 of 5 · 112 total" with Previous / Next.
- **`SettingsSection`**: settings pages (My account, user page): heading and description left, fields right; stacks
  on narrow screens; a labelled region.
- **`AuthFrame`**: signed-out pages: brand mark, one card, max 400px.
- **Shell**: light sidebar with an inset green bar on the active item, "to review" badge in `primary-soft`; sticky
  translucent header with breadcrumb and the database light.

### 3.4 Status and motion
- Status is always **icon + word** (`StatusBadge`), never colour alone; badges are soft fills with same-hue ink.
- Motion is short (150ms colour/transform transitions, a 1px pressed nudge on buttons, fade-in on empty states and the
  auth card) and disabled entirely under `prefers-reduced-motion` by a global rule. The posting progress bar sweep is
  hidden under reduced motion.

## 4. UI states and accessibility
- Loading: skeletons the shape of the content. Empty: `EmptyState` with a next step. Errors: `ProblemAlert` (title,
  detail, request id).
- Focus: visible `ring` (3px, primary at 40%) on every interactive element, including custom chips and links.
- Contrast: status ink on its `-soft` tint and muted text on paper are chosen to stay readable in both themes.
- Responsive: no horizontal page scroll; tables scroll inside `DataPanel`; header actions wrap.

## 5. Acceptance criteria
1. Every signed-in page uses `.page` and `PageHeader`; every table sits in `DataPanel` with `EmptyState` /
   `TableSkeleton`; list pages use `Pager`.
2. No component uses a raw palette colour class (e.g. `bg-teal-600`); colours come from the tokens in §3.1.
3. Light and dark themes both render with the §3.1 values.
4. Statuses show icon + word everywhere a status appears.
5. Reduced motion stops transitions and the posting sweep.
6. No behavioural change: the test suite passes with only the landing-route updates made for the Home page.
7. Lint and build pass.

## 6. Open items
- **Owner confirmation** of the change from the approved v2 sketch (teal, dark sidebar) to this look.
- Whether `.superpowers/brainstorm/…/design-v2.html` should be updated or retired as the visual reference.
