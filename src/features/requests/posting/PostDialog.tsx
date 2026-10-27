import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '@/api/client'
import { requestKeys } from '@/api/queries/requests'
import type { RequestDetail } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { formatMoney } from '@/lib/money'
import type { DuplicateInfo } from './outcome'

const STATE_LABEL = { ok: 'OK', held: 'Held', refused: 'Refused', unreadable: 'Unreadable', unavailable: 'Unavailable' } as const

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: RequestDetail
  /** The other request when this one may be a duplicate (flagged, or named by a 409 duplicate-unconfirmed). */
  duplicate: DuplicateInfo | null
  /** A newer version arrived while the dialog was open; Confirm still posts the one it opened on (the API answers 412). */
  changed?: boolean
  onConfirm: (opts: { confirmDuplicate?: boolean }) => void
}

export function PostDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <Body {...rest} onCancel={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function Body({ request, duplicate, changed, onConfirm, onCancel }: Omit<Props, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const [anyway, setAnyway] = useState(false)
  const [sent, setSent] = useState(false)
  const v = request.validation
  const outdated = v.versionNumber !== undefined && v.versionNumber < request.currentVersion
  const blocked = duplicate !== null && !anyway

  return (
    <>
      <DialogHeader>
        <DialogTitle>Post to QuickBooks?</DialogTitle>
        <DialogDescription>This sends the saved version to QuickBooks.</DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Subject</dt>
        <dd>{request.email?.subject ?? 'No subject'}</dd>
        <dt className="text-muted-foreground">Rows</dt>
        <dd>{`${request.transactionCount} ${request.transactionCount === 1 ? 'row' : 'rows'}`}</dd>
        <dt className="text-muted-foreground">Control total</dt>
        <dd className="tabular-nums">{formatMoney(request.controlTotal)}</dd>
      </dl>
      <div className="space-y-1 text-sm">
        <p>Validation: {STATE_LABEL[v.state]}</p>
        {v.state !== 'ok' && <p className="text-amber-700 dark:text-amber-400">Validation found problems. The API checks again before posting.</p>}
        {outdated && <p className="font-medium text-amber-700 dark:text-amber-400">Validation is out of date</p>}
      </div>
      {changed && (
        <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-400">
          This request changed while this dialog was open.
        </p>
      )}
      {duplicate && <DuplicateBlock duplicate={duplicate} anyway={anyway} onAnyway={setAnyway} />}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={blocked || sent}
          onClick={() => {
            setSent(true)
            onConfirm(duplicate ? { confirmDuplicate: true } : {})
          }}
        >
          Confirm
        </Button>
      </DialogFooter>
    </>
  )
}

function DuplicateBlock({ duplicate, anyway, onAnyway }: { duplicate: DuplicateInfo; anyway: boolean; onAnyway: (v: boolean) => void }) {
  const of = duplicate.of
  const missing = of !== null && (!duplicate.ofRef || !duplicate.ofStatus)
  const other = useQuery({
    queryKey: [...requestKeys.detail(of ?? 0), 'summary'],
    queryFn: ({ signal }) => api.get<RequestDetail>(`/saved-requests/${of}`, { signal }).then((r) => r.data),
    enabled: missing,
  })
  const ref = duplicate.ofRef || other.data?.publicRef || (of !== null ? `#${of}` : 'another request')
  const status = duplicate.ofStatus || other.data?.status
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <p className="font-medium">{status ? `Possible duplicate of ${ref} (${status})` : `Possible duplicate of ${ref}`}</p>
      {of !== null && (
        <Link className="underline" to={`/requests/${of}`} target="_blank" rel="noreferrer">
          Open the other request
        </Link>
      )}
      <div className="flex items-center gap-2">
        <Checkbox id="post-anyway" checked={anyway} onCheckedChange={(c) => onAnyway(c === true)} />
        <Label htmlFor="post-anyway">Yes, post anyway</Label>
      </div>
    </div>
  )
}
