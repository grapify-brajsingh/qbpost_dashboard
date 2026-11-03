# Error handling audit: plan

Spec: `specs/2026-10-30-error-handling-audit-spec.md`.

## Branch

`feature/error-handling-audit`, from `feature/statement-validation-problems`, because it builds on PR #7. Other
uncommitted work stays out: stage only this change's lines, and test the commit in a clean worktree as for PR #7.

## Files

- Modify: `src/api/problem.ts`, `src/components/ProblemAlert.tsx`, `src/features/requests/posting/outcome.ts` (+test),
  the post banner and `PostDialog`, `src/features/requests/attempts/AttemptsTab.tsx`,
  `src/features/requests/transactions/SaveBar.tsx`, `qbListsSync.ts`, `src/api/queries/requests.ts`,
  `src/features/requests/dialogs/ResolveDialog.tsx`, `src/auth/RequireAuth.tsx`, `SignInPage.tsx`,
  `src/features/statements/detail/StatementPage.tsx`, `ValidationProblems.tsx`,
  `src/features/statements/upload/{uploadErrors.ts,ExtractionError.tsx,emptyFields.ts,format.ts,ReviewEditor.tsx}`,
  `src/mocks/**`, `docs/api-requirements-for-dashboard.md`.
- Create: `src/features/statements/detail/validationText.ts` (+test), `e2e-integration/upload-errors.spec.ts`.

## Tasks

1. **Baseline.** Run lint, build, unit tests and the integration suite. Record the results, including the known
   `upload.spec.ts:27` failure.
2. **Real shapes in tests first.** Change `outcome.test.ts` and the mocks to what the API sends; watch tests fail.
3. **Shared errors** (A5, A6, C7): `problemCode`, non-problem JSON, `ProblemAlert`.
4. **Post outcomes** (A1 to A4, A6, A8, A9), gateway errors on a post in `usePost.ts` (D5), then the on-page
   Retry-After wait on Post (A7, D6).
5. **Upload read errors** (B5 to B8).
6. **Review screen** (B1 to B4, B9, B10).
7. **Validation wording** (D-1 to D-3).
8. **Other pages** (C1 to C6).
9. **Integration tests.** Add `upload-errors.spec.ts`: wrong file, over-limit file, no text, reference with spaces,
   impossible date, zero amount, missing control total, expired and already-saved extraction.
10. **Full verification** in a clean worktree, plus the integration suite. Drive one failed upload in Chrome.
11. **Docs, commit, push, PR** after you approve, base `feature/statement-validation-problems`.

## Verification

```
npm run lint
npm run build
npm test
npx playwright test -c playwright.integration.config.ts
```

The API isn't changed, so `dotnet test` isn't needed.

## Milestones

- [x] Baseline recorded
- [x] A posting
- [x] B upload
- [x] C other pages
- [x] D validation wording
- [x] Integration suite run
- [ ] PR raised

## Results

- Baseline: lint and build pass, 610/610 unit tests, integration 15 of 16 (`upload.spec.ts:27` failed).
- After the fixes, on the full working tree: lint and build pass, all unit tests pass, integration 24 of 24, including
  eight new upload tests. `upload.spec.ts:27` also passed, after the web container was rebuilt. It wasn't changed, and
  the cause of the earlier failure wasn't established.
- Build differed from the plan:
  - Task 10's Chrome check was covered by the integration suite, which drives Chromium against the real stack.
  - C1: the statement isn't reloaded until the user chooses to, because a reload removes the save bar and the edits.
  - C3 (`qbListsSync.ts`, `QbListsStatus.test.tsx`) belongs to uncommitted QuickBooks list work, so it stays in the
    working tree and isn't in this commit.
  - B6 and B7 have unit tests only: the local stack doesn't trigger them from the browser.
  - No change was needed in `docs/api-requirements-for-dashboard.md`: it doesn't state the old field names.
- Deferred, needing the API: a `type` on the busy 409; If-Match on discard and resolve; the text threshold that calls
  a very short PDF a scan.
