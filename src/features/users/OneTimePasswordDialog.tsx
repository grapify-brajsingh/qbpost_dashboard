import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** The password lives only in this component's props. The parent drops it on close. */
export function OneTimePasswordDialog({ password, onClose }: { password: string; onClose: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy. Select the password and copy it by hand.')
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Shown once: only Done closes it, so a stray Escape or click outside cannot lose the password. */}
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>Give this to the user. They must change it when they sign in.</DialogDescription>
        </DialogHeader>
        <code aria-label="Temporary password" className="block rounded-md bg-muted p-3 font-mono text-base select-all">
          {password}
        </code>
        <p className="text-sm font-medium">You won't see this again.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}>
            Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
