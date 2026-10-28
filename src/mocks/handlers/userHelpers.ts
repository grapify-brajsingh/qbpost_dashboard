import type { Actor, User, UserStatus } from '@/api/schema'
import { mockDb } from '../db'
import type { MockUser } from '../fixtures/users'
import { nowUtc } from './common'

export function toUser(u: MockUser): User {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    disabled: u.disabled,
    lockedOutUntilUtc: u.lockedOutUntilUtc,
    mustChangePassword: u.mustChangePassword,
    lastLoginUtc: u.lastLoginUtc,
    rowVersion: u.rowVersion,
  }
}

/** Disabled wins over locked, which wins over must-change-password; an expired lock no longer counts. */
export function userStatusOf(u: MockUser): UserStatus {
  if (u.disabled) return 'disabled'
  if (u.lockedOutUntilUtc !== null && u.lockedOutUntilUtc > nowUtc()) return 'locked'
  return u.mustChangePassword ? 'must-change-password' : 'active'
}

export function addUserAudit(userId: string, kind: string, actor: Actor, detail: Record<string, unknown> | null) {
  const rows = (mockDb.userAudit[userId] ??= [])
  rows.push({ id: mockDb.counters.audit++, kind, actor, detail, atUtc: nowUtc() })
}

export function newTemporaryPassword(): string {
  return `Temp-${String(mockDb.counters.password++).padStart(4, '0')}-xK9mQ2vL`
}
