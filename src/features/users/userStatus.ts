import type { Role, User, UserStatus } from '@/api/schema'
import { formatTimestamp } from '@/lib/dates'

export function isLocked(u: User, now: number = Date.now()): boolean {
  return u.lockedOutUntilUtc !== null && new Date(u.lockedOutUntilUtc).getTime() > now
}

/** Disabled wins over locked, which wins over must-change-password. */
export function userStatusOf(u: User, now: number = Date.now()): UserStatus {
  if (u.disabled) return 'disabled'
  if (isLocked(u, now)) return 'locked'
  return u.mustChangePassword ? 'must-change-password' : 'active'
}

export const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Active',
  'must-change-password': 'Must set password',
  locked: 'Locked out',
  disabled: 'Disabled',
}

export const STATUSES = ['active', 'must-change-password', 'locked', 'disabled'] as const satisfies readonly UserStatus[]

/** Tooltip text of a status badge. */
export function statusTitle(u: User): string {
  return u.lockedOutUntilUtc && userStatusOf(u) === 'locked'
    ? `Locked until ${formatTimestamp(u.lockedOutUntilUtc)}`
    : STATUS_LABEL[userStatusOf(u)]
}

export const ROLES = ['admin', 'editor', 'viewer'] as const

export const ROLE_HELP: Record<Role, string> = {
  admin: 'Admins manage users and can resolve posts.',
  editor: 'Editors can fix and post statements.',
  viewer: 'Viewers can only look.',
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const selectClass = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs dark:bg-input/30'
