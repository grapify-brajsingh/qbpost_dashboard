import { useState } from 'react'
import { toast } from 'sonner'
import { useResolve } from '@/api/queries/requests'
import type { RequestDetail } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: RequestDetail
}

export function ResolveDialog({ open, onOpenChange, request }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Body request={request} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

const countsText = (c: Record<string, number>) =>
  Object.entries(c)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')

function Evidence({ request }: { request: RequestDetail }) {
  const { lastAttempt: attempt, ledgerBatch: batch } = request
  const postId = request.postId ?? batch?.postId ?? null
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm" aria-label="Evidence" role="group">
      <p>Post ID: {postId ? <span className="font-mono">{postId}</span> : 'none recorded'}</p>
      {attempt && (
        <p>
          Last attempt: {attempt.outcome}
          {attempt.httpStatus !== null && ` · HTTP ${attempt.httpStatus}`}
          {attempt.finishedUtc && (
            <>
              {' · finished '}
              <Timestamp utc={attempt.finishedUtc} />
            </>
          )}
        </p>
      )}
      {batch && (
        <p>
          Ledger batch: {batch.status}, {countsText(batch.counts)}, created <Timestamp utc={batch.createdUtc} />
        </p>
      )}
      <p className="font-medium">Check QuickBooks before you choose</p>
    </div>
  )
}

type Outcome = 'posted' | 'not-posted'

const MAX = 500

function Body({ request, onClose }: { request: RequestDetail; onClose: () => void }) {
  const partial = request.status === 'partial'
  const [outcome, setOutcome] = useState<Outcome | null>(partial ? 'posted' : null)
  const [note, setNote] = useState('')
  const resolve = useResolve(String(request.id))
  const tooLong = note.length > MAX
  const valid = outcome !== null && note.trim().length > 0 && !tooLong
  const choices: [Outcome, string][] = partial
    ? [['posted', 'Posted (accept as is)']]
    : [
        ['posted', 'Posted'],
        ['not-posted', 'Not posted'],
      ]
  return (
    <>
      <DialogHeader>
        <DialogTitle>Resolve this request</DialogTitle>
        <DialogDescription>
          {partial
            ? 'Some rows posted. Accepting as is marks it posted; post any remaining rows outside the dashboard.'
            : 'Record whether the money reached QuickBooks.'}
        </DialogDescription>
      </DialogHeader>
      <Evidence request={request} />
      <fieldset className="space-y-1 text-sm">
        <legend className="sr-only">Outcome</legend>
        {choices.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="outcome" checked={outcome === value} onChange={() => setOutcome(value)} />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="resolve-note">Note</Label>
        <Textarea id="resolve-note" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={tooLong} />
        {tooLong && <p className="text-sm text-destructive">At most 500 characters</p>}
      </div>
      {resolve.error && <ProblemAlert error={resolve.error} />}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!valid || resolve.isPending}
          onClick={() =>
            resolve.mutate(
              { outcome: outcome!, note: note.trim() },
              {
                onSuccess: () => {
                  onClose()
                  toast.success('Statement resolved')
                },
              },
            )
          }
        >
          Confirm
        </Button>
      </DialogFooter>
    </>
  )
}
