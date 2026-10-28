import { useState } from 'react'
import type { ApiProblem } from '@/api/problem'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/dates'

function changedBy(problem: ApiProblem): string {
  const by = problem.updatedBy
  const name = typeof by === 'object' && by !== null && typeof (by as { name?: unknown }).name === 'string' ? (by as { name: string }).name : 'someone else'
  const when = typeof problem.updatedUtc === 'string' ? formatRelative(problem.updatedUtc) : ''
  return when ? `Changed by ${name} ${when}.` : `Changed by ${name}.`
}

interface Props {
  /** The 412 problem; null closes the dialog. */
  problem: ApiProblem | null
  onReload: () => void
  /** Copies the edits to the clipboard; the dialog stays open. */
  onCopy: () => Promise<void>
  onClose: () => void
}

/** A save hit 412: someone else changed the request. No merge: reload, or copy the edits out first. */
export function ConflictDialog({ problem, onReload, onCopy, onClose }: Props) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  return (
    <AlertDialog
      open={problem !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied('idle')
          onClose()
        }
      }}
    >
      {problem && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This request changed</AlertDialogTitle>
            <AlertDialogDescription>
              {changedBy(problem)} Your edits are kept here; reload to see theirs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {copied !== 'idle' && (
            <p role="status" className="text-sm">
              {copied === 'done' ? 'Your edits are on the clipboard.' : 'Could not copy to the clipboard.'}
            </p>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onCopy().then(
                  () => setCopied('done'),
                  () => setCopied('failed'),
                )
              }}
            >
              Copy my edits
            </Button>
            <Button
              onClick={() => {
                setCopied('idle')
                onReload()
              }}
            >
              Reload (lose my edits)
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
