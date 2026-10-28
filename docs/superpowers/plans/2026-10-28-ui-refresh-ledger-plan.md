# QbAutopost Dashboard: "ledger" UI refresh — implementation plan (retroactive)

**Date**: 2026-10-28 · **Spec**: `docs/superpowers/specs/2026-10-28-ui-refresh-ledger-spec.md`
**Status**: **retroactive**. The work was done before this plan existed; this file records it as tasks so the
refresh has a plan as `CLAUDE.md` Rule 1 requires, and records how it was verified. Shipped in commit `5950cb4`.

## 1. Files

Created: `src/components/PageHeader.tsx`, `src/components/DataPanel.tsx`, `src/components/SettingsSection.tsx`,
`src/components/BrandMark.tsx`, `src/auth/AuthFrame.tsx`, `src/components/ui/alert.tsx`,
`src/components/ui/breadcrumb.tsx`, `src/components/ui/native-select.tsx`.
Modified: `src/index.css`, `src/main.tsx`, `package.json`, `package-lock.json`, the primitives and pages listed in the
spec §2.

## 2. Tasks (as done)

| # | Task | Depends on | Outcome |
|---|---|---|---|
| T1 | Tokens: replace the v2 teal/slate set with the ledger set (light + dark), add `info`, light sidebar, radius 0.5rem, `.page`, `.rule-double`, reduced-motion rule, Geist Mono | — | `index.css`, `main.tsx`, `package.json` |
| T2 | Primitives: button, badge tones, table density, sidebar; add shadcn `alert`, `breadcrumb`, `native-select` with the CLI | T1 | `components/ui/*` |
| T3 | Shared layout components: `PageHeader`, `DataPanel` / `EmptyState` / `TableSkeleton` / `Pager`, `SettingsSection`, `BrandMark`, `AuthFrame` | T2 | `components/*`, `auth/AuthFrame.tsx` |
| T4 | Shared pieces: `StatusBadge` (icon + word, tone badges), `FlagChips`, `ProblemAlert` on `Alert`, filter chips | T2 | consistent status and error display |
| T5 | Shell: sidebar (brand, search button, active bar, badge), header, breadcrumb on shadcn `breadcrumb`, DB light | T3 | `layout/*` |
| T6 | Pages: sign-in and change password on `AuthFrame`; Statements, statement page, sheet, posting, dialogs, Audit, Users, user page, My account on `.page` + `PageHeader` + `DataPanel` / `SettingsSection` | T3–T5 | every page restyled, no behaviour change |
| T7 | Verify: lint, build, full test suite; look at the pages in both themes | T6 | see §4 |

## 3. Milestones
- [x] T1 Tokens and type
- [x] T2 Primitives
- [x] T3 Shared layout components
- [x] T4 Shared status and error pieces
- [x] T5 Shell
- [x] T6 Pages
- [x] T7 Verification (see §4 for what was and was not checked)

## 4. Verification and known gaps

Recorded on 2026-10-28, on the combined working tree (refresh + Home dashboard), so these results cover both:
- `npm run lint`: clean. `npm run build`: passes (main chunk ~948 kB, Vite's 500 kB warning predates this work).
- `npm test`: 432 tests; one full run 432/432; other full runs had 1–2 timeouts in `StatementPage.test.tsx` under
  parallel load (pass alone). Existing tests needed no behavioural edits for the refresh.
- Browser (mock mode): the shell, Home page, Audit trail and sign-in were seen in light (1440 px) and dark (768 px),
  and at 375 px. **Not separately inspected**: the statement page, Users, user page and My account after the restyle.
  Do that before closing the owner confirmation in the spec §6.
- Acceptance criterion 2 (no raw palette colours): scanned on 2026-10-28 while writing this plan with
  `grep -rnE "(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|teal|cyan|rose|amber|emerald|red|green|blue|sky|yellow|orange|indigo|violet|purple|pink|lime)-[0-9]" src`:
  **no matches**, including in `components/ui/`.
