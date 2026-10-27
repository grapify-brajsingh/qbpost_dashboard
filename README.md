# QbAutopost dashboard

A web dashboard for the QbAutopost API. Bank and card statements arrive by email and n8n saves the extracted
transactions to the API instead of posting them straight to QuickBooks Desktop. This dashboard puts a person between
the email and the ledger: the accountant opens each saved request, checks its rows against the statement PDF, fixes a
wrong payee, account or amount, then presses Post and sees exactly what reached QuickBooks. Admins also manage users.
Built with React, TypeScript, Vite, Tailwind/shadcn, TanStack Query and React Router.

## Run it

### Without the API (mock mode)

```
npm install
npm run dev:mock
```

The API is mocked in the browser with MSW, so no server is needed. Sign in as any mock user with the password
`correct horse battery`:

| Email | Role |
| --- | --- |
| `asha@example.com` | admin |
| `eli@example.com` | editor |
| `vera@example.com` | viewer |

(`dan@example.com` is disabled and `lena@example.com` is locked out, to exercise those errors.) The mock database
and session live in memory inside the page, so a full page reload signs you out and resets the data.

### Against a real API

```
VITE_API_PROXY_TARGET=https://localhost:5443 npm run dev
```

The dev server proxies `/api` to `VITE_API_PROXY_TARGET` (default `https://localhost:5443`). The app only uses
relative `/api/v1` URLs. No `.env` is needed in production.

## Tests

- `npm test` runs the unit and component tests (Vitest, Testing Library, MSW).
- `npm run e2e` runs the Playwright smoke tests in Chromium against `npm run dev:mock` on port 5174. The first time,
  run `npx playwright install chromium`.
- `npm run lint` and `npm run build` (which type-checks) complete the checks.

## Generating API types

`npm run gen:api` reads `http://localhost:5080/api/v1/openapi.json` into `src/api/openapi.d.ts`. Once the API
publishes the new routes, replace the hand-written types in `src/api/schema.ts` with the generated ones and keep
`TXN_KINDS` derived from the generated enum.

## Deploy

```
npm run build
```

Copy the contents of `dist/` (`index.html` and `assets/`) into the API's `Dashboard:Path` folder (API requirement
R-2: the API serves the dashboard from the same origin, so the refresh cookie works and no CORS is needed). The
production build does not include the mock service worker.

## Known issues

- The production bundle's main chunk is about 720 kB (about 220 kB gzipped), so Vite prints its 500 kB chunk-size
  warning. Route-level lazy loading (React Router `lazy`) for the request detail and Users routes was tried, but
  it only brought the main chunk to about 580 kB, still above the limit, and it broke five route tests that
  expect synchronous rendering, so it was reverted.
- True cross-tab session refresh (two tabs sharing the refresh cookie) is covered by the unit test in
  `src/api/session.test.ts`. It cannot be checked in mock mode, where the session is per page, and needs the real API.

## Further reading

- Design: [`docs/superpowers/specs/2026-10-27-qbautopost-dashboard-design.md`](docs/superpowers/specs/2026-10-27-qbautopost-dashboard-design.md)
- What the dashboard needs from the API: [`docs/api-requirements-for-dashboard.md`](docs/api-requirements-for-dashboard.md)
