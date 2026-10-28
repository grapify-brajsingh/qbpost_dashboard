import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { usePatchUser, useResetPassword, useUnlock, useUser, type UserWithEtag } from '@/api/queries/users'
import { ApiError, problemCode } from '@/api/problem'
import type { Role } from '@/api/schema'
import { useAuditEvents } from '@/api/queries/audit'
import { useSession } from '@/auth/useSession'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuditTable } from '@/features/audit/AuditTable'
import { OneTimePasswordDialog } from './OneTimePasswordDialog'
import { UserStatusBadge } from './UserStatusBadge'
import { isLocked, ROLES, selectClass } from './userStatus'

export function UserPage() {
  const { id = '' } = useParams()
  const q = useUser(id)
  // Held here, not in the keyed detail: a reset bumps the row version and remounts the detail.
  const [password, setPassword] = useState<string | null>(null)
  return (
    <div className="space-y-4 p-6">
      <Link className="underline" to="/users">
        Back to Users
      </Link>
      {q.error && <ProblemAlert error={q.error} />}
      {q.data && <UserDetail key={`${q.data.user.id}:${q.data.user.rowVersion}`} data={q.data} onReload={() => void q.refetch()} onPassword={setPassword} />}
      {password !== null && <OneTimePasswordDialog password={password} onClose={() => setPassword(null)} />}
    </div>
  )
}

function MutationError({ error, onReload }: { error: unknown; onReload: () => void }) {
  if (error instanceof ApiError) {
    const { status } = error.problem
    if (status === 412) {
      return (
        <div role="alert" className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <span>This user changed since you opened it. Reload.</span>
          <Button size="sm" variant="outline" onClick={onReload}>
            Reload
          </Button>
        </div>
      )
    }
    if (status === 409 && problemCode(error.problem) === 'last-admin') {
      return (
        <p role="alert" className="text-sm text-destructive">
          There must be at least one active admin.
        </p>
      )
    }
  }
  return <ProblemAlert error={error} />
}

function UserDetail({
  data: { user, etag },
  onReload,
  onPassword,
}: {
  data: UserWithEtag
  onReload: () => void
  onPassword: (p: string) => void
}) {
  const { me } = useSession()
  const patch = usePatchUser(user.id)
  const reset = useResetPassword(user.id)
  const unlock = useUnlock(user.id)
  const [role, setRole] = useState<Role>(user.role)
  const [displayName, setDisplayName] = useState(user.displayName)
  const [confirmToggle, setConfirmToggle] = useState(false)
  const isSelf = me?.id === user.id

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">{user.displayName}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <p className="flex items-center gap-2 text-sm">
          Status: <UserStatusBadge user={user} />
        </p>
        <p className="text-sm">Last login: {user.lastLoginUtc ? <Timestamp utc={user.lastLoginUtc} /> : '—'}</p>
      </div>

      <div className="flex items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="user-role-edit">Role</Label>
          <select id="user-role-edit" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="outline"
          aria-label="Save role"
          disabled={role === user.role || patch.isPending}
          onClick={() => patch.mutate({ patch: { role }, etag })}
        >
          Save
        </Button>
      </div>

      <div className="flex items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="user-name-edit">Display name</Label>
          <Input id="user-name-edit" className="w-72" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <Button
          variant="outline"
          aria-label="Save display name"
          disabled={displayName.trim() === '' || displayName.trim() === user.displayName || patch.isPending}
          onClick={() => patch.mutate({ patch: { displayName: displayName.trim() }, etag })}
        >
          Save
        </Button>
      </div>
      {patch.error && <MutationError error={patch.error} onReload={onReload} />}

      <div className="flex flex-wrap gap-2">
        {!isSelf && (
          <Button variant="outline" onClick={() => setConfirmToggle(true)}>
            {user.disabled ? 'Enable' : 'Disable'}
          </Button>
        )}
        <Button variant="outline" disabled={reset.isPending} onClick={() => reset.mutate({ onPassword })}>
          Reset password
        </Button>
        {isLocked(user) && (
          <Button
            variant="outline"
            disabled={unlock.isPending}
            onClick={() => unlock.mutate(undefined, { onSuccess: () => toast.success('User unlocked') })}
          >
            Unlock
          </Button>
        )}
      </div>
      {reset.error && <ProblemAlert error={reset.error} />}
      {unlock.error && <ProblemAlert error={unlock.error} />}

      <Dialog open={confirmToggle} onOpenChange={setConfirmToggle}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{user.disabled ? 'Enable this user?' : 'Disable this user?'}</DialogTitle>
            <DialogDescription>
              {user.disabled ? 'They will be able to sign in again.' : 'They will be signed out and cannot sign in until enabled.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmToggle(false)}>
              Cancel
            </Button>
            <Button
              disabled={patch.isPending}
              onClick={() => patch.mutate({ patch: { disabled: !user.disabled }, etag }, { onSettled: () => setConfirmToggle(false) })}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActivityList id={user.id} />
    </>
  )
}

function ActivityList({ id }: { id: string }) {
  const events = useAuditEvents({ actor: id, pageSize: 50 })
  return (
    <section aria-labelledby="activity-heading" className="space-y-2">
      <h2 id="activity-heading" className="text-lg font-semibold">
        Activity
      </h2>
      {events.error && <ProblemAlert error={events.error} />}
      {events.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
      {events.data && events.data.items.length > 0 && <AuditTable events={events.data.items} />}
    </section>
  )
}
