# Spec: auth test "valid refresh cookie signs in without showing the form" fails on a cold render

**Date**: 2026-10-30 · **Status**: approved by the owner ("fix the auth test") · Small fix (CLAUDE.md Rule 1).

**Problem.** `src/auth/auth.test.tsx` > "session restore and guards" > "valid refresh cookie signs in without showing
the form" fails every time its file runs (also on a clean checkout of `46cb118`): `findByRole('heading', { name:
'Statements' })` gives up after the default 1 s, while the heading appears after about 1.3 s. Run alone with `-t` it
passes.

**Cause.** It is the first test in the file that renders the whole app and lands on a page (`/requests` → Statements),
so it pays the one-time cost of loading the app's page modules in jsdom. Later tests in the file reuse the loaded
modules and stay under 1 s. Nothing in the app is slow: the behaviour under test (a valid refresh cookie signs in
without the form) is correct.

**Fix.** Give that one `findByRole` a 4 s timeout, the value this file (line 109, the Home heading) and
`UploadPage.test.tsx` already use for a first full-app render, with a short comment saying why. No app code changes.

**Acceptance.** The test passes when its whole file runs, 3 runs out of 3; the full `npm test` has no failures from
this file; the assertion is unchanged (it still fails if the form is shown or the heading never appears).
