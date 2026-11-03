import { CircleAlertIcon } from 'lucide-react'
import { ApiTimeoutError } from '@/api/client'
import { ApiError } from '@/api/problem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/** What to say when no API problem came back: a failed fetch is a TypeError. */
function noProblemTitle(error: unknown) {
  if (error instanceof ApiTimeoutError) return 'The server took too long to answer'
  if (error instanceof TypeError) return "Couldn't reach the server"
  return 'Something went wrong'
}

/** Shows an API problem's title and detail (plus request id), or a plain message for anything else. */
export function ProblemAlert({ error }: { error: unknown }) {
  const problem = error instanceof ApiError ? error.problem : null
  const requestId = problem && typeof problem.requestId === 'string' ? problem.requestId : null
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden />
      <AlertTitle>{problem ? problem.title : noProblemTitle(error)}</AlertTitle>
      {(problem?.detail || requestId) && (
        <AlertDescription>
          {problem?.detail && <p>{problem.detail}</p>}
          {requestId && <p className="text-xs text-muted-foreground">Request ID: {requestId}</p>}
        </AlertDescription>
      )}
    </Alert>
  )
}
