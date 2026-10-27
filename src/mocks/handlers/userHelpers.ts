import type { Actor, User } from '@/api/schema'
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
    lastLoginUtc: u.lastLoginUtc,
    rowVersion: u.rowVersion,
  }
}

export function addUserAudit(userId: string, kind: string, actor: Actor, detail: Record<string, unknown> | null) {
  const rows = (mockDb.userAudit[userId] ??= [])
  rows.push({ id: mockDb.counters.audit++, kind, actor, detail, atUtc: nowUtc() })
}

export function newTemporaryPassword(): string {
  return `Temp-${String(mockDb.counters.password++).padStart(4, '0')}-xK9mQ2vL`
}
