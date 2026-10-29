import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, vi } from 'vitest'
import { toast } from 'sonner'
import { formatTimestamp } from '@/lib/dates'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

afterEach(() => {
  server.events.removeAllListeners()
  vi.mocked(toast.success).mockClear()
})

const problemResponse = (status: number, title: string, detail: string) =>
  HttpResponse.json({ type: 'about:blank', title, status, detail }, { status, headers: { 'Content-Type': 'application/problem+json' } })

async function open(id: number, as = 'u-admin') {
  mockControl.signInAs(as)
  const r = renderApp(`/statements/${id}`)
  await screen.findByRole('heading', { level: 1 })
  return r
}

/** Discard, Restore and Resolve live in the statement header's ⋯ menu. */
async function choose(user: ReturnType<typeof renderApp>['user'], name: string) {
  await user.click(screen.getByRole('button', { name: 'More actions' }))
  await user.click(await screen.findByRole('menuitem', { name }))
}
const confirm = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' })

function recordBodies() {
  const bodies: unknown[] = []
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && /\/(discard|restore|resolve)$/.test(new URL(request.url).pathname)) {
      void request.clone().text().then((t) => bodies.push(t ? JSON.parse(t) : undefined))
    }
  })
  return bodies
}

describe('Discard', () => {
  test('Confirm is disabled until there is a reason; over 500 characters is refused', async () => {
    const { user } = await open(2)
    await choose(user, 'Discard')
    expect(confirm()).toBeDisabled()
    const reason = screen.getByLabelText('Reason')
    await user.type(reason, 'duplicate email')
    expect(confirm()).toBeEnabled()
    await user.clear(reason)
    await user.click(reason)
    await user.paste('x'.repeat(501))
    expect(screen.getByText('At most 500 characters')).toBeInTheDocument()
    expect(confirm()).toBeDisabled()
  })

  test('success closes the dialog and the discarded banner shows the reason', async () => {
    const { user } = await open(2)
    await choose(user, 'Discard')
    await user.type(screen.getByLabelText('Reason'), 'duplicate email')
    await user.click(confirm())
    expect(await screen.findByText('Discarded: duplicate email')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockDb.requests.find((r) => r.id === 2)!.status).toBe('discarded')
  })
})

describe('Discard failure', () => {
  test('a 500 keeps the dialog open, shows the problem and sends no success toast', async () => {
    server.use(http.post('/api/v2/saved-requests/2/discard', () => problemResponse(500, 'Server error', 'Try again later.')))
    const { user } = await open(2)
    await choose(user, 'Discard')
    await user.type(screen.getByLabelText('Reason'), 'dup')
    await user.click(confirm())
    const d = screen.getByRole('dialog')
    expect(await within(d).findByText('Server error')).toBeInTheDocument()
    expect(within(d).getByLabelText('Reason')).toHaveValue('dup')
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('Restore', () => {
  test('confirming moves the request back to pending', async () => {
    const { user } = await open(10)
    await choose(user, 'Restore')
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText(/^Discarded:/)).not.toBeInTheDocument())
    expect(mockDb.requests.find((r) => r.id === 10)!.status).toBe('pending')
  })
})

describe('Resolve', () => {
  test('unknown: shows the evidence before the choices, requires a note, sends not-posted', async () => {
    const bodies = recordBodies()
    const { user } = await open(8)
    await choose(user, 'Resolve')
    const d = await screen.findByRole('dialog')
    const evidence = within(d).getByRole('group', { name: 'Evidence' })
    expect(within(evidence).getByText('api-checking-4521-2026-07')).toBeInTheDocument()
    expect(within(evidence).getByText(/Ledger batch: partial, submitted 6, posted 4/)).toBeInTheDocument()
    expect(within(evidence).getByText(/Last attempt: unknown/)).toBeInTheDocument()
    expect(within(evidence).getByText(formatTimestamp('2026-10-19T09:00:12Z'))).toBeInTheDocument()
    expect(within(d).getByText('Check QuickBooks before you choose')).toBeInTheDocument()
    expect(within(d).getByRole('radio', { name: 'Posted' })).toBeInTheDocument()
    const notPosted = within(d).getByRole('radio', { name: 'Not posted' })
    expect(confirm()).toBeDisabled()
    await user.click(notPosted)
    expect(confirm()).toBeDisabled() // a note is required
    await user.type(within(d).getByLabelText('Note'), 'Not in QuickBooks')
    await user.click(confirm())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(bodies).toEqual([{ outcome: 'not-posted', note: 'Not in QuickBooks' }])
    await waitFor(() => expect(mockDb.requests.find((r) => r.id === 8)!.status).toBe('pending'))
  })

  test('unknown without a ledger batch shows the post id only and still works', async () => {
    const r = mockDb.requests.find((x) => x.id === 8)!
    r.ledgerBatch = null
    r.postId = 'api-checking-4521-2026-07'
    const { user } = await open(8)
    await choose(user, 'Resolve')
    const d = await screen.findByRole('dialog')
    expect(within(d).getByText('api-checking-4521-2026-07')).toBeInTheDocument()
    expect(within(d).queryByText(/Ledger batch/)).not.toBeInTheDocument()
    await user.click(within(d).getByRole('radio', { name: 'Posted' }))
    await user.type(within(d).getByLabelText('Note'), 'Found in QuickBooks')
    await user.click(confirm())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(mockDb.requests.find((x) => x.id === 8)!.status).toBe('posted'))
  })

  test('partial offers only "Posted (accept as is)" and says to post the rest elsewhere', async () => {
    const { user } = await open(9)
    await choose(user, 'Resolve')
    const d = await screen.findByRole('dialog')
    expect(within(d).getAllByRole('radio')).toHaveLength(1)
    expect(within(d).getByRole('radio', { name: 'Posted (accept as is)' })).toBeChecked()
    expect(within(d).queryByRole('radio', { name: 'Not posted' })).not.toBeInTheDocument()
    expect(within(d).getByText(/post any remaining rows outside the dashboard/)).toBeInTheDocument()
    expect(within(d).getByText(/Last attempt: partial · HTTP 200 · finished/)).toBeInTheDocument()
    expect(within(d).getAllByText(formatTimestamp('2026-10-18T09:00:31Z')).length).toBeGreaterThan(1)
  })

  test('a failed resolve keeps the dialog open, shows the problem and sends no success toast', async () => {
    server.use(http.post('/api/v2/saved-requests/8/resolve', () => problemResponse(409, 'Already resolved', 'Someone else resolved this request.')))
    const { user } = await open(8)
    await choose(user, 'Resolve')
    const d = await screen.findByRole('dialog')
    await user.click(within(d).getByRole('radio', { name: 'Posted' }))
    await user.type(within(d).getByLabelText('Note'), 'checked')
    await user.click(confirm())
    expect(await within(d).findByText('Already resolved')).toBeInTheDocument()
    expect(within(d).getByText('Someone else resolved this request.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })
})
