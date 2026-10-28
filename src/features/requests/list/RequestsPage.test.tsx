import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, vi } from 'vitest'
import type { Page, RequestSummary, Stats } from '@/api/schema'
import { formatTimestamp } from '@/lib/dates'
import { mockControl } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderWithProviders } from '@/test/render'
import { RequestsPage } from './RequestsPage'
import { countFor, QUEUE_PRESETS } from './queue'

const LIST = '/api/v1/saved-requests'
const STATS = '/api/v1/saved-requests/stats'

function summary(over: Partial<RequestSummary> & { id: number }): RequestSummary {
  const ref = `SR-${String(over.id).padStart(6, '0')}`
  return {
    publicRef: ref,
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
    email: { subject: `Subject ${over.id}`, receivedUtc: '2026-10-27T07:12:44Z' },
    pushId: null,
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
  hasErrors: { pending: 2, all: 3 },
}

let seen: URL[] = []
function recordRequests() {
  seen = []
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url)
    if (u.pathname.endsWith('/saved-requests')) seen.push(u)
  })
}
const listCalls = () => seen.length

function signedIn(route = '/statements') {
  mockControl.signInAs('u-admin')
  recordRequests()
  return renderWithProviders(<RequestsPage />, { route })
}

afterEach(() => {
  server.events.removeAllListeners()
  vi.useRealTimers()
})

describe('queue presets', () => {
  test('presets and counts', () => {
    expect(QUEUE_PRESETS.todo).toEqual({ status: ['pending', 'partial', 'unknown'], sort: 'received' })
    expect(QUEUE_PRESETS.attention).toEqual({ status: ['pending'], needsAttention: true, sort: 'received' })
    expect(QUEUE_PRESETS.duplicates).toEqual({ status: ['pending'], duplicate: true, sort: 'received' })
    expect(QUEUE_PRESETS.posting).toEqual({ status: ['posting'], sort: '-updated' })
    expect(QUEUE_PRESETS.all).toEqual({ sort: '-received' })
    expect(countFor('todo', STATS_FIXED)).toBe(9)
    expect(countFor('attention', STATS_FIXED)).toBe(2)
    expect(countFor('duplicates', STATS_FIXED)).toBe(1)
    expect(countFor('posted', STATS_FIXED)).toBe(4)
    expect(countFor('all', STATS_FIXED)).toBe(16)
  })
})

describe('requests list', () => {
  test('defaults to To do, oldest received first, with counts from stats', async () => {
    server.use(http.get(STATS, () => HttpResponse.json(STATS_FIXED)))
    signedIn()
    expect(await screen.findByRole('tab', { name: 'To do 9' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Needs attention 2' })).toBeInTheDocument()
    const refs = (await screen.findAllByRole('link', { name: /^SR-/ })).map((a) => a.textContent)
    expect(refs).toEqual(['SR-000009', 'SR-000008', 'SR-000012', 'SR-000004', 'SR-000003', 'SR-000011', 'SR-000002', 'SR-000001', 'SR-000005', 'SR-000013'])
    const first = seen.find((u) => u.searchParams.has('sort'))!
    expect(first.search).toContain('status=pending&status=partial&status=unknown')
    expect(first.searchParams.get('sort')).toBe('received')
  })

  test('shows subject, local received time, money, status and the duplicate flag', async () => {
    const received = '2026-10-27T07:12:44Z'
    server.use(
      http.get(LIST, () =>
        HttpResponse.json(
          page([
            summary({
              id: 5,
              controlTotal: 4820.17,
              email: { subject: 'Chase statement', receivedUtc: received },
              duplicate: { flagged: true, of: 117, ofRef: 'SR-000117', reasons: ['same-reference'], acknowledgedBy: null },
              needsAttention: true,
            }),
          ]),
        ),
      ),
    )
    signedIn()
    const row = (await screen.findByText('Chase statement')).closest('tr')!
    expect(within(row).getByText(formatTimestamp(received))).toBeInTheDocument()
    expect(within(row).getByText('4,820.17')).toBeInTheDocument()
    expect(within(row).getByText('Pending')).toBeInTheDocument()
    expect(within(row).getByText('Possible duplicate of SR-000117')).toBeInTheDocument()
    expect(within(row).getByText('Needs attention')).toBeInTheDocument()
  })

  test('a request without email metadata shows a dash', async () => {
    signedIn()
    const row = (await screen.findByRole('link', { name: 'SR-000012' })).closest('tr')!
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  test('search is debounced and sends q', async () => {
    const { user } = signedIn()
    await screen.findByRole('link', { name: 'SR-000009' })
    const before = listCalls()
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'plumb')
    await waitFor(() => expect(seen.some((u) => u.searchParams.get('q') === 'plumb')).toBe(true))
    expect(seen.filter((u) => u.searchParams.has('q'))).toHaveLength(1)
    expect(listCalls()).toBeGreaterThan(before)
  })

  test('search keeps whitespace typed before a pause', async () => {
    const { user } = signedIn()
    await screen.findByRole('link', { name: 'SR-000009' })
    const box = screen.getByRole('searchbox', { name: 'Search' })
    await user.type(box, 'a ')
    await waitFor(() => expect(seen.some((u) => u.searchParams.get('q') === 'a')).toBe(true))
    await user.type(box, 'b')
    expect(box).toHaveValue('a b')
    await waitFor(() => expect(seen.some((u) => u.searchParams.get('q') === 'a b')).toBe(true))
  })

  test('received dates and source go to the API', async () => {
    const { user } = signedIn()
    await screen.findByRole('link', { name: 'SR-000009' })
    await user.type(screen.getByLabelText('Received from'), '2026-10-27')
    await user.selectOptions(screen.getByLabelText('Source'), 'n8n')
    await waitFor(() =>
      expect(
        seen.some((u) => u.searchParams.get('receivedFrom') === '2026-10-27' && u.searchParams.get('source') === 'n8n-mailbox'),
      ).toBe(true),
    )
  })

  test('changing the tab resets the page', async () => {
    const { user, router } = signedIn('/statements?page=2')
    await screen.findByRole('tab', { name: /^To do/ })
    await waitFor(() => expect(seen.some((u) => u.searchParams.get('page') === '2')).toBe(true))
    await user.click(screen.getByRole('tab', { name: /^Needs attention/ }))
    await waitFor(() => expect(router.state.location.search).toContain('tab=attention'))
    expect(router.state.location.search).not.toContain('page')
    await waitFor(() => expect(seen.some((u) => u.searchParams.get('needsAttention') === 'true')).toBe(true))
    expect(seen[seen.length - 1].searchParams.has('page')).toBe(false)
  })

  test('Next sends page=2', async () => {
    server.use(
      http.get(LIST, ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page') ?? 1)
        return HttpResponse.json(page([summary({ id: p })], { page: p, total: 60 }))
      }),
    )
    const { user } = signedIn()
    await screen.findByRole('link', { name: 'SR-000001' })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('link', { name: 'SR-000002' })).toBeInTheDocument()
    expect(seen[seen.length - 1].searchParams.get('page')).toBe('2')
  })

  test('clicking a row opens the detail page', async () => {
    const { user, router } = signedIn()
    await user.click(await screen.findByText('Chase Visa statement – Jul 2026'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/statements/9'))
  })

  test('Enter on a focused row opens the detail page', async () => {
    const { user, router } = signedIn()
    const row = (await screen.findByText('Chase Visa statement – Jul 2026')).closest('tr')!
    row.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/statements/9'))
  })

  test('empty To do', async () => {
    server.use(http.get(LIST, () => HttpResponse.json(page([]))))
    signedIn()
    expect(await screen.findByText('All clear. Nothing waiting.')).toBeInTheDocument()
  })

  test('new arrivals pill: rows stay until it is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let bumped = false
    server.use(
      http.get(STATS, () =>
        HttpResponse.json(bumped ? { ...STATS_FIXED, byStatus: { ...STATS_FIXED.byStatus, pending: 9 } } : STATS_FIXED),
      ),
    )
    const { user } = signedIn()
    await screen.findByRole('link', { name: 'SR-000009' })
    await screen.findByRole('tab', { name: 'To do 9' })
    expect(screen.queryByText(/new — show/)).not.toBeInTheDocument()
    const listBefore = seen.filter((u) => u.searchParams.has('sort')).length
    bumped = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    const pill = await screen.findByRole('button', { name: '2 new — show' })
    expect(seen.filter((u) => u.searchParams.has('sort')).length).toBe(listBefore)
    await user.click(pill)
    await waitFor(() => expect(seen.filter((u) => u.searchParams.has('sort')).length).toBe(listBefore + 1))
    await waitFor(() => expect(screen.queryByText(/new — show/)).not.toBeInTheDocument())
    expect(await screen.findByRole('tab', { name: 'To do 11' })).toBeInTheDocument()
  })

  test('a hostile subject renders as text', async () => {
    const bad = '<img src=x onerror=alert(1)>'
    server.use(http.get(LIST, () => HttpResponse.json(page([summary({ id: 1, email: { subject: bad, receivedUtc: null } })]))))
    const { container } = signedIn()
    expect(await screen.findByText(bad)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
