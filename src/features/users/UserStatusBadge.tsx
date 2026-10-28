import type { User, UserStatus } from '@/api/schema'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, statusTitle, userStatusOf } from './userStatus'

const TONE: Record<UserStatus, string> = {
  active: 'bg-success-soft text-success',
  'must-change-password': 'bg-warning-soft text-warning',
  locked: 'bg-destructive-soft text-destructive',
  disabled: 'bg-muted text-muted-foreground',
}

export function UserStatusBadge({ user }: { user: User }) {
  const status = userStatusOf(user)
  return (
    <Badge title={statusTitle(user)} className={cn(TONE[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
