import { useState, type FormEvent } from 'react'
import { CircleAlertIcon, Loader2Icon, LockIcon } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router'
import { ApiError, problemCode, retryAfterSeconds } from '@/api/problem'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthFrame } from './AuthFrame'
import { FullPageLoading } from './RequireAuth'
import { safeNext, useSession } from './useSession'

function ErrorMessage({ error }: { error: unknown }) {
  if (error instanceof ApiError) {
    const { status } = error.problem
    if (status === 401 && problemCode(error.problem) === 'invalid-credentials') {
      return (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
          Email or password is wrong.
        </p>
      )
    }
    if (status === 423) {
      const seconds = retryAfterSeconds(error.headers)
      const minutes = Math.max(1, Math.ceil((seconds ?? 60) / 60))
      return (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <LockIcon className="size-4 shrink-0" aria-hidden />
          Locked. Try again in {minutes} {minutes === 1 ? 'minute' : 'minutes'}.
        </p>
      )
    }
  }
  return <ProblemAlert error={error} />
}

export function SignInPage() {
  const { status, signIn } = useSession()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'restoring') return <FullPageLoading />
  if (status === 'signed-in') return <Navigate to={safeNext(params.get('next')) ?? '/'} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <AuthFrame title="Sign in" description="Review bank and card statements before they reach QuickBooks.">
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error !== null && <ErrorMessage error={error} />}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" aria-hidden />}
          Sign in
        </Button>
      </form>
    </AuthFrame>
  )
}
