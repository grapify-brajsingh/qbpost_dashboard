import { useState } from 'react'
import { useCreateUser } from '@/api/queries/users'
import { ApiError, problemCode } from '@/api/problem'
import type { Role } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROLES, selectClass } from './userStatus'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the one-time password after the user is created. */
  onCreated: (temporaryPassword: string) => void
}

export function CreateUserDialog({ open, onOpenChange, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Body onCancel={() => onOpenChange(false)} onCreated={onCreated} />}</DialogContent>
    </Dialog>
  )
}

function Body({ onCancel, onCreated }: { onCancel: () => void; onCreated: (p: string) => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const create = useCreateUser()
  const exists =
    create.error instanceof ApiError &&
    create.error.problem.status === 409 &&
    problemCode(create.error.problem) === 'email-exists'
  const valid = email.includes('@') && displayName.trim() !== ''
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid || create.isPending) return
        create.mutate({ input: { email: email.trim(), displayName: displayName.trim(), role }, onPassword: onCreated })
      }}
    >
      <DialogHeader>
        <DialogTitle>Create user</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1">
        <Label htmlFor="new-user-email">Email</Label>
        <Input id="new-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="new-user-name">Display name</Label>
        <Input id="new-user-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="new-user-role">Role</Label>
        <select id="new-user-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {exists ? (
        <p role="alert" className="text-sm text-destructive">
          That email already exists.
        </p>
      ) : (
        create.error && <ProblemAlert error={create.error} />
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || create.isPending}>
          Create
        </Button>
      </DialogFooter>
    </form>
  )
}
