import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { changePassword } from '@/api/queries/auth'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthFrame } from './AuthFrame'
import { safeNext, useSession } from './useSession'

const MIN_PASSWORD_LENGTH = 12

/** The change-password fields and submit button; `onChanged` runs after the server accepted the new password. */
export function ChangePasswordForm({ onChanged }: { onChanged(): void }) {
  const { refetchMe } = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ next?: string; confirm?: string }>({})

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: async () => {
      await refetchMe()
      setCurrent('')
      setNext('')
      setConfirm('')
      onChanged()
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
    <form onSubmit={onSubmit} className="grid w-full gap-5">
      <div className="grid gap-2">
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
      <div className="grid gap-2">
        <Label htmlFor="new">New password</Label>
        <Input
          id="new"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-invalid={fieldErrors.next ? true : undefined}
          aria-describedby="new-help"
        />
        {fieldErrors.next ? (
          <p id="new-help" className="text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-150">
            {fieldErrors.next}
          </p>
        ) : (
          <p id="new-help" className="text-xs text-muted-foreground">
            Use {MIN_PASSWORD_LENGTH} or more characters. A short phrase works well.
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={fieldErrors.confirm ? true : undefined}
          aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined}
        />
        {fieldErrors.confirm && (
          <p id="confirm-error" className="text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-150">
            {fieldErrors.confirm}
          </p>
        )}
      </div>
      {mutation.isError && <ProblemAlert error={mutation.error} />}
      <Button type="submit" className="w-full sm:w-fit" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2Icon className="animate-spin" aria-hidden />}
        Change password
      </Button>
    </form>
  )
}

export function ChangePasswordPage() {
  const { me } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  return (
    <AuthFrame
      title="Change password"
      description={me?.mustChangePassword ? 'You must change your password before you can continue.' : undefined}
    >
      <ChangePasswordForm
        onChanged={() => void navigate(safeNext(params.get('next')) ?? '/', { replace: true })}
      />
    </AuthFrame>
  )
}
