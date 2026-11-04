import { XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateCompany } from '@/api/queries/companies'
import type { Company } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cleanMatchName } from './companiesView'

/** The printed business names that assign a statement to this company. */
export function MatchNamesDialog({ company, open, onOpenChange }: { company: Company; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Radix unmounts the content when closed, so the form starts fresh on every open. */}
        <MatchNamesForm company={company} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function MatchNamesForm({ company, onDone }: { company: Company; onDone: () => void }) {
  const [names, setNames] = useState(company.matchNames)
  const [draft, setDraft] = useState('')
  // The version on screen when the dialog opened: a 412 means someone else changed the company since.
  const [rowVersion] = useState(company.rowVersion)
  const update = useUpdateCompany()
  const addable = cleanMatchName(draft, names)
  // A typed name not yet added would be lost on Save without a word, so Save waits until it is added or cleared.
  const pendingName = draft.trim() !== ''

  function add() {
    if (addable) setNames([...names, addable])
    setDraft('')
  }

  function save() {
    update.mutate(
      { id: company.id, rowVersion, patch: { matchNames: names } },
      {
        onSuccess: () => {
          toast.success(`Match names saved for ${company.displayName}`)
          onDone()
        },
      },
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Match names for {company.displayName}</DialogTitle>
        <DialogDescription>Statements whose printed business name equals one of these are assigned to this company.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        {names.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Match names">
            {names.map((n) => (
              <li key={n}>
                <Badge variant="secondary" className="h-6 gap-1 pr-0.5">
                  {n}
                  <button
                    type="button"
                    aria-label={`Remove ${n}`}
                    className="grid size-5 place-items-center rounded-sm hover:bg-foreground/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    onClick={() => setNames(names.filter((x) => x !== n))}
                  >
                    <XIcon className="size-3" aria-hidden />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No names yet.</p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Input
            aria-label="Add a name"
            placeholder="Add a name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-describedby={pendingName ? 'match-name-pending' : undefined}
          />
          <Button type="submit" variant="outline" disabled={addable === null}>
            Add
          </Button>
        </form>
        {pendingName && (
          <p id="match-name-pending" className="text-xs text-muted-foreground">
            Add this name or clear it before saving.
          </p>
        )}
        {update.isError && <ProblemAlert error={update.error} />}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={update.isPending || pendingName}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  )
}
