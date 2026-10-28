import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { usePatchUser, useResetPassword, useUnlock, useUsers, type UsersParams } from '@/api/queries/users'
import type { User } from '@/api/schema'
import { ClearFilters, FilterChip, SearchBox, useUrlFilters } from '@/components/filters'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CreateUserDialog } from './CreateUserDialog'
import { OneTimePasswordDialog } from './OneTimePasswordDialog'
import { UserStatusBadge } from './UserStatusBadge'
import { initials, ROLES, STATUS_LABEL, STATUSES, userStatusOf } from './userStatus'

// Module level: useUrlFilters memoises on the spec's identity.
const FILTER_SPEC = {
  q: { kind: 'text' },
  role: { kind: 'enum', values: ROLES },
  status: { kind: 'enumList', values: STATUSES },
} as const

export function UsersPage() {
  const filters = useUrlFilters(FILTER_SPEC)
  const [search, setSearch] = useSearchParams()
  const f = filters.values
  const pageNo = Math.max(1, Math.floor(Number(search.get('page'))) || 1)

  const params: UsersParams = { q: f.q, role: f.role, status: f.status, page: pageNo }
  const list = useUsers(params)
  const [creating, setCreating] = useState(false)
  const [password, setPassword] = useState<string | null>(null)
  const [actionError, setActionError] = useState<unknown>(null)

  const setPage = (n: number) =>
    setSearch((prev) => {
      const next = new URLSearchParams(prev)
      if (n <= 1) next.delete('page')
      else next.set('page', String(n))
      return next
    })

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / (list.data?.pageSize ?? 25)))
  const status = f.status ?? []

  return (
    <div className="grid gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Who can sign in, and what they can do.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon aria-hidden />
          New user
        </Button>
      </div>

      <div role="search" aria-label="Filters" className="flex flex-wrap items-center gap-2">
        <SearchBox value={f.q} onChange={(v) => filters.set({ q: v.trim() || undefined })} label="Search" placeholder="Search name or email" />
        <FilterChip
          label="Role"
          value={f.role}
          options={ROLES.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))}
          onChange={(v) => filters.set({ role: v as (typeof ROLES)[number] | undefined })}
        />
        <FilterChip
          label="Status"
          value={status.length ? status.map((s) => STATUS_LABEL[s]).join(', ') : undefined}
          onChange={() => filters.set({ status: undefined })}
        >
          <ul aria-label="Statuses" className="p-2">
            {STATUSES.map((s) => (
              <li key={s} className="flex items-center gap-2 py-1">
                <Checkbox
                  id={`status-${s}`}
                  checked={status.includes(s)}
                  onCheckedChange={(on) => {
                    const next = on === true ? [...status, s] : status.filter((x) => x !== s)
                    filters.set({ status: next.length ? next : undefined })
                  }}
                />
                <Label htmlFor={`status-${s}`} className="font-normal">
                  {STATUS_LABEL[s]}
                </Label>
              </li>
            ))}
          </ul>
        </FilterChip>
        <ClearFilters onClear={filters.clear} disabled={filters.activeCount === 0} />
      </div>

      {list.error && <ProblemAlert error={list.error} />}
      {actionError !== null && <ProblemAlert error={actionError} />}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last login</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data?.items.map((u) => (
            <UserRow key={`${u.id}:${u.rowVersion}`} user={u} onPassword={setPassword} onError={setActionError} />
          ))}
        </TableBody>
      </Table>
      {list.data && list.data.items.length === 0 && <p className="py-6 text-center text-muted-foreground">No users match.</p>}
      {list.data && total > 0 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {list.data.page} of {pages} · {total} total
          </span>
          <Button variant="outline" size="sm" disabled={pageNo <= 1} onClick={() => setPage(pageNo - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={pageNo >= pages} onClick={() => setPage(pageNo + 1)}>
            Next
          </Button>
        </div>
      )}
      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(p) => {
          setCreating(false)
          setPassword(p)
        }}
      />
      {password !== null && <OneTimePasswordDialog password={password} onClose={() => setPassword(null)} />}
    </div>
  )
}

function UserRow({ user: u, onPassword, onError }: { user: User; onPassword: (p: string) => void; onError: (e: unknown) => void }) {
  const reset = useResetPassword(u.id)
  const unlock = useUnlock(u.id)
  const patch = usePatchUser(u.id)
  const status = userStatusOf(u)
  const busy = reset.isPending || unlock.isPending || patch.isPending
  return (
    <TableRow>
      <TableCell>
        <Link to={`/users/${u.id}`} className="inline-flex items-center gap-3" aria-label={u.displayName}>
          <Avatar>
            <AvatarFallback className="bg-primary-soft text-xs text-primary">{initials(u.displayName)}</AvatarFallback>
          </Avatar>
          <span className="grid text-left leading-tight">
            <span className="font-medium">{u.displayName}</span>
            <span className="text-xs text-muted-foreground">{u.email}</span>
          </span>
        </Link>
      </TableCell>
      <TableCell className="capitalize">{u.role}</TableCell>
      <TableCell>
        <UserStatusBadge user={u} />
      </TableCell>
      <TableCell className="tabular-nums">{u.lastLoginUtc ? <Timestamp utc={u.lastLoginUtc} /> : '—'}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Reset password for ${u.displayName}`}
            onClick={() => {
              onError(null)
              reset.mutate({ onPassword }, { onError })
            }}
          >
            Reset password
          </Button>
          {status === 'locked' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              aria-label={`Unlock ${u.displayName}`}
              onClick={() => {
                onError(null)
                unlock.mutate(undefined, { onSuccess: () => toast.success('User unlocked'), onError })
              }}
            >
              Unlock
            </Button>
          )}
          {status === 'disabled' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              aria-label={`Enable ${u.displayName}`}
              onClick={() => {
                onError(null)
                // The version the admin saw in this list is the one the change is checked against.
                patch.mutate({ patch: { disabled: false }, etag: `"${u.rowVersion}"` }, { onError })
              }}
            >
              Enable
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/users/${u.id}`} aria-label={`Edit ${u.displayName}`}>
              Edit
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
