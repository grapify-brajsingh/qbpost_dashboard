import { beforeEach, describe, expect, it } from 'vitest'
import type { AuditEvent, DashboardSummary, Page } from '@/api/schema'
import { mockControl, mockDb } from '@/mocks/db'

const API = '/api/v2'
let token = ''
const get = (path: string) => fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })

const FROM = new Date(Date.now() - 90 * 86_400_000).toISOString()
const TO = new Date(Date.now() + 60_000).toISOString()

async function summary(qs: string): Promise<DashboardSummary> {
  const res = await get(`/dashboard/summary?${qs}`)
  expect(res.status).toBe(200)
  return (await res.json()) as DashboardSummary
}

/** The audit feed's own total for one action; the feed's `to` is inclusive, so stop a millisecond earlier. */
async function auditTotal(action: string): Promise<number> {
  const to = new Date(Date.parse(TO) - 1).toISOString()
  const qs = new URLSearchParams({ action, from: FROM, to, pageSize: '1' })
  return ((await (await get(`/audit-events?${qs.toString()}`)).json()) as Page<AuditEvent>).total
}

beforeEach(() => {
  mockDb.reset()
  token = mockControl.signInAs('u-admin')
})

describe('GET /dashboard/summary (R-11)', () => {
  it('counts equal the audit totals and the series sums to them', async () => {
    const s = await summary(new URLSearchParams({ from: FROM, to: TO, bucket: 'week', tz: 'UTC' }).toString())

    expect(s.counts.received).toBe(await auditTotal('received'))
    expect(s.counts.posted).toBe(await auditTotal('posted'))
    expect(s.counts.postFailed).toBe(await auditTotal('post-failed'))
    expect(s.counts.discarded).toBe(await auditTotal('discarded'))
    expect(s.series.reduce((n, b) => n + b.received, 0)).toBe(s.counts.received)
    expect(s.series.reduce((n, b) => n + b.posted, 0)).toBe(s.counts.posted)
    expect(s.previous).toBeNull()
    expect(s.posted.previousAmount).toBeNull()
  })

  it('answers the previous period when a compare range is sent', async () => {
    const qs = new URLSearchParams({ from: FROM, to: TO, compareFrom: '2020-01-01T00:00:00Z', compareTo: FROM, tz: 'UTC' })
    const s = await summary(qs.toString())

    expect(s.previous).toEqual({ received: 0, posted: 0, postFailed: 0, discarded: 0 })
    expect(s.posted.previousRows).toBe(0)
  })

  it('refuses an empty range and a half compare range', async () => {
    expect((await get(`/dashboard/summary?from=${TO}&to=${FROM}`)).status).toBe(400)
    expect((await get(`/dashboard/summary?from=${FROM}&to=${TO}&compareFrom=${FROM}`)).status).toBe(400)
  })
})
