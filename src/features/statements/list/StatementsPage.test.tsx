import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, vi } from 'vitest'
import type { Page, RequestSummary, Stats } from '@/api/schema'
import { formatTimestamp } from '@/lib/dates'
import { mockControl } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp, renderWithProviders } from '@/test/render'
import { SessionProvider } from '@/auth/SessionProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StatementsPage } from './StatementsPage'

const LIST = '/api/v1/saved-requests'
const STATS = '/api/v1/saved-requests/stats'
const LAST_SEEN = 'qbpost.statements.lastSeen'

function summary(over: Partial<RequestSummary> & { id: number }): RequestSummary {
  return {
    publicRef: `SR-${String(over.id).padStart(6, '0')}`,
    status: 'pending',
    rowVersion: 1,
    source: { kind: 'api-client', id: 'n8n-mailbox', name: 'n8n mailbox workflow' },
    reference: `ref-${over.id}`,
    controlTotal: 100,
    transactionCount: 3,
    currentVersion: 1,
    needsAttention: false,
    duplicate: { flagged: false, of: null, reasons: [], acknowledgedBy: null },
    validation: { state: 'ok' },
    lastAttempt: null,
    postId: null,
    email: { subject: `Subject ${over.id}`, receivedUtc: '2026-10-27T07:12:44Z', from: `sender${over.id}@bank.example` },
    pushId: `0000000${over.id}-aaaa-bbbb-cccc-dddddddddddd`,
    historyCount: 0,
    validationSummary: { state: 'ok', problemCount: 0, validatedUtc: null, versionNumber: null },
    postSummary: null,
    skipCount: 0,
    created: { utc: '2026-10-27T07:12:50Z', by: { id: 'x', name: 'n8n' } },
    updated: { utc: '2026-10-28T09:30:00Z', by: { id: 'x', name: 'n8n' } },
    allowedActions: [],
    ...over,
  }
}

const page = (items: RequestSummary[], extra: Partial<Page<RequestSummary>> = {}): Page<RequestSummary> => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  ...extra,
})

const STATS_FIXED: Stats = {
  byStatus: { pending: 7, posting: 1, posted: 4, partial: 1, unknown: 1, discarded: 2 },
  needsAttention: { pending: 2, all: 3 },
  duplicate: { pending: 1, all: 1 },
  hasErrors: { pending: 5, all: 6 },
}

let seen: URL[] = []
function signedIn(route = '/statements') {
  mockControl.signInAs('u-admin')
  seen = []
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url)
    if (u.pathname.endsWith('/saved-requests')) seen.push(u)
  })
  return renderApp(route)
}
const useList = (items: RequestSummary[], extra?: Partial<Page<RequestSummary>>) =>
  server.use(http.get(LIST, () => HttpResponse.json(page(items, extra))))

afterEach(() => {
  server.events.removeAllListeners()
  vi.useRealTimers()
  localStorage.clear()
})

describe('statements list', () => {
  test('shows one row per push: two chase-2026-08 rows with different push ids', async () => {
    useList([
      summary({ id: 1, reference: 'chase-2026-08', pushId: '7f3a9c1e-5b2d-4e6a-9d10-3c8b1a2e4f01' }),
      summary({ id: 2, reference: 'chase-2026-08', pushId: '2b8d4e7a-91c3-4f5b-a6e2-0d7c9b3a1f02' }),
    ])
    signedIn()
    const rows = (await screen.findAllByText('chase-2026-08')).map((e) => e.closest('tr')!)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('7f3a…f01')).toBeInTheDocument()
    expect(within(rows[1]).getByText('2b8d…f02')).toBeInTheDocument()
  })

  test('columns: received time + date, subject + sender, reference + push id, rows, total, status, validation, History N, Results', async () => {
    const received = '2026-10-27T07:12:44Z'
    useList([
      summary({
        id: 5,
        controlTotal: 4820.17,
        transactionCount: 12,
        reference: 'chase-4521-2026-08',
        pushId: '7f3a9c1e-5b2d-4e6a-9d10-3c8b1a2e4f01',
        historyCount: 4,
        email: { subject: 'Chase statement', receivedUtc: received, from: 'alerts@chase.com' },
      }),
    ])
    signedIn()
    const row = (await screen.findByText('Chase statement')).closest('tr')!
    expect(within(row).getByText(formatTimestamp(received))).toBeInTheDocument()
    expect(within(row).getByText('alerts@chase.com')).toBeInTheDocument()
    expect(within(row).getByText('chase-4521-2026-08')).toBeInTheDocument()
    expect(within(row).getByText('7f3a…f01')).toBeInTheDocument()
    expect(within(row).getByText('12')).toBeInTheDocument()
    expect(within(row).getByText('4,820.17')).toBeInTheDocument()
    expect(within(row).getByText('Pending')).toBeInTheDocument()
    expect(within(row).getByText('No problems')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'History 4' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Results' })).toBeInTheDocument()
  })

  test('validation cell: "No problems" / "3 problems" / "Not checked" / "61 TxnIDs" for posted', async () => {
    useList([
      summary({ id: 1 }),
      summary({ id: 2, validationSummary: { state: 'held', problemCount: 3, validatedUtc: null, versionNumber: 1 } }),
      summary({ id: 3, validationSummary: { state: 'none', problemCount: 0, validatedUtc: null, versionNumber: null } }),
      summary({
        id: 4,
        status: 'posted',
        postSummary: { postId: 'p', postedCount: 61, postedUtc: '2026-10-27T08:00:00Z', postedBy: { id: 'u', name: 'Asha' } },
      }),
    ])
    signedIn()
    const cell = async (subject: string) => (await screen.findByText(subject)).closest('tr')!
    expect(within(await cell('Subject 1')).getByText('No problems')).toBeInTheDocument()
    expect(within(await cell('Subject 2')).getByText('3 problems')).toBeInTheDocument()
    expect(within(await cell('Subject 3')).getByText('Not checked')).toBeInTheDocument()
    expect(within(await cell('Subject 4')).getByText('61 TxnIDs')).toBeInTheDocument()
  })

  test('row with email null and pushId null shows "—" and the SR ref, no crash', async () => {
    useList([summary({ id: 12, email: null, pushId: null, reference: null })])
    signedIn()
    const row = (await screen.findByText('SR-000012')).closest('tr')!
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2)
    expect(within(row).getByRole('button', { name: 'History 0' })).toBeInTheDocument()
  })

  test('tab counts come from stats; Has errors uses stats.hasErrors.pending', async () => {
    server.use(http.get(STATS, () => HttpResponse.json(STATS_FIXED)))
    signedIn()
    expect(await screen.findByRole('tab', { name: 'To review 9' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Has errors 5' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Posted 4' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Discarded 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All 16' })).toBeInTheDocument()
  })

  test('the Has errors tab asks for pending statements with errors, newest first', async () => {
    const { user, router } = signedIn()
    await user.click(await screen.findByRole('tab', { name: /^Has errors/ }))
    await waitFor(() => expect(router.state.location.search).toContain('tab=errors'))
    await waitFor(() => {
      const u = seen[seen.length - 1]
      expect(u.searchParams.get('hasErrors')).toBe('true')
      expect(u.searchParams.getAll('status')).toEqual(['pending'])
      expect(u.searchParams.get('sort')).toBe('-received')
    })
  })

  test('typing in search sets ?q= and refetches; Clear filters empties every chip', async () => {
    const { user, router } = signedIn('/statements?tab=posted&reference=abc&minTotal=5&duplicate=true')
    await screen.findByRole('button', { name: 'Reference: abc' })
    expect(screen.getByRole('button', { name: 'Total: 5–' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate: Yes' })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'plumb')
    await waitFor(() => expect(router.state.location.search).toContain('q=plumb'))
    await waitFor(() => expect(seen.some((u) => u.searchParams.get('q') === 'plumb')).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(router.state.location.search).toBe('?tab=posted'))
    expect(screen.getByRole('button', { name: 'Reference' })).toBeInTheDocument()
    expect(within(screen.getByRole('columnheader', { name: /Total/ })).getByRole('button')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
  })

  test('rows received after lastSeen get the new dot; leaving the page marks now', async () => {
    localStorage.setItem(LAST_SEEN, '2026-10-27T06:00:00.000Z')
    useList([
      summary({ id: 1, email: { subject: 'Fresh', receivedUtc: '2026-10-27T07:00:00Z' } }),
      summary({ id: 2, email: { subject: 'Stale', receivedUtc: '2026-10-27T05:00:00Z' } }),
    ])
    const { router } = signedIn()
    const fresh = (await screen.findByText('Fresh')).closest('tr')!
    const stale = screen.getByText('Stale').closest('tr')!
    expect(fresh.querySelector('[data-tone="new"]')).not.toBeNull()
    expect(stale.querySelector('[data-tone="new"]')).toBeNull()

    await act(() => router.navigate('/account'))
    await waitFor(() => expect(screen.queryByText('Fresh')).not.toBeInTheDocument())
    expect(Date.parse(localStorage.getItem(LAST_SEEN)!)).toBeGreaterThan(Date.parse('2026-10-27T07:00:00Z'))
  })

  test('without a lastSeen there are no new dots', async () => {
    useList([summary({ id: 1, email: { subject: 'Fresh', receivedUtc: '2026-10-27T07:00:00Z' } })])
    signedIn()
    const row = (await screen.findByText('Fresh')).closest('tr')!
    expect(row.querySelector('[data-tone="new"]')).toBeNull()
  })

  test('row click navigates to /statements/:id; History button does not navigate and calls onOpenSheet(id, "history")', async () => {
    const onOpenSheet = vi.fn()
    useList([summary({ id: 9, email: { subject: 'Click me', receivedUtc: '2026-10-27T07:00:00Z' }, historyCount: 2 })])
    mockControl.signInAs('u-admin')
    const { user, router } = renderWithProviders(<SessionProvider><TooltipProvider><StatementsPage onOpenSheet={onOpenSheet} /></TooltipProvider></SessionProvider>, { route: '/statements' })
    await user.click(await screen.findByRole('button', { name: 'History 2' }))
    expect(onOpenSheet).toHaveBeenCalledWith(9, 'history')
    await user.click(screen.getByRole('button', { name: 'Results' }))
    expect(onOpenSheet).toHaveBeenLastCalledWith(9, 'results')
    expect(router.state.location.pathname).toBe('/statements')

    await user.click(screen.getByText('Click me'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/statements/9'))
  })

  test('empty To review shows "All clear. Nothing waiting."', async () => {
    useList([])
    signedIn()
    expect(await screen.findByText('All clear. Nothing waiting.')).toBeInTheDocument()
  })

  test('an empty filtered result says nothing matches', async () => {
    useList([])
    signedIn('/statements?reference=zzz')
    expect(await screen.findByText('No statements match.')).toBeInTheDocument()
  })

  test('Received, Total and Rows headers sort (?sort=-total etc.); default is -received', async () => {
    const { user, router } = signedIn()
    await screen.findByRole('columnheader', { name: /Received/ })
    await waitFor(() => expect(seen[seen.length - 1]?.searchParams.get('sort')).toBe('-received'))
    expect(screen.getByRole('columnheader', { name: /Received/ })).toHaveAttribute('aria-sort', 'descending')

    await user.click(within(screen.getByRole('columnheader', { name: /Total/ })).getByRole('button'))
    await waitFor(() => expect(router.state.location.search).toContain('sort=-total'))
    await waitFor(() => expect(seen[seen.length - 1].searchParams.get('sort')).toBe('-total'))

    await user.click(within(screen.getByRole('columnheader', { name: /Total/ })).getByRole('button'))
    await waitFor(() => expect(router.state.location.search).toContain('sort=total'))
    expect(router.state.location.search).not.toContain('sort=-total')

    await user.click(within(screen.getByRole('columnheader', { name: /Rows/ })).getByRole('button'))
    await waitFor(() => expect(router.state.location.search).toContain('sort=-rows'))
  })

  test('garbage in the URL is ignored and the page renders with defaults', async () => {
    useList([summary({ id: 1 })])
    signedIn('/statements?minTotal=abc&receivedFrom=2026-13-45&tab=nope&sort=bogus&page=-3')
    expect(await screen.findByText('Subject 1')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^To review/ })).toHaveAttribute('aria-selected', 'true')
    const u = seen[seen.length - 1]
    expect(u.searchParams.get('sort')).toBe('-received')
    expect(u.searchParams.has('minTotal')).toBe(false)
    expect(u.searchParams.has('receivedFrom')).toBe(false)
    expect(u.searchParams.has('page')).toBe(false)
  })

  test('Next sends page=2 and a filter change returns to page 1', async () => {
    server.use(
      http.get(LIST, ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page') ?? 1)
        return HttpResponse.json(page([summary({ id: p })], { page: p, total: 60 }))
      }),
    )
    const { user, router } = signedIn()
    await screen.findByText('Subject 1')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Subject 2')).toBeInTheDocument()
    expect(router.state.location.search).toContain('page=2')
    await user.click(screen.getByRole('tab', { name: /^Posted/ }))
    await waitFor(() => expect(router.state.location.search).not.toContain('page'))
  })
})
