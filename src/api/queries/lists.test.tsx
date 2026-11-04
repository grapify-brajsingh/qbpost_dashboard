import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import { setAccessToken } from '@/api/session'
import type { QbListsResponse } from '@/api/schema'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { listKeys, useQbLists, useQbListsDetail, useQbListSyncs, useSyncQbLists } from './lists'

function setup() {
  const qc = makeQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, wrapper }
}

beforeEach(() => setAccessToken(mockControl.signInAs('u-editor')))
afterEach(() => setAccessToken(null))

describe('useQbListsDetail', () => {
  test('keeps the account types the pickers drop', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useQbListsDetail(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.accounts[0]).toEqual({ name: expect.any(String), type: expect.any(String) })
  })

  test('shares one GET with the pickers, which still get names only', async () => {
    let gets = 0
    server.use(
      http.get('/api/v2/quickbooks/lists', () => {
        gets++
        return undefined // the default handler answers
      }),
    )
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ names: useQbLists(), detail: useQbListsDetail() }), { wrapper })
    await waitFor(() => expect(result.current.names.data).toBeDefined())
    expect(gets).toBe(1)
    expect(typeof result.current.names.data!.accounts[0]).toBe('string')
    expect(typeof result.current.detail.data!.accounts[0]).toBe('object')
  })
})

describe('per-company lists', () => {
  test('two companies never share a lists cache entry, and the request names the company', async () => {
    const seen: (string | null)[] = []
    server.use(
      http.get('/api/v2/quickbooks/lists', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('company'))
        return undefined
      }),
    )
    const { qc, wrapper } = setup()
    const { result } = renderHook(() => ({ one: useQbListsDetail(1), two: useQbListsDetail(2) }), { wrapper })
    await waitFor(() => expect(result.current.two.data).toBeDefined())
    await waitFor(() => expect(result.current.one.data).toBeDefined())
    expect(seen.sort()).toEqual(['1', '2'])
    expect(qc.getQueryData<QbListsResponse>(listKeys.qb(2))?.vendors).toContain('Coastal Beverage Supply')
    expect(qc.getQueryData<QbListsResponse>(listKeys.qb(1))?.vendors).not.toContain('Coastal Beverage Supply')
  })

  test('no company means no company parameter and the default key', async () => {
    const seen: (string | null)[] = []
    server.use(
      http.get('/api/v2/quickbooks/lists', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('company'))
        return undefined
      }),
    )
    const { qc, wrapper } = setup()
    const { result } = renderHook(() => useQbListsDetail(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(seen).toEqual([null])
    expect(qc.getQueryData(listKeys.qb())).toBeDefined()
    expect(listKeys.qb()).toEqual(['quickbooks', 'lists', 'names', 'default'])
  })
})

describe('useQbListSyncs (R-17)', () => {
  test('reads a page of attempts, newest first, with the filters as query parameters', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useQbListSyncs(undefined, { trigger: ['schedule'], outcome: [], page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    const { items, total } = result.current.data!
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((r) => r.trigger === 'schedule')).toBe(true)
    expect(total).toBe(items.length)
  })
})

describe('useSyncQbLists', () => {
  test('useSyncQbLists(1) posts company=1 and updates only that cache entry', async () => {
    let posted: string | null = null
    server.use(
      http.post('/api/v2/quickbooks/lists/sync', ({ request }) => {
        posted = new URL(request.url).searchParams.get('company')
        return undefined
      }),
    )
    mockControl.qbAdded.vendors.push('Brand New Vendor')
    const { qc, wrapper } = setup()
    const { result } = renderHook(() => ({ one: useQbListsDetail(1), two: useQbListsDetail(2), sync: useSyncQbLists(1) }), { wrapper })
    await waitFor(() => expect(result.current.two.data).toBeDefined())
    await waitFor(() => expect(result.current.one.data).toBeDefined())
    const twoBefore = qc.getQueryData<QbListsResponse>(listKeys.qb(2))
    await act(() => result.current.sync.mutateAsync())
    expect(posted).toBe('1')
    expect(qc.getQueryData<QbListsResponse>(listKeys.qb(1))?.vendors).toContain('Brand New Vendor')
    expect(qc.getQueryData<QbListsResponse>(listKeys.qb(2))).toBe(twoBefore)
    expect(qc.getQueryData<QbListsResponse>(listKeys.qb())).toBeUndefined()
  })

  test('a 200 updates the names-only and the detail caches and refetches the history', async () => {
    mockControl.qbAdded.vendors.push('Brand New Vendor')
    const { qc, wrapper } = setup()
    const { result } = renderHook(
      () => ({ detail: useQbListsDetail(), syncs: useQbListSyncs(undefined, { trigger: [], outcome: [], page: 1 }), sync: useSyncQbLists() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.syncs.data).toBeDefined())
    const before = result.current.syncs.data!.total
    await act(() => result.current.sync.mutateAsync())
    expect(qc.getQueryData<QbListsResponse>(listKeys.qb())?.vendors).toContain('Brand New Vendor')
    await waitFor(() => expect(result.current.syncs.data!.total).toBe(before + 1))
    expect(result.current.syncs.data!.items[0]).toMatchObject({ trigger: 'dashboard', outcome: 'ok', current: true })
  })

  test('a list GET still in flight when the sync answers cannot bring the old lists back', async () => {
    mockControl.qbAdded.vendors.push('Brand New Vendor')
    const { qc, wrapper } = setup()
    const { result } = renderHook(() => ({ names: useQbLists(), sync: useSyncQbLists() }), { wrapper })
    await waitFor(() => expect(result.current.names.data).toBeDefined())

    const old = structuredClone(mockDb.lists)
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      http.get('/api/v2/quickbooks/lists', async () => {
        await gate
        return HttpResponse.json(old)
      }),
    )
    void qc.refetchQueries({ queryKey: listKeys.qb(), exact: true })
    await act(() => result.current.sync.mutateAsync())
    release()
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.names.data!.vendors).toContain('Brand New Vendor')
  })

  test('a failed sync refetches the lists and the history (the attempt was recorded)', async () => {
    mockControl.qbNotOpen = true
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ syncs: useQbListSyncs(undefined, { trigger: [], outcome: [], page: 1 }), sync: useSyncQbLists() }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.syncs.data).toBeDefined())
    await act(async () => {
      await result.current.sync.mutateAsync().catch(() => undefined)
    })
    await waitFor(() => expect(result.current.syncs.data!.items[0]).toMatchObject({ outcome: 'skipped', current: false }))
  })
})
