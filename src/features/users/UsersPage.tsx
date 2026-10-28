import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useUsers, type UsersParams } from '@/api/queries/users'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CreateUserDialog } from './CreateUserDialog'
import { OneTimePasswordDialog } from './OneTimePasswordDialog'
import { ROLES, selectClass, statusText } from './userStatus'

const DEBOUNCE_MS = 300

export function UsersPage() {
  const [search, setSearch] = useSearchParams()
  const q = search.get('q') ?? ''
  const role = ROLES.find((r) => r === search.get('role'))
  const showDisabled = search.get('showDisabled') === 'true'
  const pageNo = Math.max(1, Number(search.get('page')) || 1)

  const update = (patch: Record<string, string>, opts: { keepPage?: boolean } = {}) =>
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!opts.keepPage) next.delete('page')
        for (const [k, v] of Object.entries(patch)) {
          if (v === '' || (k === 'page' && v === '1')) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  // The search box is local state, written to the URL 300 ms after the last keystroke.
  const [qInput, setQInput] = useState(q)
  useEffect(() => setQInput((cur) => (cur.trim() === q ? cur : q)), [q])
  useEffect(() => {
    if (qInput.trim() === q) return
    const t = setTimeout(() => update({ q: qInput.trim() }), DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a keystroke should (re)start the timer
  }, [qInput])

  const params: UsersParams = {
    q: q || undefined,
    role,
    disabled: showDisabled ? undefined : false,
    page: pageNo,
  }
  const list = useUsers(params)
  const [creating, setCreating] = useState(false)
  const [password, setPassword] = useState<string | null>(null)

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / (list.data?.pageSize ?? 25)))

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <Button onClick={() => setCreating(true)}>Create user</Button>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label htmlFor="user-search">Search</Label>
          <Input
            id="user-search"
            type="search"
            className="w-72"
            placeholder="Name or email"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="user-role">Role</Label>
          <select id="user-role" className={selectClass} value={role ?? ''} onChange={(e) => update({ role: e.target.value })}>
            <option value="">Any</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex h-9 items-center gap-2">
          <Checkbox
            id="user-show-disabled"
            checked={showDisabled}
            onCheckedChange={(c) => update({ showDisabled: c === true ? 'true' : '' })}
          />
          <Label htmlFor="user-show-disabled">Show disabled</Label>
        </div>
      </div>
      {list.error && <ProblemAlert error={list.error} />}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last login</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data?.items.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <Link className="underline" to={`/users/${u.id}`}>
                  {u.displayName}
                </Link>
              </TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{statusText(u)}</TableCell>
              <TableCell>{u.lastLoginUtc ? <Timestamp utc={u.lastLoginUtc} /> : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {list.data && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span>
            Page {list.data.page} of {pages} · {total} total
          </span>
          <Button variant="outline" size="sm" disabled={pageNo <= 1} onClick={() => update({ page: String(pageNo - 1) }, { keepPage: true })}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={pageNo >= pages} onClick={() => update({ page: String(pageNo + 1) }, { keepPage: true })}>
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
