import { beforeEach, describe, expect, it } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import type { Page, User } from '@/api/schema'

const API = '/api/v2'
let token = ''
const call = (path: string) => fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
const list = async (qs: string) => (await (await call(`/users?${qs}`)).json()) as Page<User>

beforeEach(() => {
  token = mockControl.signInAs('u-admin')
})

describe('GET /users status filter (R-9)', () => {
  it('GET /users?status=locked returns only locked users; rows carry lockedOutUntilUtc and mustChangePassword', async () => {
    const page = await list('status=locked')
    expect(page.items.map((u) => u.id)).toEqual(['u-locked'])
    expect(page.items[0].lockedOutUntilUtc).toBe('2099-01-01T00:00:00Z')
    expect(page.items[0].mustChangePassword).toBe(false)
    for (const u of (await list('')).items) {
      expect(u).toHaveProperty('lockedOutUntilUtc')
      expect(typeof u.mustChangePassword).toBe('boolean')
    }
  })

  it('repeats status, derives disabled and must-change-password, and an expired lock is active', async () => {
    mockDb.users.find((u) => u.id === 'u-viewer')!.mustChangePassword = true
    mockDb.users.find((u) => u.id === 'u-editor')!.lockedOutUntilUtc = '2000-01-01T00:00:00Z'
    expect((await list('status=disabled&status=must-change-password')).items.map((u) => u.id).sort()).toEqual(['u-disabled', 'u-viewer'])
    expect((await list('status=active')).items.map((u) => u.id).sort()).toEqual(['u-admin', 'u-editor'])
  })

  it('rejects an unknown status with 400', async () => {
    expect((await call('/users?status=bogus')).status).toBe(400)
  })
})
