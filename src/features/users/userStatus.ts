import type { User } from '@/api/schema'
import { formatTimestamp } from '@/lib/dates'

export function isLocked(u: User, now: number = Date.now()): boolean {
  return u.lockedOutUntilUtc !== null && new Date(u.lockedOutUntilUtc).getTime() > now
}

export function statusText(u: User): string {
  if (u.disabled) return 'Disabled'
  if (isLocked(u) && u.lockedOutUntilUtc) return `Locked until ${formatTimestamp(u.lockedOutUntilUtc)}`
  return 'Active'
}

export const ROLES = ['admin', 'editor', 'viewer'] as const

export const selectClass = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs dark:bg-input/30'
