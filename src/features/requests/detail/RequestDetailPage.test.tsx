import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, vi } from 'vitest'
import type { Action, RequestDetail } from '@/api/schema'
import { mockControl } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'
import { ActionBar } from './ActionBar'
import { renderWithProviders } from '@/test/render'
import { TooltipProvider } from '@/components/ui/tooltip'

const statusBanner = () => screen.getByRole('status', { name: 'Request status' })
const headerOf = (ref: string) => screen.getByRole('heading', { name: ref }).closest('header') as HTMLElement

const API = '/api/v1/saved-requests'

afterEach(() => {
  server.events.removeAllListeners()
  vi.useRealTimers()
})

function open(id: number, as = 'u-admin', search = '') {
  mockControl.signInAs(as)
  return renderApp(`/statements/${id}${search}`)
}

function detail(over: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 6,
    publicRef: 'SR-000006',
    status: 'posting',
    rowVersion: 2,
    source: { kind: 'api-client', id: 'n8n-mailbox', name: 'n8n mailbox workflow' },
    reference: 'ref-6',
    controlTotal: 10,
    transactionCount: 1,
    currentVersion: 1,
    needsAttention: false,
    duplicate: { flagged: false, of: null, reasons: [], acknowledgedBy: null },
    validation: { state: 'ok' },
    lastAttempt: null,
    postId: null,
    email: { subject: 'Subject 6', receivedUtc: '2026-10-27T07:12:44Z' },
    pushId: null,
    historyCount: 0,
    validationSummary: { state: 'ok', problemCount: 0, validatedUtc: null, versionNumber: null },
    postSummary: null,
    skipCount: 0,
    created: { utc: '2026-10-27T07:12:50Z', by: { id: 'x', name: 'n8n' } },
    updated: { utc: '2026-10-28T09:30:00Z', by: { id: 'u-admin', name: 'Asha K' } },
    allowedActions: [],
    payload: { transactions: [] },
    readErrors: [],
    otherUnpostedPushes: [],
    ...over,
  }
}

describe('header', () => {
  test('shows ref, status, subject, received, reference, source, created and updated', async () => {
    open(1)
    expect(await screen.findByRole('heading', { name: 'SR-000001' })).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Chase statement – Aug 2026')).toBeInTheDocument()
    const header = headerOf('SR-000001')
    expect(within(header).getByText('Received').nextSibling).toHaveTextContent(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(within(header).getByText('Reference').nextSibling).toHaveTextContent('chase-4521-2026-08')
    expect(within(header).getByText('Source').nextSibling).toHaveTextContent('n8n mailbox workflow')
    expect(within(header).getByText('Created').nextSibling).toHaveTextContent(/n8n mailbox workflow · \d{4}-/)
    expect(within(header).getByText('Updated').nextSibling).toHaveTextContent(/Asha K · \d{4}-/)
    expect(within(header).queryByText('Post ID')).not.toBeInTheDocument()
  })

  test('shows postId once posted', async () => {
    open(7)
    await screen.findByRole('heading', { name: 'SR-000007' })
    expect(within(headerOf('SR-000007')).getByText('Post ID').nextSibling).toHaveTextContent(
      'api-savings-1177-2026-07',
    )
  })

  test('duplicate flag links to the other request and shows its status', async () => {
    open(5)
    const link = await screen.findByRole('link', { name: /Possible duplicate of SR-000001/ })
    expect(link).toHaveAttribute('href', '/statements/1')
    expect(screen.getByText(/Other request is pending/)).toBeInTheDocument()
  })

  test('renders a hostile subject as text', async () => {
    server.use(
      http.get(`${API}/6`, () =>
        HttpResponse.json(detail({ status: 'pending', email: { subject: '<img src=x onerror=alert(1)>', receivedUtc: null } }), {
          headers: { ETag: '"2"' },
        }),
      ),
    )
    open(6)
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('banners', () => {
  test('posting', async () => {
    open(6)
    expect(await screen.findByRole('status', { name: 'Request status' })).toHaveTextContent(/Posting… started by Asha K/)
  })
  test('posted', async () => {
    open(7)
    expect(await screen.findByRole('status', { name: 'Request status' })).toHaveTextContent('Posted. Locked.')
    expect(statusBanner()).toHaveTextContent('api-savings-1177-2026-07')
  })
  test('unknown', async () => {
    open(8)
    expect(await screen.findByRole('status', { name: 'Request status' })).toHaveTextContent('QuickBooks may have posted this')
  })
  test('partial', async () => {
    open(9)
    expect(await screen.findByRole('status', { name: 'Request status' })).toHaveTextContent('Some rows posted')
  })
  test('discarded shows the reason', async () => {
    open(10)
    expect(await screen.findByRole('status', { name: 'Request status' })).toHaveTextContent('Sent by mistake while testing the n8n workflow')
  })
  test('pending has no banner', async () => {
    open(1)
    await screen.findByRole('heading', { name: 'SR-000001' })
    expect(screen.queryByRole('status', { name: 'Request status' })).not.toBeInTheDocument()
  })
})

describe('actions follow allowedActions', () => {
  test('viewer sees no action buttons', async () => {
    open(1, 'u-viewer')
    await screen.findByRole('heading', { name: 'SR-000001' })
    expect(screen.queryByRole('group', { name: 'Request actions' })).not.toBeInTheDocument()
    for (const name of ['Validate', 'Post', 'Discard', 'Restore', 'Resolve']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  test('admin on unknown sees only Resolve', async () => {
    open(8)
    await screen.findByRole('heading', { name: 'SR-000008' })
    const group = screen.getByRole('group', { name: 'Request actions' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Resolve'])
  })

  test('buttons are ordered, edit is not a button, onAction fires, disabled reason is a tooltip', async () => {
    const onAction = vi.fn()
    const all: Action[] = ['resolve', 'restore', 'edit', 'discard', 'post', 'validate']
    const { user } = renderWithProviders(
      <TooltipProvider>
        <ActionBar request={{ allowedActions: all }} onAction={onAction} disabled={{ post: 'Save first' }} />
      </TooltipProvider>,
    )
    const group = screen.getByRole('group', { name: 'Request actions' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Validate',
      'Post',
      'Discard',
      'Restore',
      'Resolve',
    ])
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onAction).toHaveBeenCalledWith('discard')
    await user.hover(screen.getByRole('button', { name: 'Post' }).parentElement!)
    expect((await screen.findAllByText('Save first')).length).toBeGreaterThan(0)
  })
})

describe('not found', () => {
  test('404 shows Request not found with a link back', async () => {
    open(9999)
    expect(await screen.findByRole('heading', { name: 'Request not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Requests' })).toHaveAttribute('href', '/statements')
  })
})

describe('tabs', () => {
  test('default is transactions and the tab is bound to ?tab=', async () => {
    const { user, router } = open(1)
    await screen.findByRole('heading', { name: 'SR-000001' })
    expect(screen.getByRole('tab', { name: 'Transactions' })).toHaveAttribute('data-state', 'active')
    await user.click(screen.getByRole('tab', { name: 'Attempts' }))
    expect(router.state.location.search).toBe('?tab=attempts')
    expect(screen.getByRole('tab', { name: 'Attempts' })).toHaveAttribute('data-state', 'active')
  })

  test('opens the tab named in the URL', async () => {
    open(1, 'u-admin', '?tab=history')
    await screen.findByRole('heading', { name: 'SR-000001' })
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('data-state', 'active')
  })
})

describe('polling while posting', () => {
  test('refetches every 3 s and stops once the status changes', async () => {
    let gets = 0
    let posted = false
    server.use(
      http.get(`${API}/6`, () => {
        gets++
        return HttpResponse.json(detail({ status: posted ? 'posted' : 'posting', postId: posted ? 'api-6' : null }), {
          headers: { ETag: '"2"' },
        })
      }),
    )
    vi.useFakeTimers({ shouldAdvanceTime: true })
    open(6)
    expect(await screen.findByRole('status', { name: 'Request status' })).toHaveTextContent('Posting…')
    expect(gets).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    await waitFor(() => expect(gets).toBe(3))

    posted = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await waitFor(() => expect(statusBanner()).toHaveTextContent('Posted. Locked.'))
    const settled = gets
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(gets).toBe(settled)
  })
})

describe('failed background refetch', () => {
  test('keeps the page and shows an alert when a poll fails', async () => {
    let gets = 0
    server.use(
      http.get(`${API}/6`, () => {
        gets++
        if (gets > 1) return HttpResponse.json({ title: 'Server error', status: 500 }, { status: 500 })
        return HttpResponse.json(detail(), { headers: { ETag: '"2"' } })
      }),
    )
    vi.useFakeTimers({ shouldAdvanceTime: true })
    open(6)
    await screen.findByRole('heading', { name: 'SR-000006' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
    expect(screen.getByRole('heading', { name: 'SR-000006' })).toBeInTheDocument()
  })
})
