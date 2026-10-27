import type { Role } from '@/api/schema'

export const MOCK_PASSWORD = 'correct horse battery'

export interface MockUser {
  id: string
  email: string
  displayName: string
  role: Role
  disabled: boolean
  lockedOutUntilUtc: string | null
  lastLoginUtc: string | null
  rowVersion: number
  mustChangePassword: boolean
  password: string
}

const base = { password: MOCK_PASSWORD, mustChangePassword: false, disabled: false, lockedOutUntilUtc: null, rowVersion: 1 }

export function buildUsers(): MockUser[] {
  return [
    { ...base, id: 'u-admin', email: 'asha@example.com', displayName: 'Asha K', role: 'admin', lastLoginUtc: '2026-10-27T06:55:00Z' },
    { ...base, id: 'u-editor', email: 'eli@example.com', displayName: 'Eli Editor', role: 'editor', lastLoginUtc: '2026-10-26T14:02:00Z' },
    { ...base, id: 'u-viewer', email: 'vera@example.com', displayName: 'Vera Viewer', role: 'viewer', lastLoginUtc: null },
    { ...base, id: 'u-disabled', email: 'dan@example.com', displayName: 'Dan Disabled', role: 'editor', disabled: true, lastLoginUtc: '2026-09-01T09:00:00Z' },
    { ...base, id: 'u-locked', email: 'lena@example.com', displayName: 'Lena Locked', role: 'editor', lockedOutUntilUtc: '2099-01-01T00:00:00Z', lastLoginUtc: '2026-10-20T08:30:00Z' },
  ]
}
