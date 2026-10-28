import { CircleAlertIcon } from 'lucide-react'
import { ApiError } from '@/api/problem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/** Shows an API problem's title and detail (plus request id), or a generic message for anything else. */
export function ProblemAlert({ error }: { error: unknown }) {
  const problem = error instanceof ApiError ? error.problem : null
  const requestId = problem && typeof problem.requestId === 'string' ? problem.requestId : null
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden />
      <AlertTitle>{problem ? problem.title : 'Something went wrong'}</AlertTitle>
      {(problem?.detail || requestId) && (
        <AlertDescription>
          {problem?.detail && <p>{problem.detail}</p>}
          {requestId && <p className="text-xs text-muted-foreground">Request ID: {requestId}</p>}
        </AlertDescription>
      )}
    </Alert>
  )
}
