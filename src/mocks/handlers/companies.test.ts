import { beforeEach, describe, expect, it } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import type { CompaniesResponse, Company, CompanyScanResult } from '@/api/schema'

const API = '/api/v2'
let token = ''
const call = (path: string, init: RequestInit = {}) =>
  fetch(`${API}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } })
const patch = (id: number, body: unknown, ifMatch?: string) =>
  call(`/companies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  token = mockControl.signInAs('u-admin')
})

describe('GET /companies (R-18)', () => {
  it('lists is null for a never-synced company and populated for the others; waitingCount counts pending statements', async () => {
    mockDb.requests.find((r) => r.status === 'pending')!.companyId = 2
    const { items } = (await (await call('/companies')).json()) as CompaniesResponse
    expect(items[2].lists).toBeNull()
    expect(items[3].lists).toBeNull()
    expect(items[0].lists).toMatchObject({ outcome: 'ok', syncedUtc: expect.any(String) })
    expect(items[1].lists).toMatchObject({ outcome: 'ok', syncedUtc: expect.any(String) })
    expect(items[1].waitingCount).toBe(1)
    // company 1 holds every other pending statement that has a company (statement 14 has none)
    expect(items[0].waitingCount).toBe(mockDb.requests.filter((r) => r.status === 'pending' && r.companyId === 1).length)
    expect(items[0].waitingCount).toBeGreaterThan(0)
  })
  it('lists the four fixture companies with codes 18, 440, 7 and 12', async () => {
    const body = (await (await call('/companies')).json()) as CompaniesResponse
    expect(body).toMatchObject({ rootConfigured: true, rootReachable: true })
    expect(body.items.map((c) => [c.id, c.code, c.state, c.access])).toEqual([
      [1, '18', 'active', 'approved'], [2, '440', 'active', 'needs-approval'], [3, '7', 'ambiguous', 'unchecked'], [4, '12', 'missing', 'file-not-found'],
    ])
    expect(body.items[0]).toMatchObject({ isDefault: true, matchNames: ['Zemen Market'], rowVersion: 1 })
    expect(body.items[2].candidateFiles).toHaveLength(2)
  })
  it('a viewer gets 200 here and 403 on scan, check and PATCH', async () => {
    token = mockControl.signInAs('u-viewer')
    expect((await call('/companies')).status).toBe(200)
    expect((await call('/companies/scan', { method: 'POST' })).status).toBe(403)
    expect((await call('/companies/2/check', { method: 'POST' })).status).toBe(403)
    expect((await patch(2, { matchNames: ['x'] }, '1')).status).toBe(403)
  })
})

describe('POST /companies/scan', () => {
  it('adds the folders in scanAdds and a second scan reports added 0', async () => {
    mockControl.scanAdds = ['22_Harbor Deli East']
    const first = (await (await call('/companies/scan', { method: 'POST' })).json()) as CompanyScanResult
    expect(first.added).toBe(1)
    expect(first.items[first.items.length - 1]).toMatchObject({ code: '22', displayName: 'Harbor Deli East', state: 'active', access: 'unchecked' })
    expect(((await (await call('/companies/scan', { method: 'POST' })).json()) as CompanyScanResult).added).toBe(0)
    expect(mockDb.companyAudit[mockDb.companyAudit.length - 1]).toMatchObject({ action: 'companies-scanned', detail: { added: 0 } })
  })
  it('answers 503 company-root-unavailable with the path when the root is missing', async () => {
    mockControl.companyRootMissing = true
    const res = await call('/companies/scan', { method: 'POST' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'company-root-unavailable', detail: expect.stringContaining('Quickbook - Accounting File') })
  })
})

describe('POST /companies/{id}/check', () => {
  it('approves 440 and records company-checked', async () => {
    const res = await call('/companies/2/check', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Company
    expect(body).toMatchObject({ id: 2, access: 'approved', rowVersion: 2 })
    expect(body.accessCheckedUtc).not.toBeNull()
    expect(mockDb.companyAudit[mockDb.companyAudit.length - 1]).toMatchObject({
      action: 'company-checked', companyId: 2, detail: { companyId: 2, access: 'approved' },
    })
    // The API's detail has no company reference (M17 5.1).
    expect(mockDb.companyAudit[mockDb.companyAudit.length - 1].detail).not.toHaveProperty('company')
  })
  it('answers 409 company-file-open-elsewhere naming both files and changes nothing', async () => {
    mockControl.companyOpenElsewhere = 'S & A Convenience Market LLC.qbw'
    const res = await call('/companies/1/check', { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'company-file-open-elsewhere', openFile: 'S & A Convenience Market LLC.qbw', neededFile: 'Takoma Park Grocery Store Inc.qbw' })
    expect(mockDb.companies[0].rowVersion).toBe(1)
  })
  it('answers 503 quickbooks-not-open when QuickBooks is closed', async () => {
    mockControl.qbNotOpen = true
    const res = await call('/companies/2/check', { method: 'POST' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'quickbooks-not-open' })
    expect(mockDb.companies[1].access).toBe('needs-approval')
  })
  it('answers 409 company-not-ready for an ambiguous company and 404 for an unknown one', async () => {
    const res = await call('/companies/3/check', { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'company-not-ready', state: 'ambiguous', access: 'unchecked' })
    expect((await call('/companies/99/check', { method: 'POST' })).status).toBe(404)
  })
  it('a missing company has no file to open: 409 company-not-ready, nothing changed', async () => {
    const res = await call('/companies/4/check', { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'company-not-ready', state: 'missing', access: 'file-not-found' })
    expect(mockDb.companies[3].rowVersion).toBe(1)
  })
  it('an active company whose file is gone from disk records file-not-found without a session', async () => {
    mockControl.companyFileGone = true
    mockControl.qbNotOpen = true
    const body = (await (await call('/companies/2/check', { method: 'POST' })).json()) as Company
    expect(body).toMatchObject({ id: 2, access: 'file-not-found', rowVersion: 2 })
  })
  it('answers 503 company-file-unavailable naming the file, and changes nothing', async () => {
    mockControl.companyFileUnavailable = true
    const res = await call('/companies/2/check', { method: 'POST' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'company-file-unavailable', neededFile: 'S & A Convenience Market LLC.qbw' })
    expect(mockDb.companies[1].rowVersion).toBe(1)
  })
  it('answers 412 edited-by-someone-else with the current rowVersion when the file changed during the check', async () => {
    mockControl.companyChangedDuringCheck = true
    const res = await call('/companies/2/check', { method: 'POST' })
    expect(res.status).toBe(412)
    expect(await res.json()).toMatchObject({ code: 'edited-by-someone-else', rowVersion: 1 })
    expect(mockDb.companies[1].access).toBe('needs-approval')
    expect(mockDb.companyAudit).toHaveLength(0)
  })
  it('refuses a company with no file before looking at QuickBooks (the API order)', async () => {
    mockControl.qbNotOpen = true
    expect((await call('/companies/3/check', { method: 'POST' })).status).toBe(409)
  })
})

describe('PATCH /companies/{id}', () => {
  it('needs If-Match (428), refuses a stale one (412), saves matchNames with the current one', async () => {
    expect((await patch(2, { matchNames: ['S&A'] })).status).toBe(428)
    expect((await patch(2, { matchNames: ['S&A'] }, '5')).status).toBe(412)
    const res = await patch(2, { matchNames: ['S&A', 'SA Market'] }, '1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ matchNames: ['S&A', 'SA Market'], rowVersion: 2 })
    expect(mockDb.companyAudit[mockDb.companyAudit.length - 1]).toMatchObject({ action: 'company-updated', detail: { companyId: 2, matchNames: ['S&A', 'SA Market'] } })
  })
  it('choosing one of the candidate files makes the ambiguous company active; another path is 400', async () => {
    const bad = await patch(3, { filePath: 'Other.qbw' }, '1')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ code: 'invalid-request' })
    const res = await patch(3, { filePath: 'Sunrise Liquors 2024.qbw' }, '1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ state: 'active', fileName: 'Sunrise Liquors 2024.qbw', candidateFiles: [], rowVersion: 2 })
  })
  it('re-enabling a missing company returns it to missing, not active', async () => {
    expect(await (await patch(4, { disabled: true }, '1')).json()).toMatchObject({ state: 'disabled' })
    expect(await (await patch(4, { disabled: false }, '2')).json()).toMatchObject({ state: 'missing' })
  })
  it('rejects a non-array matchNames and an empty body with 400, changing and auditing nothing', async () => {
    expect((await patch(2, { matchNames: 'x' }, '1')).status).toBe(400)
    const res = await patch(2, {}, '1')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'invalid-request' })
    expect(mockDb.companies[1].rowVersion).toBe(1)
    expect(mockDb.companyAudit).toHaveLength(0)
  })
  it('disabled true disables and false re-enables', async () => {
    expect(await (await patch(2, { disabled: true }, '1')).json()).toMatchObject({ state: 'disabled' })
    expect(await (await patch(2, { disabled: false }, '2')).json()).toMatchObject({ state: 'active' })
  })
})
