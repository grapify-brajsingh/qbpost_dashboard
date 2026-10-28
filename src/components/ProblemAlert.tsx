import { ApiError } from '@/api/problem'

/** Shows an API problem's title and detail (plus request id), or a generic message for anything else. */
export function ProblemAlert({ error }: { error: unknown }) {
  const problem = error instanceof ApiError ? error.problem : null
  const requestId = problem && typeof problem.requestId === 'string' ? problem.requestId : null
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
      {problem ? (
        <>
          <p className="font-medium">{problem.title}</p>
          {problem.detail && <p>{problem.detail}</p>}
        </>
      ) : (
        <p className="font-medium">Something went wrong</p>
      )}
      {requestId && <p className="mt-1 text-xs text-muted-foreground">Request ID: {requestId}</p>}
    </div>
  )
}
