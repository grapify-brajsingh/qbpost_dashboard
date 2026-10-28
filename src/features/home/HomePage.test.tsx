import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { startOfDay, subDays } from 'date-fns'
import type { Stats } from '@/api/schema'
import { mockControl } from '@/mocks/db'
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
  return http.get('/api/v1/audit-events', ({ request }) => {
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

describe('Home', () => {
  test('editors: To review is pending only, with errors, duplicates and Posting now linked to their lists', async () => {
    server.use(http.get('/api/v1/saved-requests/stats', () => HttpResponse.json(STATS)))
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
    server.use(http.get('/api/v1/saved-requests/stats', () => HttpResponse.json(STATS)))
    mockControl.signInAs('u-admin')
    renderApp('/')
    expect(await screen.findByTestId('to-review')).toHaveTextContent('10')
    expect(screen.getByRole('link', { name: '3 statements need a decision' })).toHaveAttribute('href', '/statements')
    expect(screen.queryByText('Posting now')).not.toBeInTheDocument()
  })

  test('the period figures are audit totals, compared with the period before, and link to the audit trail', async () => {
    server.use(auditTotals())
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
    server.use(auditTotals(seen))
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
      http.get('/api/v1/saved-requests/stats', () => HttpResponse.json(STATS)),
      http.get('/api/v1/audit-events', () =>
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
      http.get('/api/v1/saved-requests/stats', () =>
        HttpResponse.json({ ...STATS, byStatus: { ...STATS.byStatus, pending: 0, partial: 0, unknown: 0 } }),
      ),
      http.get('/api/v1/saved-requests', () => HttpResponse.json(page([]))),
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
