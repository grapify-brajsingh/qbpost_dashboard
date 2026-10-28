import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { changePassword } from '@/api/queries/auth'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { safeNext, useSession } from './useSession'

const MIN_PASSWORD_LENGTH = 12

export function ChangePasswordPage() {
  const { me, refetchMe } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ next?: string; confirm?: string }>({})

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: async () => {
      await refetchMe()
      void navigate(safeNext(params.get('next')) ?? '/requests', { replace: true })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errors: { next?: string; confirm?: string } = {}
    if (next.length < MIN_PASSWORD_LENGTH) errors.next = `At least ${MIN_PASSWORD_LENGTH} characters`
    else if (confirm !== next) errors.confirm = "Passwords don't match"
    setFieldErrors(errors)
    if (errors.next || errors.confirm) return
    mutation.mutate()
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Change password</h1>
        {me?.mustChangePassword && (
          <p className="text-sm text-muted-foreground">You must change your password before you can continue.</p>
        )}
        <div className="space-y-2">
          <Label htmlFor="current">Current password</Label>
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new">New password</Label>
          <Input
            id="new"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          {fieldErrors.next && <p className="text-sm text-destructive">{fieldErrors.next}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {fieldErrors.confirm && <p className="text-sm text-destructive">{fieldErrors.confirm}</p>}
        </div>
        {mutation.isError && <ProblemAlert error={mutation.error} />}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          Change password
        </Button>
      </form>
    </main>
  )
}
