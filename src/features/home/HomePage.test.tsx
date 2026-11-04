import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { startOfDay, subDays } from 'date-fns'
import type { DashboardSummary, Stats } from '@/api/schema'
import { companyKeys } from '@/api/queries/companies'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

const STATS: Stats = {
  byStatus: { pending: 7, posting: 1, posted: 4, partial: 2, unknown: 1, discarded: 2 },
  needsAttention: { pending: 2, all: 3 },
  duplicate: { pending: 1, all: 1 },
  hasErrors: { pending: 2, all: 3 },
}

const CURRENT = { received: 6, posted: 4, 'post-failed': 1, discarded: 0 }
const PREVIOUS = { received: 3, posted: 4, 'post-failed': 0, discarded: 2 }

const page = <T,>(items: T[], total = items.length) => ({ items, page: 1, pageSize: 25, total })

/** Audit totals per action; the current period's `to` is about now, the previous one ends a period ago. */
function auditTotals(seen: URL[] = []) {
  return http.get('/api/v2/audit-events', ({ request }) => {
    const url = new URL(request.url)
    seen.push(url)
    if (url.searchParams.get('pageSize') !== '1') return HttpResponse.json(page([]))
    const action = url.searchParams.get('action') as keyof typeof CURRENT
    const to = Date.parse(url.searchParams.get('to') ?? '')
    const recent = to > Date.now() - 86_400_000
    return HttpResponse.json(page([], (recent ? CURRENT : PREVIOUS)[action]))
  })
}

const heading = () => screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })

/** An older API without R-11: Home falls back to the audit feed. */
const summaryGone = () =>
  http.get('/api/v2/dashboard/summary', () =>
    HttpResponse.json({ type: 'not-found', title: 'Not found', status: 404 }, { status: 404, headers: { 'Content-Type': 'application/problem+json' } }),
  )

const SUMMARY: DashboardSummary = {
  range: { from: '', to: '', tz: 'UTC', bucket: 'day' },
  counts: { received: 9, posted: 5, postFailed: 1, discarded: 1 },
  previous: { received: 4, posted: 5, postFailed: 0, discarded: 0 },
  posted: { rows: 120, amount: 24839.27, previousRows: 80, previousAmount: 18000 },
  timeToPost: { medianMinutes: 1260, p90Minutes: 4320, statements: 5 },
  series: [],
}

describe('Home', () => {
  test('editors: To review is pending only, with errors, duplicates and Posting now linked to their lists', async () => {
    server.use(http.get('/api/v2/saved-requests/stats', () => HttpResponse.json(STATS)))
    mockControl.signInAs('u-editor')
    renderApp('/')
    await heading()
    expect(await screen.findByTestId('to-review')).toHaveTextContent('7')
    expect(screen.getByRole('link', { name: '2 statements with errors' })).toHaveAttribute('href', '/statements?tab=errors')
    expect(screen.getByRole('link', { name: '1 possible duplicate' })).toHaveAttribute('href', '/statements?duplicate=true')
    expect(screen.getByRole('link', { name: '1 statement posting now' })).toHaveAttribute('href', '/statements?tab=all')
    expect(screen.queryByText('Needs a decision')).not.toBeInTheDocument()
  })

  test('admins: To review adds partial and unknown, and Needs a decision replaces Posting now', async () => {
    server.use(http.get('/api/v2/saved-requests/stats', () => HttpResponse.json(STATS)))
    mockControl.signInAs('u-admin')
    renderApp('/')
    expect(await screen.findByTestId('to-review')).toHaveTextContent('10')
    expect(screen.getByRole('link', { name: '3 statements need a decision' })).toHaveAttribute('href', '/statements')
    expect(screen.queryByText('Posting now')).not.toBeInTheDocument()
  })

  test('with the summary, the period figures, posted value and time to post come from one call', async () => {
    const seen: URL[] = []
    server.use(
      http.get('/api/v2/dashboard/summary', ({ request }) => {
        seen.push(new URL(request.url))
        return HttpResponse.json(SUMMARY)
      }),
      auditTotals(seen),
    )
    mockControl.signInAs('u-admin')
    renderApp('/')
    const received = await screen.findByRole('link', { name: /^9 statements received in the last 30 days/ })
    expect(received).toHaveTextContent('+5')
    expect(screen.getByRole('link', { name: /^5 successful posts/ })).toHaveTextContent('No change')
    expect(screen.getByTestId('posted-value')).toHaveTextContent('24,839.27')
    expect(screen.getByTestId('posted-value')).toHaveTextContent('120 rows sent to QuickBooks')
    expect(screen.getByTestId('time-to-post')).toHaveTextContent('21 h')
    expect(screen.getByTestId('time-to-post')).toHaveTextContent('90% within 3 d')
    const summary = seen.filter((u) => u.pathname.endsWith('/dashboard/summary'))
    expect(summary.length).toBeGreaterThanOrEqual(1)
    expect(summary[0].searchParams.get('compareTo')).toBe(summary[0].searchParams.get('from'))
    expect(summary[0].searchParams.get('bucket')).toBe('day')
    expect(summary[0].searchParams.get('tz')).toBeTruthy()
    expect(seen.some((u) => u.pathname.endsWith('/audit-events') && u.searchParams.get('pageSize') === '1')).toBe(false)
  })

  test('with no statement posted in the period, time to post says so', async () => {
    server.use(http.get('/api/v2/dashboard/summary', () => HttpResponse.json({ ...SUMMARY, timeToPost: null })))
    mockControl.signInAs('u-admin')
    renderApp('/')
    expect(await screen.findByTestId('time-to-post')).toHaveTextContent('No statements posted in this period')
  })

  test('the period figures are audit totals, compared with the period before, and link to the audit trail', async () => {
    server.use(summaryGone(), auditTotals())
    mockControl.signInAs('u-admin')
    renderApp('/')
    const received = await screen.findByRole('link', { name: /^6 statements received in the last 30 days/ })
    expect(received).toHaveTextContent('+3')
    expect(received.getAttribute('href')).toMatch(/^\/audit\?action=received&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/)
    const posted = screen.getByRole('link', { name: /^4 successful posts/ })
    expect(posted).toHaveTextContent('No change')
    const failed = screen.getByRole('link', { name: /^1 failed post attempts/ })
    expect(failed).toHaveTextContent('None in the previous 30 days')
    expect(failed).toHaveTextContent('80% of post attempts succeeded')
    expect(screen.getByRole('link', { name: /^0 statements discarded/ })).toHaveTextContent('−2')
  })

  test('choosing 7 days puts the period in the URL and asks for the last 7 local days', async () => {
    const seen: URL[] = []
    server.use(summaryGone(), auditTotals(seen))
    mockControl.signInAs('u-admin')
    const { user, router } = renderApp('/')
    await screen.findByRole('link', { name: /^6 statements received in the last 30 days/ })
    await user.click(screen.getByRole('radio', { name: '7 days' }))
    expect(router.state.location.search).toBe('?period=7')
    expect(await screen.findByRole('heading', { name: 'Last 7 days' })).toBeInTheDocument()
    const from = startOfDay(subDays(new Date(), 6)).toISOString()
    await waitFor(() => expect(seen.some((u) => u.searchParams.get('from') === from)).toBe(true))
  })

  test('a failing audit feed only breaks its own cards', async () => {
    server.use(
      summaryGone(),
      http.get('/api/v2/saved-requests/stats', () => HttpResponse.json(STATS)),
      http.get('/api/v2/audit-events', () =>
        HttpResponse.json({ type: 'about:blank', title: 'Audit is down', status: 500 }, { status: 500, headers: { 'Content-Type': 'application/problem+json' } }),
      ),
    )
    mockControl.signInAs('u-editor')
    renderApp('/')
    expect(await screen.findByTestId('to-review')).toHaveTextContent('7')
    expect((await screen.findAllByRole('button', { name: 'Try again' })).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Audit is down').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: '2 statements with errors' })).toBeInTheDocument()
  })

  test('an empty queue says all clear', async () => {
    server.use(
      http.get('/api/v2/saved-requests/stats', () =>
        HttpResponse.json({ ...STATS, byStatus: { ...STATS.byStatus, pending: 0, partial: 0, unknown: 0 } }),
      ),
      http.get('/api/v2/saved-requests', () => HttpResponse.json(page([]))),
    )
    mockControl.signInAs('u-admin')
    renderApp('/')
    expect(await screen.findByTestId('to-review')).toHaveTextContent('0')
    expect(await screen.findAllByText('All clear. Nothing waiting.')).toHaveLength(2)
  })

  test('the oldest waiting statements link to their pages, and recent activity to the audit trail', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/')
    const waiting = (await screen.findByText('Waiting for review')).closest('[data-slot=card]') as HTMLElement
    const links = await within(waiting).findAllByRole('link', { name: /SR-\d{6}/ })
    expect(links.length).toBeGreaterThan(0)
    expect(links.length).toBeLessThanOrEqual(5)
    expect(links[0].getAttribute('href')).toMatch(/^\/statements\/\d+$/)

    const activity = screen.getByText('Recent activity').closest('[data-slot=card]') as HTMLElement
    expect(within(activity).getByRole('link', { name: 'Audit trail' })).toHaveAttribute('href', '/audit')
    expect((await within(activity).findAllByRole('listitem')).length).toBeGreaterThan(0)
  })
})

describe('Home company selector', () => {
  const PATHS = ['/api/v2/saved-requests/stats', '/api/v2/saved-requests', '/api/v2/dashboard/summary', '/api/v2/audit-events']
  function recordUrls(paths: string[]) {
    const urls: Record<string, URL[]> = Object.fromEntries(paths.map((p) => [p, []]))
    server.events.on('request:start', ({ request }) => {
      const u = new URL(request.url)
      if (request.method === 'GET' && u.pathname in urls) urls[u.pathname].push(u)
    })
    return urls
  }
  afterEach(() => server.events.removeAllListeners())

  test('the company selector filters stats, the waiting list and the summary; recent activity stays all-companies', async () => {
    const urls = recordUrls(PATHS)
    mockControl.signInAs('u-editor')
    const { user } = renderApp('/')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Company' }), '2')
    await waitFor(() => expect(urls['/api/v2/saved-requests/stats'].slice(-1)[0].searchParams.get('company')).toBe('2'))
    await waitFor(() => expect(urls['/api/v2/saved-requests'].slice(-1)[0].searchParams.get('company')).toBe('2'))
    await waitFor(() => expect(urls['/api/v2/dashboard/summary'].slice(-1)[0].searchParams.get('company')).toBe('2'))
    expect(urls['/api/v2/audit-events'].length).toBeGreaterThan(0)
    expect(urls['/api/v2/audit-events'].every((u) => !u.searchParams.has('company'))).toBe(true)
  })

  test('Home counts change with the company selector', async () => {
    mockControl.signInAs('u-editor')
    const { user } = renderApp('/')
    const all = (await screen.findByTestId('to-review')).textContent
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Company' }), '2')
    await waitFor(() => expect(screen.getByTestId('to-review').textContent).not.toBe(all))
  })

  test('"All companies" is the default and sends no company', async () => {
    const urls = recordUrls(PATHS)
    mockControl.signInAs('u-editor')
    renderApp('/')
    const select = await screen.findByRole('combobox', { name: 'Company' })
    expect(select).toHaveValue('')
    expect(within(select).getByRole('option', { name: 'All companies' })).toBeInTheDocument()
    await screen.findByTestId('to-review')
    for (const p of PATHS.slice(0, 3)) {
      expect(urls[p].length).toBeGreaterThan(0)
      expect(urls[p].every((u) => !u.searchParams.has('company'))).toBe(true)
    }
  })

  test('a company in the URL that is not a whole number means All companies and is never sent', async () => {
    const urls = recordUrls(PATHS)
    mockControl.signInAs('u-editor')
    renderApp('/?company=abc')
    expect(await screen.findByRole('combobox', { name: 'Company' })).toHaveValue('')
    await screen.findByTestId('to-review')
    expect(urls['/api/v2/saved-requests/stats'].every((u) => !u.searchParams.has('company'))).toBe(true)
  })

  test('a hex-looking company in the URL (0x2) is not accepted and is never sent', async () => {
    const urls = recordUrls(PATHS)
    mockControl.signInAs('u-editor')
    renderApp('/?company=0x2')
    expect(await screen.findByRole('combobox', { name: 'Company' })).toHaveValue('')
    await screen.findByTestId('to-review')
    expect(urls['/api/v2/saved-requests/stats'].every((u) => !u.searchParams.has('company'))).toBe(true)
  })

  test('with only one company there is no selector, as on Lists', async () => {
    mockDb.companies = mockDb.companies.slice(0, 1)
    mockControl.signInAs('u-editor')
    const { queryClient } = renderApp('/')
    await screen.findByTestId('to-review')
    // The companies answer separately from the counts: wait until they are in the cache before asserting absence.
    await waitFor(() => expect(queryClient.getQueryData<{ items: unknown[] }>(companyKeys.all)?.items).toHaveLength(1))
    expect(screen.queryByRole('combobox', { name: 'Company' })).not.toBeInTheDocument()
  })

  test('an older API (GET /companies 404) shows no selector', async () => {
    server.use(http.get('/api/v2/companies', () => new HttpResponse(null, { status: 404 })))
    mockControl.signInAs('u-editor')
    renderApp('/')
    await screen.findByTestId('to-review')
    expect(screen.queryByRole('combobox', { name: 'Company' })).not.toBeInTheDocument()
  })
})
