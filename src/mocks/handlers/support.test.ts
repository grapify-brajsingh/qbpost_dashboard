import { beforeEach, describe, expect, it } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import type { Page, QbListSyncRun, QbListsResponse, QbListsSyncResponse } from '@/api/schema'

const API = '/api/v2'
let token = ''
const get = () => fetch(`${API}/quickbooks/lists`, { headers: { Authorization: `Bearer ${token}` } })
const history = (query = '') =>
  fetch(`${API}/quickbooks/lists/syncs${query}`, { headers: { Authorization: `Bearer ${token}` } })
const sync = () => fetch(`${API}/quickbooks/lists/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })

beforeEach(() => {
  token = mockControl.signInAs('u-admin')
})

describe('GET /quickbooks/lists (R-16)', () => {
  it('carries lastSync (an ok schedule attempt) and nextSyncUtc next to the lists', async () => {
    const body = (await (await get()).json()) as QbListsResponse
    expect(body.accounts[0]).toEqual({ name: expect.any(String), type: expect.any(String) })
    expect(body.lastSync).toMatchObject({ trigger: 'schedule', outcome: 'ok', reason: null, requestedBy: null })
    expect(typeof body.lastSync?.message).toBe('string')
    expect(Date.parse(body.syncedUtc!)).toBeLessThan(Date.now() - 60_000)
    expect(Date.parse(body.nextSyncUtc!)).toBeGreaterThan(Date.now())
    expect(body).not.toHaveProperty('counts')
  })

  it('answers lastSync null and syncedUtc null when nothing was ever synced', async () => {
    mockDb.lists.syncedUtc = null
    mockDb.lists.lastSync = null
    const body = (await (await get()).json()) as QbListsResponse
    expect(body.syncedUtc).toBeNull()
    expect(body.lastSync).toBeNull()
  })
})

describe('POST /quickbooks/lists/sync (R-16)', () => {
  it('answers 200 with the lists body plus counts, a dashboard lastSync naming the user, and updates syncedUtc', async () => {
    const before = mockDb.lists.syncedUtc
    const res = await sync()
    expect(res.status).toBe(200)
    const body = (await res.json()) as QbListsSyncResponse
    expect(body.counts).toEqual({ accounts: body.accounts.length, vendors: body.vendors.length, customers: body.customers.length })
    expect(body.lastSync).toMatchObject({
      trigger: 'dashboard',
      outcome: 'ok',
      requestedBy: { id: 'u-admin', displayName: expect.any(String) },
    })
    expect(body.syncedUtc).not.toBe(before)
    const again = (await (await get()).json()) as QbListsResponse
    expect(again.lastSync?.trigger).toBe('dashboard')
    expect(again.syncedUtc).toBe(body.syncedUtc)
  })

  it('adds names that were added in QuickBooks since the last sync', async () => {
    mockControl.qbAdded.vendors.push('Brand New Vendor')
    const body = (await (await sync()).json()) as QbListsSyncResponse
    expect(body.vendors).toContain('Brand New Vendor')
    expect(mockDb.lists.vendors).toContain('Brand New Vendor')
  })

  it('lets an editor sync and refuses a viewer with 403', async () => {
    token = mockControl.signInAs('u-editor')
    expect((await sync()).status).toBe(200)
    token = mockControl.signInAs('u-viewer')
    expect((await sync()).status).toBe(403)
  })

  it('answers 409 with the bare type quickbooks-not-open and records a skipped attempt, keeping the lists', async () => {
    mockControl.qbNotOpen = true
    const before = mockDb.lists.syncedUtc
    const res = await sync()
    expect(res.status).toBe(409)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({ type: 'quickbooks-not-open', status: 409, title: "QuickBooks isn't open" })
    const body = (await (await get()).json()) as QbListsResponse
    expect(body.lastSync).toMatchObject({ outcome: 'skipped', reason: 'quickbooks-not-open', trigger: 'dashboard' })
    expect(body.syncedUtc).toBe(before)
  })

  it('answers 503 with the bare type quickbooks-unavailable and records a failed attempt', async () => {
    mockControl.qbDown = true
    const res = await sync()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ type: 'quickbooks-unavailable', status: 503 })
    expect(((await (await get()).json()) as QbListsResponse).lastSync).toMatchObject({ outcome: 'failed', reason: 'quickbooks-unavailable' })
  })

  it('resets the controls with mockDb.reset()', () => {
    mockControl.qbNotOpen = true
    mockControl.qbDown = true
    mockControl.qbAdded.vendors.push('x')
    mockDb.reset()
    expect(mockControl.qbNotOpen).toBe(false)
    expect(mockControl.qbDown).toBe(false)
    expect(mockControl.qbAdded.vendors).toEqual([])
  })
})

describe('GET /quickbooks/lists/syncs (R-17)', () => {
  const page = async (query = '') => (await (await history(query)).json()) as Page<QbListSyncRun>

  it('lists the seeded attempts newest first, the newest ok one in use, counts only on ok rows', async () => {
    const body = await page()
    expect(body).toMatchObject({ page: 1, pageSize: 25, total: body.items.length })
    expect(body.items.length).toBeGreaterThanOrEqual(5)
    const ids = body.items.map((r) => r.id)
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
    expect(body.items.filter((r) => r.current)).toHaveLength(1)
    expect(body.items.find((r) => r.current)).toBe(body.items.find((r) => r.outcome === 'ok'))
    for (const r of body.items) expect(r.counts === null).toBe(r.outcome !== 'ok')
    expect(new Set(body.items.map((r) => r.trigger))).toEqual(new Set(['schedule', 'dashboard', 'import']))
    expect(body.items[0]).toMatchObject({ trigger: 'schedule', outcome: 'ok', startedUtc: mockDb.lists.lastSync?.startedUtc })
  })

  it('filters by trigger and outcome (comma-separated) and counts the filtered set', async () => {
    const manual = await page('?trigger=dashboard,api')
    expect(manual.items.length).toBeGreaterThan(0)
    expect(manual.items.every((r) => r.trigger === 'dashboard' && r.requestedBy !== null)).toBe(true)
    const skipped = await page('?outcome=skipped')
    expect(skipped.total).toBe(skipped.items.length)
    expect(skipped.items.every((r) => r.outcome === 'skipped' && r.counts === null && !r.current)).toBe(true)
  })

  it('pages with page and pageSize', async () => {
    const all = await page()
    const second = await page('?page=2&pageSize=2')
    expect(second).toMatchObject({ page: 2, pageSize: 2, total: all.total })
    expect(second.items.map((r) => r.id)).toEqual(all.items.slice(2, 4).map((r) => r.id))
  })

  it('answers 400 invalid-request for an unknown parameter or value', async () => {
    for (const q of ['?pageSize=101', '?page=0', '?trigger=nope', '?outcome=ok,maybe', '?foo=1']) {
      const res = await history(q)
      expect(res.status, q).toBe(400)
      expect(await res.json()).toMatchObject({ type: 'invalid-request', title: 'Invalid query' })
    }
  })

  it('lets a viewer read it', async () => {
    token = mockControl.signInAs('u-viewer')
    expect((await history()).status).toBe(200)
  })

  it('adds every sync attempt at the top; only an ok one moves current', async () => {
    const before = await page()
    mockControl.qbNotOpen = true
    await sync()
    const afterSkip = await page()
    expect(afterSkip.total).toBe(before.total + 1)
    expect(afterSkip.items[0]).toMatchObject({ trigger: 'dashboard', outcome: 'skipped', current: false, counts: null })
    expect(afterSkip.items.find((r) => r.current)?.id).toBe(before.items.find((r) => r.current)?.id)
    mockControl.qbNotOpen = false
    await sync()
    const afterOk = await page()
    expect(afterOk.items[0]).toMatchObject({ outcome: 'ok', current: true, requestedBy: { id: 'u-admin' } })
    expect(afterOk.items[0].counts).toEqual({
      accounts: mockDb.lists.accounts.length,
      vendors: mockDb.lists.vendors.length,
      customers: mockDb.lists.customers.length,
    })
    expect(afterOk.items.filter((r) => r.current)).toHaveLength(1)
  })
})
