import { useState } from 'react'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import { stopQbListRechecks } from '@/api/queries/lists'
import { SessionProvider } from '@/auth/SessionProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderWithProviders } from '@/test/render'
import { QbListsStatus } from './QbListsStatus'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

const LISTS = '/api/v2/quickbooks/lists'

function show(as = 'u-editor') {
  mockControl.signInAs(as)
  return renderWithProviders(
    <SessionProvider>
      <TooltipProvider>
        <QbListsStatus />
      </TooltipProvider>
    </SessionProvider>,
  )
}

const syncButton = () => screen.findByRole('button', { name: 'Sync now' })
/** The visible text; the hidden live region can say the same words. */
const shown = (text: string | RegExp) => screen.findByText(text, { ignore: 'script, style, [role="status"]' })

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.warning).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('status line (spec 3.1)', () => {
  test('shows "QuickBooks lists…" while the lists load', async () => {
    server.use(http.get(LISTS, async () => new Promise(() => undefined)))
    show()
    expect(await shown('QuickBooks lists…')).toBeInTheDocument()
  })

  test('shows the age of a fresh sync, without a native title (the tooltip has the exact time)', async () => {
    show()
    const text = await screen.findByText('Lists synced 12 min ago')
    expect(text).not.toHaveAttribute('title')
  })

  test('keeps the aging text out of the live region, so minute ticks are not announced', async () => {
    show()
    const text = await screen.findByText('Lists synced 12 min ago')
    expect(text).not.toHaveAttribute('aria-live')
    const live = screen.getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent(/^QuickBooks lists synced$/)
  })

  test('warns "never synced" when syncedUtc is null', async () => {
    mockDb.lists.syncedUtc = null
    mockDb.lists.lastSync = null
    show()
    expect(await shown('QuickBooks lists never synced')).toBeInTheDocument()
  })

  test('a skipped attempt reads "last sync skipped", without the warning style', async () => {
    mockDb.lists.lastSync = {
      ...mockDb.lists.lastSync!,
      outcome: 'skipped',
      reason: 'quickbooks-not-open',
      message: 'QuickBooks was not open, so nothing was synced.',
    }
    show()
    const text = await shown(/^Lists from .+ · last sync skipped$/)
    expect(text).not.toHaveClass('text-warning')
  })

  test('a failed attempt reads "last sync failed", with the warning style', async () => {
    mockDb.lists.lastSync = { ...mockDb.lists.lastSync!, outcome: 'failed', reason: 'quickbooks-busy', message: 'QuickBooks was busy.' }
    show()
    expect(await shown(/^Lists from .+ · last sync failed$/)).toHaveClass('text-warning')
  })

  test('shows counts and the next automatic sync in the tooltip', async () => {
    const { user } = show()
    await user.hover(await screen.findByText('Lists synced 12 min ago'))
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent(/\d+ accounts · \d+ vendors · \d+ customers/)
    expect(tip).toHaveTextContent(/Next automatic sync at \d\d:\d\d/)
    expect(tip).toHaveTextContent(/Lists from \d{4}-\d\d-\d\d \d\d:\d\d/)
  })

  test('shows the failed attempt message in the tooltip', async () => {
    mockDb.lists.lastSync = {
      ...mockDb.lists.lastSync!,
      outcome: 'failed',
      reason: 'quickbooks-unavailable',
      message: 'QuickBooks could not be reached. The lists from the last good sync are still used.',
    }
    const { user } = show()
    await user.hover(await shown(/last sync failed/))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('QuickBooks could not be reached.')
  })

  test('says the lists are unavailable when the query fails, and still offers Sync now', async () => {
    server.use(http.get(LISTS, () => HttpResponse.json({ title: 'Boom', status: 500 }, { status: 500 })))
    show()
    expect(await shown('QuickBooks lists unavailable')).toBeInTheDocument()
    expect(await syncButton()).toBeInTheDocument()
  })

  test('a failed re-read keeps the cached lists on show', async () => {
    const { user } = show()
    await screen.findByText('Lists synced 12 min ago')
    server.use(
      http.get(LISTS, () => HttpResponse.json({ title: 'Boom', status: 500 }, { status: 500 })),
      http.post('/api/v2/quickbooks/lists/sync', () => HttpResponse.json({ title: 'Boom', status: 500 }, { status: 500 })),
    )
    await user.click(await syncButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('QuickBooks lists unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('Lists synced 12 min ago')).toBeInTheDocument()
  })
})

describe('Sync now button (spec 3.2)', () => {
  test('is shown to editors and admins', async () => {
    show('u-editor')
    expect(await syncButton()).toBeEnabled()
  })

  test('is not shown to a viewer, who still sees the status', async () => {
    show('u-viewer')
    expect(await screen.findByText('Lists synced 12 min ago')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument()
  })

  test('shows a disabled "Syncing…" button while waiting, then a success toast with the counts', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      http.post('/api/v2/quickbooks/lists/sync', async () => {
        await gate
        return undefined // fall through to the default handler
      }),
    )
    const { user } = show()
    await user.click(await syncButton())
    const busy = await screen.findByRole('button', { name: 'Syncing…' })
    expect(busy).toBeDisabled()
    release()
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/^QuickBooks lists synced: \d+ accounts, \d+ vendors, \d+ customers$/)
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled()
  })

  test('replaces the shown lists with the answer: the status reads "just now"', async () => {
    const { user } = show()
    await user.click(await syncButton())
    expect(await screen.findByText('Lists synced just now')).toBeInTheDocument()
  })

  test('409 quickbooks-not-open: warning toast, and the status shows the skipped attempt', async () => {
    mockControl.qbNotOpen = true
    const { user } = show()
    await user.click(await syncButton())
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toBe("QuickBooks isn't open. Open the company file in QuickBooks, then sync again.")
    expect(toast.success).not.toHaveBeenCalled()
    expect(await shown(/last sync skipped/)).toBeInTheDocument()
  })

  test('503 quickbooks-unavailable: error toast with the problem title, and the lists are re-read', async () => {
    mockControl.qbDown = true
    const { user } = show()
    await user.click(await syncButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('QuickBooks is not available')))
    expect(await shown(/last sync failed/)).toBeInTheDocument()
  })

  test('coming back during a sync shows Syncing… and offers no second press', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    let posts = 0
    server.use(
      http.post('/api/v2/quickbooks/lists/sync', async () => {
        posts++
        await gate
        return undefined // fall through to the default handler
      }),
    )
    function Toggle() {
      const [on, setOn] = useState(true)
      return (
        <>
          <button onClick={() => setOn(!on)}>Toggle</button>
          {on && <QbListsStatus />}
        </>
      )
    }
    mockControl.signInAs('u-editor')
    const { user } = renderWithProviders(
      <SessionProvider>
        <TooltipProvider>
          <Toggle />
        </TooltipProvider>
      </SessionProvider>,
    )
    await user.click(await syncButton())
    await screen.findByRole('button', { name: 'Syncing…' })
    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeDisabled()
    expect(posts).toBe(1)
    release()
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
  })

  test('429: asks to try again in a minute', async () => {
    server.use(http.post('/api/v2/quickbooks/lists/sync', () => HttpResponse.json({ title: 'Too Many Requests', status: 429 }, { status: 429 })))
    const { user } = show()
    await user.click(await syncButton())
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Too many syncs; try again in a minute.'))
  })

  test('504 sync-timeout: says the sync is still running', async () => {
    server.use(
      http.post('/api/v2/quickbooks/lists/sync', () =>
        HttpResponse.json({ type: 'sync-timeout', title: 'The sync is still running', status: 504 }, { status: 504 }),
      ),
    )
    const { user, queryClient } = show()
    await user.click(await syncButton())
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith('The sync is still running in QuickBooks; the status will update when it finishes.'),
    )
    stopQbListRechecks(queryClient) // real timers: they would outlive this test
  })

  describe('after a 504 the lists are re-read on a schedule', () => {
    let gets = 0

    function timedOut() {
      server.use(
        http.get(LISTS, () => {
          gets++
          return undefined // the default handler answers
        }),
        http.post('/api/v2/quickbooks/lists/sync', () =>
          HttpResponse.json({ type: 'sync-timeout', title: 'The sync is still running', status: 504 }, { status: 504 }),
        ),
      )
    }

    async function press(r: ReturnType<typeof show>) {
      await waitFor(() => expect(gets).toBeGreaterThan(0))
      fireEvent.click(await syncButton())
      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('The sync is still running in QuickBooks; the status will update when it finishes.'))
      await new Promise((r) => setTimeout(r, 200)) // let the immediate re-read settle
      void r
      return gets
    }

    const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms) })

    beforeEach(() => {
      gets = 0
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    })

    test('re-reads at 15, 45, 90 and 150 seconds when nothing newer shows up', async () => {
      timedOut()
      const r = show()
      const base = await press(r)
      await advance(14_000)
      expect(gets).toBe(base)
      await advance(1_000)
      await waitFor(() => expect(gets).toBe(base + 1))
      await advance(30_000)
      await waitFor(() => expect(gets).toBe(base + 2))
      await advance(45_000)
      await waitFor(() => expect(gets).toBe(base + 3))
      await advance(60_000)
      await waitFor(() => expect(gets).toBe(base + 4))
      await advance(300_000)
      expect(gets).toBe(base + 4)
    })

    test('stops once the lists show an attempt newer than the one at the press', async () => {
      timedOut()
      const r = show()
      const base = await press(r)
      await advance(15_000)
      await waitFor(() => expect(gets).toBe(base + 1))
      mockDb.lists.lastSync = { ...mockDb.lists.lastSync!, finishedUtc: new Date().toISOString() }
      await advance(30_000)
      await waitFor(() => expect(gets).toBe(base + 2))
      await advance(300_000)
      expect(gets).toBe(base + 2)
    })

    test('an attempt that finished before the press does not stop them, even if the cache has not seen it', async () => {
      timedOut()
      const r = show()
      await waitFor(() => expect(gets).toBeGreaterThan(0))
      await screen.findByText('Lists synced 12 min ago')
      // The schedule ran after the cached read; the attempt the user is waiting for is still running.
      mockDb.lists.lastSync = { ...mockDb.lists.lastSync!, finishedUtc: new Date().toISOString() }
      const base = await press(r)
      await advance(15_000)
      await waitFor(() => expect(gets).toBe(base + 1))
      await advance(30_000)
      await waitFor(() => expect(gets).toBe(base + 2))
    })

    test('leaving the page does not stop them', async () => {
      timedOut()
      const r = show()
      const base = await press(r)
      r.unmount()
      await advance(15_000)
      await waitFor(() => expect(gets).toBe(base + 1))
      await advance(300_000)
      await waitFor(() => expect(gets).toBe(base + 4))
    })

    test('a second 504 replaces the first set instead of stacking', async () => {
      timedOut()
      const r = show()
      const base = await press(r)
      await advance(10_000)
      fireEvent.click(await syncButton())
      await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(2))
      await new Promise((r) => setTimeout(r, 200))
      const mid = gets
      await advance(400_000)
      await waitFor(() => expect(gets).toBe(mid + 4))
      void base
    })
  })

  test('a joined run: the toast does not say the user synced when another editor ran it', async () => {
    server.use(
      http.post('/api/v2/quickbooks/lists/sync', () =>
        HttpResponse.json({
          syncedUtc: new Date().toISOString(),
          accounts: [],
          vendors: [],
          customers: [],
          nextSyncUtc: null,
          counts: { accounts: 1, vendors: 2, customers: 3 },
          lastSync: {
            trigger: 'dashboard',
            outcome: 'ok',
            reason: null,
            startedUtc: new Date().toISOString(),
            finishedUtc: new Date().toISOString(),
            requestedBy: { id: 'someone-else', displayName: 'Ben Okoro' },
            message: 'The lists were synced from QuickBooks.',
          },
        }),
      ),
    )
    const { user } = show()
    await user.click(await syncButton())
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('QuickBooks lists synced by Ben Okoro: 1 account, 2 vendors, 3 customers'))
  })
})
