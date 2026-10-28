import { useState } from 'react'
import { toast } from 'sonner'
import { useOriginal } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

function pretty(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

/** The body n8n first sent, read-only: pretty JSON when it parses, with a Raw toggle for the exact text. */
export function OriginalViewer({ requestId, open, onOpenChange }: { requestId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useOriginal(requestId, open)
  const [raw, setRaw] = useState(false)
  const formatted = q.data === undefined ? null : pretty(q.data)
  const shown = q.data === undefined ? '' : raw || formatted === null ? q.data : formatted

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Original request</DialogTitle>
          <DialogDescription>Exactly what the sender posted, before any edits.</DialogDescription>
        </DialogHeader>
        {q.isPending && <Skeleton className="h-40" />}
        {q.data === undefined && !q.isPending && <ProblemAlert error={q.error} />}
        {q.data !== undefined && (
          <>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" aria-pressed={raw} onClick={() => setRaw((r) => !r)}>
                Raw
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                Copy
              </Button>
            </div>
            <pre aria-label="Original body" className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs">
              {shown}
            </pre>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
