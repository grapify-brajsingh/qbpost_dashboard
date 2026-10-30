import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

const API = '/api/v2/quickbooks/lists'

// The app's Toaster is mounted in main.tsx, outside the route table; assert on the calls instead.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
beforeEach(() => vi.mocked(toast.success).mockClear())

function open(route = '/lists', as = 'u-editor') {
  mockControl.signInAs(as)
  return renderApp(route)
}

const tab = (name: RegExp) => screen.findByRole('tab', { name })
const table = (name: string) => screen.findByRole('table', { name })

describe('names', () => {
  test('a viewer sees the three lists with counts and account types, and no Sync now', async () => {
    open('/lists', 'u-viewer')
    expect(await screen.findByRole('heading', { level: 1, name: 'QuickBooks lists' })).toBeInTheDocument()
    expect(await tab(/^Accounts\s*10$/)).toHaveAttribute('data-state', 'active')
    expect(await tab(/^Vendors\s*10$/)).toBeInTheDocument()
    expect(await tab(/^Customers\s*4$/)).toBeInTheDocument()
    const accounts = await table('Accounts')
    const row = within(accounts).getByRole('row', { name: /Chase Visa 8890/ })
    expect(within(row).getByText('Credit card')).toBeInTheDocument()
    expect(screen.getByText(/^Lists synced/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument()
  })

  test('the vendor tab searches, keeps the search in the URL and offers to clear a search with no match', async () => {
    const { user, router } = open('/lists?tab=vendors')
    await table('Vendors')
    await user.type(screen.getByRole('searchbox', { name: 'Search names' }), 'electric')
    await waitFor(() => expect(router.state.location.search).toContain('q=electric'))
    // header + Metro Electric Co
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Vendors' })).getAllByRole('row')).toHaveLength(2))
    expect(screen.getByText('Showing 1 of 10 vendors')).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Search names' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search names' }), 'zzz')
    expect(await screen.findByText('No vendors match "zzz".')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await waitFor(() => expect(router.state.location.search).not.toContain('q='))
  })

  test('accounts filter by type', async () => {
    const { user } = open('/lists')
    await table('Accounts')
    await user.click(screen.getByRole('button', { name: /Type/ }))
    await user.click(await screen.findByRole('option', { name: 'Income' }))
    const accounts = await table('Accounts')
    await waitFor(() => expect(within(accounts).getAllByRole('row')).toHaveLength(2))
    expect(within(accounts).getByText('Rental Income')).toBeInTheDocument()
  })

  test('never synced: editors are told to sync, viewers to ask an editor', async () => {
    mockDb.lists = { ...mockDb.lists, accounts: [], vendors: [], customers: [], syncedUtc: null, lastSync: null }
    open('/lists')
    expect(await screen.findByText('No QuickBooks lists yet')).toBeInTheDocument()
    expect(screen.getByText('Press Sync now while QuickBooks is open.')).toBeInTheDocument()
  })

  test('never synced, as a viewer', async () => {
    mockDb.lists = { ...mockDb.lists, accounts: [], vendors: [], customers: [], syncedUtc: null, lastSync: null }
    open('/lists', 'u-viewer')
    expect(await screen.findByText('Ask an editor to sync them.')).toBeInTheDocument()
  })

  test('a failed lists read shows the problem with Try again', async () => {
    server.use(
      http.get(API, () =>
        HttpResponse.json({ title: 'Lists unavailable', status: 500 }, { status: 500, headers: { 'Content-Type': 'application/problem+json' } }),
      ),
    )
    open('/lists')
    expect(await screen.findByText('Lists unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('a failed re-read', () => {
  test('keeps the cached names on the page', async () => {
    const { user } = open()
    await table('Accounts')
    const fail = () => HttpResponse.json({ title: 'Boom', status: 500 }, { status: 500 })
    server.use(http.get(API, fail), http.post(`${API}/sync`, fail))
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole('table', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})

describe('sync now and history', () => {
  test('Sync now brings in new names and puts a Synced row by the user at the top, now in use', async () => {
    mockControl.qbAdded.vendors.push('Brand New Vendor')
    const { user } = open('/lists?tab=history')
    const history = await table('Sync history')
    expect(within(history).getAllByRole('row')).toHaveLength(7) // header + 6 seeded attempts
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('QuickBooks lists synced: 10 accounts, 11 vendors, 4 customers'))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Sync history' })).getAllByRole('row')).toHaveLength(8))
    const top = within(screen.getByRole('table', { name: 'Sync history' })).getAllByRole('row')[1]
    expect(within(top).getByText('Eli Editor')).toBeInTheDocument()
    expect(within(top).getByText('Synced')).toBeInTheDocument()
    expect(within(top).getByText('In use')).toBeInTheDocument()
    expect(within(top).getByText('10 accounts · 11 vendors · 4 customers')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Sync history' })).getAllByText('In use')).toHaveLength(1)
    expect(await tab(/^Vendors\s*11$/)).toBeInTheDocument()
  })

  test('with QuickBooks closed, Sync now adds a Skipped row with the API message and In use stays put', async () => {
    mockControl.qbNotOpen = true
    const { user } = open('/lists?tab=history')
    await table('Sync history')
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Sync history' })).getAllByRole('row')).toHaveLength(8))
    const rows = within(screen.getByRole('table', { name: 'Sync history' })).getAllByRole('row')
    expect(within(rows[1]).getByText('Skipped')).toBeInTheDocument()
    expect(within(rows[1]).getByText(/QuickBooks was not open, so nothing was synced\./)).toBeInTheDocument()
    expect(within(rows[1]).queryByText('In use')).not.toBeInTheDocument()
    expect(within(rows[2]).getByText('In use')).toBeInTheDocument()
  })

  test('history rows say who started them, the result as a word, the names and how long it took', async () => {
    open('/lists?tab=history', 'u-viewer')
    const history = await table('Sync history')
    expect(within(history).getAllByText('Automatic').length).toBeGreaterThan(0)
    expect(within(history).getByText('Eli Editor')).toBeInTheDocument()
    expect(within(history).getByText('Imported from file')).toBeInTheDocument()
    expect(within(history).getByText('Failed')).toBeInTheDocument()
    expect(within(history).getByText('1 min 58 s')).toBeInTheDocument()
    expect(within(history).getByText('QuickBooks did not answer in time. The lists from the last good sync are still used.')).toBeInTheDocument()
  })

  test('filters by who started it and by result, in the URL', async () => {
    const { user, router } = open('/lists?tab=history')
    await table('Sync history')
    await user.click(screen.getByRole('button', { name: /Started by/ }))
    await user.click(await screen.findByRole('option', { name: 'Manual' }))
    await waitFor(() => expect(router.state.location.search).toContain('by=manual'))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Sync history' })).getAllByRole('row')).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: /Result/ }))
    await user.click(await screen.findByRole('option', { name: 'Failed' }))
    expect(await screen.findByText('No syncs match these filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Sync history' })).getAllByRole('row')).toHaveLength(7))
  })

  test('pages through a long history', async () => {
    for (let i = 0; i < 30; i++) {
      mockDb.listSyncs.push({ ...mockDb.listSyncs[mockDb.listSyncs.length - 1], id: -i, trigger: 'schedule', current: false })
    }
    const { user, router } = open('/lists?tab=history')
    await table('Sync history')
    expect(screen.getByText(/Page 1 of 2 · 36 total/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(router.state.location.search).toContain('page=2'))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Sync history' })).getAllByRole('row')).toHaveLength(12))
  })

  test('an API without the history route: the tab says so and the names still work', async () => {
    server.use(http.get(`${API}/syncs`, () => new HttpResponse(null, { status: 404 })))
    const { user } = open('/lists?tab=history')
    expect(await screen.findByText('Sync history needs a newer API.')).toBeInTheDocument()
    await user.click(await tab(/^Accounts/))
    expect(await table('Accounts')).toBeInTheDocument()
  })
})
