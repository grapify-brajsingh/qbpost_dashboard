import { toast } from 'sonner'
import { useRestore } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestId: string
}

export function RestoreDialog({ open, onOpenChange, requestId }: Props) {
  const restore = useRestore(requestId)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore this request?</AlertDialogTitle>
          <AlertDialogDescription>It goes back to pending and can be edited and posted again.</AlertDialogDescription>
        </AlertDialogHeader>
        {restore.error && <ProblemAlert error={restore.error} />}
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={restore.isPending}
            onClick={() =>
              restore.mutate(undefined, {
                onSuccess: () => {
                  onOpenChange(false)
                  toast.success('Statement restored')
                },
              })
            }
          >
            Confirm
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
