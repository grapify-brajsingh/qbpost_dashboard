import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { ApiError, problemCode, retryAfterSeconds } from '@/api/problem'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FullPageLoading } from './RequireAuth'
import { safeNext, useSession } from './useSession'

function ErrorMessage({ error }: { error: unknown }) {
  if (error instanceof ApiError) {
    const { status } = error.problem
    if (status === 401 && problemCode(error.problem) === 'invalid-credentials') {
      return (
        <p role="alert" className="text-sm text-destructive">
          Email or password is wrong.
        </p>
      )
    }
    if (status === 423) {
      const seconds = retryAfterSeconds(error.headers)
      const minutes = Math.max(1, Math.ceil((seconds ?? 60) / 60))
      return (
        <p role="alert" className="text-sm text-destructive">
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
  if (status === 'signed-in') return <Navigate to={safeNext(params.get('next')) ?? '/requests'} replace />

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
    <main className="grid min-h-screen place-items-center p-6">
      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">QbAutopost</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
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
        <Button type="submit" className="w-full" disabled={busy}>
          Sign in
        </Button>
      </form>
    </main>
  )
}
