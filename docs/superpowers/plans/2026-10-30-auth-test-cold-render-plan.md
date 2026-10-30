# Plan: auth test cold render

Spec: `docs/superpowers/specs/2026-10-30-auth-test-cold-render-spec.md`.

**Files**: `src/auth/auth.test.tsx` (one line plus a comment).

**Steps**
1. Add `{ timeout: 4000 }` to the `findByRole('heading', { name: 'Statements' })` in "valid refresh cookie signs in
   without showing the form", with a comment: first full-app render in this file, same reason as line 109.
2. Run the file 3 times, then the full suite.

**Checks**: `npx vitest run src/auth/auth.test.tsx` ×3; `npm run lint`; `npm run build`; `npm test`.

## Milestones
- [ ] 1 timeout added
- [ ] 2 checks recorded below

## Results
(filled in after the run)
