import { useEffect, useState } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { canRetry, uploadError } from './uploadErrors'

/** Reading failed: the spec §4.3 message, with Try again only when trying the same file again can help. */
export function ExtractionError({ error, fileName, onRetry, onChooseAnother }: {
  error: unknown
  fileName: string
  onRetry: () => void
  onChooseAnother: () => void
}) {
  const view = uploadError(error)
  const wait = view?.waitSeconds
  const [waiting, setWaiting] = useState(wait !== undefined)
  useEffect(() => {
    if (wait === undefined) return
    const t = setTimeout(() => setWaiting(false), wait * 1000)
    return () => clearTimeout(t)
  }, [wait])
  return (
    <div className="space-y-3">
      {view ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertTitle>{view.message}</AlertTitle>
          <AlertDescription>
            <p className="break-all">{fileName}</p>
          </AlertDescription>
        </Alert>
      ) : (
        <ProblemAlert error={error} />
      )}
      <div className="flex flex-wrap gap-2">
        {(view?.retry ?? canRetry(error)) && (
          <Button size="sm" disabled={waiting} onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onChooseAnother}>
          Choose another file
        </Button>
      </div>
    </div>
  )
}
