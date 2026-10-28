import { useState } from 'react'
import { ArrowLeftIcon, CircleAlertIcon, HistoryIcon, Loader2Icon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { usePatchUser, useResetPassword, useUnlock, useUser, type UserWithEtag } from '@/api/queries/users'
import { ApiError, problemCode } from '@/api/problem'
import type { Role } from '@/api/schema'
import { useAuditEvents } from '@/api/queries/audit'
import { useSession } from '@/auth/useSession'
import { DataPanel, EmptyState, TableSkeleton } from '@/components/DataPanel'
import { ProblemAlert } from '@/components/ProblemAlert'
import { SettingsSection } from '@/components/SettingsSection'
import { Timestamp } from '@/components/Timestamp'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { AuditTable } from '@/features/audit/AuditTable'
import { useBreadcrumb } from '@/layout/useBreadcrumb'
import { OneTimePasswordDialog } from './OneTimePasswordDialog'
import { UserStatusBadge } from './UserStatusBadge'
import { initials, isLocked, ROLES } from './userStatus'

export function UserPage() {
  const { id = '' } = useParams()
  const q = useUser(id)
  useBreadcrumb(q.data?.user.displayName ?? '')
  // Held here, not in the keyed detail: a reset bumps the row version and remounts the detail.
  const [password, setPassword] = useState<string | null>(null)
  return (
    <div className="page max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link to="/users">
          <ArrowLeftIcon aria-hidden />
          Back to Users
        </Link>
      </Button>
      {q.error && <ProblemAlert error={q.error} />}
      {q.isPending && (
        <div role="status" aria-label="Loading user" className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="grid gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      )}
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
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">
          <span>This user changed since you opened it. Reload.</span>
          <Button size="sm" variant="outline" onClick={onReload}>
            Reload
          </Button>
        </div>
      )
    }
    if (status === 409 && problemCode(error.problem) === 'last-admin') {
      return (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
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
      <header className="flex flex-wrap items-center gap-4">
        <Avatar className="size-12">
          <AvatarFallback className="bg-primary-soft text-base font-semibold text-primary">{initials(user.displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.015em] break-words">{user.displayName}</h1>
          <p className="text-sm break-all text-muted-foreground">{user.email}</p>
        </div>
      </header>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <dt className="text-muted-foreground">Status:</dt>
          <dd>
            <UserStatusBadge user={user} />
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-muted-foreground">Last login:</dt>
          <dd className="tabular-nums">{user.lastLoginUtc ? <Timestamp utc={user.lastLoginUtc} /> : '—'}</dd>
        </div>
      </dl>

      <div className="rounded-lg border bg-card px-5 py-7 sm:px-7">
        <SettingsSection title="Permissions" description="What this person can see and change.">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="user-role-edit">Role</Label>
              <NativeSelect id="user-role-edit" wrapperClassName="w-44" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
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
        </SettingsSection>

        <SettingsSection title="Profile" description="The name shown in the sidebar and the audit trail.">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="user-name-edit">Display name</Label>
              <Input id="user-name-edit" className="w-full sm:w-72" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
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
        </SettingsSection>
        {patch.error && (
          <div className="pb-6">
            <MutationError error={patch.error} onReload={onReload} />
          </div>
        )}

        <SettingsSection title="Sign-in" description="A reset shows a temporary password once. Disabling signs them out.">
          <div className="flex flex-wrap gap-2">
            {!isSelf && (
              <Button
                variant="outline"
                className={user.disabled ? undefined : 'text-destructive hover:bg-destructive-soft hover:text-destructive'}
                onClick={() => setConfirmToggle(true)}
              >
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
          {(reset.error || unlock.error) && (
            <div className="mt-3 grid gap-2">
              {reset.error && <ProblemAlert error={reset.error} />}
              {unlock.error && <ProblemAlert error={unlock.error} />}
            </div>
          )}
        </SettingsSection>
      </div>

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
              variant={user.disabled ? 'default' : 'destructive'}
              disabled={patch.isPending}
              onClick={() => patch.mutate({ patch: { disabled: !user.disabled }, etag }, { onSettled: () => setConfirmToggle(false) })}
            >
              {patch.isPending && <Loader2Icon className="animate-spin" aria-hidden />}
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
    <section aria-labelledby="activity-heading" className="grid gap-3">
      <div>
        <h2 id="activity-heading" className="text-[15px] font-semibold">
          Activity
        </h2>
        <p className="text-sm text-muted-foreground">Their latest 50 audit entries.</p>
      </div>
      {events.error && <ProblemAlert error={events.error} />}
      <DataPanel>
        {!events.data && !events.error ? (
          <TableSkeleton columns={6} rows={4} />
        ) : events.data?.items.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="No activity yet." />
        ) : (
          events.data && <AuditTable events={events.data.items} />
        )}
      </DataPanel>
    </section>
  )
}
