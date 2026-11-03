# Error handling audit: spec

Date: 2026-10-30. Status: built. Plan: `plans/2026-10-30-error-handling-audit-plan.md`.

## 1. Goal and scope

Every failure the API can report must reach the user as a message they can act on, and no message may say something
false about money. The user named the PDF upload as the main worry and asked for the whole app to be checked.

Frontend only (`D:\qb_post_react`). No new endpoints and no API shape changes. The evidence is real responses from the
local stack for the upload flow, and reading both codebases for the rest.

**Non-goals**: redesigning any page; new validation rules the API doesn't have; retrying a post automatically (the v1
anti-goal stands); changing the API.

**Anti-goals**: a post that may have reached QuickBooks must never read as "nothing was posted". Raw API text must not
be dropped when no friendlier wording exists: show it as it came.

## 2. Findings

### A. Posting: wrong or lost messages (highest risk)

| # | Trigger | Today | Required |
|---|---|---|---|
| A1 | Post returns 200 with `savedRequestStatus: unknown` or `partial`. The dashboard reads `requestStatus`, which the API never sends, then falls back to the engine `status` | Engine `failed` plus saved status `unknown` reads **"Nothing was posted"**, so the user could post again | Read `savedRequestStatus`. Show `UNKNOWN_TITLE` for `unknown` |
| A2 | Same field on a 409 (`outcome.ts:97`) | Generic title | Read `savedRequestStatus` |
| A3 | 500 `post-outcome-unknown` | "Something went wrong"; "Do not send it again" is lost | Outcome kind `unknown`, with the API's detail |
| A4 | 500 `post-not-started`, 403, 429, database errors | "Something went wrong" | Show the problem's title and detail |
| A5 | Busy 409 has no `type`, so ASP.NET adds an RFC link and `problemCode` returns a URL fragment | Shown as a "conflict" with a false "See their attempt" link; Retry-After ignored | Recognise busy by `retryAfterSeconds` on a 409. Fix `problemCode` so a URL type is never taken as a code |
| A6 | 503 from the engine is a post result, not a problem (`status` is a string) | "Service Unavailable" or "Request failed"; `error` dropped | Show `body.error` |
| A7 | 429 or 503 with Retry-After | Post stays enabled at once | Disable Post for the wait and say how long |
| A8 | 200 partial or failed with rows in `held[]` | Held rows and `error` appear nowhere | Show held rows with their `note`, and `error`, in the banner and Attempts tab |
| A9 | Duplicate 409 nests `duplicate: {of, status, reasons}` | "another request", no link | Read the nested fields |

### B. PDF upload

Status and text below are real responses from the local API, except where noted.

| # | Trigger | Today | Required |
|---|---|---|---|
| B1 | Statement saved with no control total | **Every upload the model reads arrives without one.** Save works, then the statement is refused: "controlTotal is required when transactions are sent" | Warn on the review screen beside the control total. Doesn't block saving (decision D1) |
| B2 | Model or file name gives a reference with spaces, or over 64 characters | Save is disabled and the reference must be retyped | Pre-fill a cleaned value: spaces become `-`, other characters are removed, cut to 64. Still editable |
| B3 | Impossible date (`2026-13-45`) | Passes review. Statement saves as unreadable: "The JSON value could not be converted to System.DateOnly." | `badValues` checks the real calendar and blocks Save |
| B4 | Amount of 0 or below | Passes review, then refused | `badValues` flags it and blocks Save |
| B5 | Over 10 MB, sent past the browser check | "may be at most 10485760 bytes" | "The PDF is larger than 10 MB." Keep the API's page-limit text |
| B6 | Over 11 MB at nginx: HTML 413, not a problem | "Request Entity Too Large", plus Try again | Same text as B5, no Try again |
| B7 | 429 `too-many-extractions` with Retry-After (read from code, not sent) | Try again is available at once and fails again | Say how long, and disable Try again until then |
| B8 | Errors outside the known list | Try again is always offered | Offer it only for network, timeout, 502, 503, 504 and unknown failures |
| B9 | Why Save is disabled | Only in a tooltip on a disabled button, unreachable by touch | Also show the reason as text in the action bar |
| B10 | Reference left empty | Field is marked invalid with no text | Show "Enter a reference" |

### C. Other pages

| # | Trigger | Today | Required |
|---|---|---|---|
| C1 | Save hits 409 `not-editable` | Edits are wiped with no message | Keep the edits on screen, explain why, offer Copy my edits, and reload only when the user chooses |
| C2 | Session ends during an edit | Silent redirect to sign-in; draft lost | Sign-in page says the session expired. Keep edits if the draft store allows it, else say they weren't saved |
| C3 | QuickBooks list sync 502 or 503 | Title only | Title and detail; use the real Retry-After seconds |
| C4 | Discard or resolve 409 | Message shows, stale buttons stay | Refresh the statement on error |
| C5 | Resolve note over 500 characters | Raw `Send { "outcome"…` | Limit the input; show a count |
| C6 | Validate returns `ok`, or `held` with every finding on a row | No feedback | Toast with the result |
| C7 | Proxy 502 HTML, network failure, timeout | "Request failed" or "Something went wrong" | "Couldn't reach the server" with the status when there is one, and the Request ID when there is one |

### D. Statement validation wording

| # | Trigger | Today | Required |
|---|---|---|---|
| D-1 | `row 0: amount must be greater than zero` | Row number counts from 0 | Show the row number the table shows |
| D-2 | `$.transactions[0].date: The JSON value could not be…` | Technical text | "Row 1: the date isn't a valid date." Unmatched text is shown unchanged |
| D-3 | The same message appears twice after a failed post | Banner and panel repeat it | Show it once |

## 3. Decisions

- **D1 (mine)**: a missing control total warns but doesn't block Save, so a review isn't lost when the printed total is
  to hand later. The statement stays unpostable until it's entered. The warning sits beside the control total, and
  `saveBlocker` doesn't change for it. Tests assert that Save stays enabled.
- **D2 (mine)**: the cleaned reference is shown, not hidden, and is not a computed money value, so it doesn't touch
  the rule against silently changing stored amounts.
- **D3 (mine)**: `tiny PDF reads as no-text` (a real PDF with only a line or two gets "may be a scan") is an API
  threshold. Left alone and reported.
- **D4 (mine)**: findings needing the API (a `type` on the busy 409, If-Match on discard and resolve) are worked around
  or left, and listed in the PR.

- **D5 (mine)**: a 502, 503 HTML page or 504 on the post call counts as uncertain, because a gateway can fail after the
  API has reached QuickBooks. It joins the existing reload-and-watch path in `usePost.ts`, as network errors and
  timeouts do, and never shows C7's "Couldn't reach the server". C7 applies to every other call. A6's 503 is unchanged:
  the API's own post result says nothing was sent.
- **D6 (mine)**: a Retry-After wait lasts while the page is open and covers that one action: the Post button on that
  statement, or Try again on the upload. It isn't kept across pages or reloads; the API still refuses early attempts,
  and the message then gives the new wait.

## 4. Mock and docs

`src/mocks` and `outcome.test.ts` use `requestStatus`, `code` and flat `of`/`ofRef`, which is why these bugs passed the
tests. Change them to the real shapes, and amend `docs/api-requirements-for-dashboard.md` wherever it states the old
ones.

## 5. Roles

No change. Messages follow what the API returns for each role; buttons still follow `allowedActions`.

## 6. Acceptance criteria

1. A post answered with `savedRequestStatus: unknown` or `post-outcome-unknown` shows `UNKNOWN_TITLE`, never "Nothing
   was posted", in unit tests using the API's real body shapes.
2. A busy 409 shows the wait and Post stays disabled for it. A 502 or 504 on a post reloads and watches the statement,
   and shows no "nothing was posted" or "couldn't reach the server" text.
3. Each row of B has a test. B1 to B5 are also covered in the integration suite against the real API.
4. No upload failure ends on a bare title with no next step.
5. A 409 on save leaves the user's edits visible and recoverable.
6. Row numbers in validation messages match the table.
7. Lint, build and unit tests pass; the integration suite shows no new failures against its baseline.
