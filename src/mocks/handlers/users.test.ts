import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import type { Page, QbLists, User } from '@/api/schema'

const API = '/api/v2'
let token = ''
const call = (path: string, init: RequestInit = {}, as = token) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${as}`, 'Content-Type': 'application/json', ...init.headers },
  })

beforeEach(() => {
  token = mockControl.signInAs('u-admin')
})

describe('users', () => {
  it('is admin only', async () => {
    const editor = mockControl.signInAs('u-editor')
    expect((await call('/users', {}, editor)).status).toBe(403)
  })

  it('lists, creates with a one-time password, and rejects duplicate emails', async () => {
    const page = (await (await call('/users?role=editor')).json()) as Page<User>
    expect(page.items.every((u) => u.role === 'editor')).toBe(true)
    const body = JSON.stringify({ email: 'new@example.com', displayName: 'New', role: 'viewer' })
    const created = await call('/users', { method: 'POST', body })
    expect(created.status).toBe(201)
    expect(((await created.json()) as { temporaryPassword: string }).temporaryPassword.length).toBeGreaterThanOrEqual(12)
    expect((await call('/users', { method: 'POST', body })).status).toBe(409)
  })

  it('requires If-Match on PATCH and protects the last admin', async () => {
    expect((await call('/users/u-editor', { method: 'PATCH', body: '{"role":"viewer"}' })).status).toBe(428)
    expect((await call('/users/u-editor', { method: 'PATCH', headers: { 'If-Match': '"9"' }, body: '{"role":"viewer"}' })).status).toBe(412)
    const res = await call('/users/u-admin', { method: 'PATCH', headers: { 'If-Match': '"1"' }, body: '{"role":"editor"}' })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('last-admin')
    const ok = await call('/users/u-editor', { method: 'PATCH', headers: { 'If-Match': '"1"' }, body: '{"role":"viewer"}' })
    expect(ok.headers.get('ETag')).toBe('"2"')
    const audit = (await (await call('/users/u-editor/audit')).json()) as { kind: string }[]
    expect(audit[0].kind).toBe('role-changed')
  })

  it('unlocks and resets passwords', async () => {
    const unlocked = (await (await call('/users/u-locked/unlock', { method: 'POST' })).json()) as User
    expect(unlocked.lockedOutUntilUtc).toBeNull()
    const reset = (await (await call('/users/u-editor/reset-password', { method: 'POST' })).json()) as { temporaryPassword: string }
    expect(reset.temporaryPassword).toBeTruthy()
    expect(mockDb.users.find((u) => u.id === 'u-editor')!.mustChangePassword).toBe(true)
  })
})

describe('support routes and mock control', () => {
  it('serves QuickBooks lists to every role and the database health light', async () => {
    const viewer = mockControl.signInAs('u-viewer')
    const lists = (await (await call('/quickbooks/lists', {}, viewer)).json()) as QbLists
    expect(lists.vendors.length).toBeGreaterThan(0)
    expect((await call('/health/database', {}, viewer)).status).toBe(200)
    mockControl.databaseDown = true
    expect((await call('/health/database', {}, viewer)).status).toBe(503)
    expect((await call('/saved-requests', {}, viewer)).status).toBe(503)
  })

  it('reset clears pending timers', () => {
    vi.useFakeTimers()
    void mockControl.sleep(5000)
    expect(vi.getTimerCount()).toBe(1)
    mockDb.reset()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})
