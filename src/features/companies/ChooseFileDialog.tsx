import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateCompany } from '@/api/queries/companies'
import type { Company } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

/** A folder with several .qbw files: the admin says which one is the company. */
export function ChooseFileDialog({ company, open, onOpenChange }: { company: Company; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ChooseFileForm company={company} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ChooseFileForm({ company, onDone }: { company: Company; onDone: () => void }) {
  const [file, setFile] = useState('')
  const [rowVersion] = useState(company.rowVersion)
  const update = useUpdateCompany()

  function save() {
    update.mutate(
      { id: company.id, rowVersion, patch: { filePath: file } },
      {
        onSuccess: () => {
          toast.success(`${company.displayName} will use ${file}`)
          onDone()
        },
      },
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose the file for {company.displayName}</DialogTitle>
        <DialogDescription>The folder holds more than one QuickBooks company file. Pick the one to use.</DialogDescription>
      </DialogHeader>
      <RadioGroup value={file} onValueChange={setFile} aria-label="Company file">
        {company.candidateFiles.map((f, i) => (
          <div key={f} className="flex items-center gap-2">
            <RadioGroupItem value={f} id={`company-file-${company.id}-${i}`} />
            <Label htmlFor={`company-file-${company.id}-${i}`} className="break-all">
              {f}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {update.isError && <ProblemAlert error={update.error} />}
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!file || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  )
}
