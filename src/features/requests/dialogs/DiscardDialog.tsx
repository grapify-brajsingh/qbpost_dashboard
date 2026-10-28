import { useState } from 'react'
import { toast } from 'sonner'
import { useDiscard } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const MAX = 500

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
}

export function DiscardDialog({ open, onOpenChange, requestId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Body requestId={requestId} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function Body({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const discard = useDiscard(requestId)
  const tooLong = reason.length > MAX
  const valid = reason.trim().length > 0 && !tooLong
  return (
    <>
      <DialogHeader>
        <DialogTitle>Discard this request?</DialogTitle>
        <DialogDescription>It moves out of the queue. An admin can restore it later.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="discard-reason">Reason</Label>
        <Textarea id="discard-reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={tooLong} />
        {tooLong && <p className="text-sm text-destructive">At most 500 characters</p>}
      </div>
      {discard.error && <ProblemAlert error={discard.error} />}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!valid || discard.isPending}
          onClick={() =>
            discard.mutate(
              { reason: reason.trim() },
              {
                onSuccess: () => {
                  onClose()
                  toast.success('Request discarded')
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
