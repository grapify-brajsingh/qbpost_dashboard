import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '@/api/client'
import { requestKeys } from '@/api/queries/requests'
import type { OtherPush, RequestDetail } from '@/api/schema'
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
import { PushId } from '@/components/PushId'
import { Timestamp } from '@/components/Timestamp'
import { createDraft, postStats } from '@/features/requests/transactions/draft'
import { formatCents, formatMoney } from '@/lib/money'
import type { DuplicateInfo } from './outcome'
import { statementSubject } from '@/lib/statementTitle'

const STATE_LABEL = { ok: 'OK', held: 'Held', refused: 'Refused', unreadable: 'Unreadable', unavailable: 'Unavailable' } as const

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: RequestDetail
  /** The payload of the version the dialog opened on (the one whose ETag is posted). */
  seenPayload: RequestDetail['payload']
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

function Body({ request, seenPayload, duplicate, changed, onConfirm, onCancel }: Omit<Props, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const [anyway, setAnyway] = useState(false)
  const [sent, setSent] = useState(false)
  const v = request.validation
  const outdated = v.versionNumber !== undefined && v.versionNumber < request.currentVersion
  const blocked = duplicate !== null && !anyway
  // The dialog only opens on a saved (not dirty) draft, so the saved payload is what will be posted.
  const stats = postStats(createDraft(seenPayload))
  const rowsLabel = `${stats.posting} ${stats.posting === 1 ? 'row' : 'rows'}`

  return (
    <>
      <DialogHeader>
        <DialogTitle>{`Post ${rowsLabel} to QuickBooks?`}</DialogTitle>
        <DialogDescription>
          {`${formatCents(stats.allCents - stats.skippedCents)} will post.`}
          {stats.skipped > 0 && ` ${stats.skipped} ${stats.skipped === 1 ? 'row' : 'rows'} marked don't post ${stats.skipped === 1 ? 'is' : 'are'} skipped.`}
          {' This sends the saved version to QuickBooks.'}
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <dt className="text-muted-foreground">{request.email?.subject?.trim() || !request.upload ? 'Subject' : 'File'}</dt>
        <dd className="break-all">{statementSubject(request) ?? 'No subject'}</dd>
        <dt className="text-muted-foreground">Rows</dt>
        <dd>{`${stats.total} ${stats.total === 1 ? 'row' : 'rows'}`}</dd>
        <dt className="text-muted-foreground">Control total</dt>
        <dd className="font-medium tabular-nums">{formatMoney(typeof seenPayload.controlTotal === 'number' ? seenPayload.controlTotal : null)}</dd>
      </dl>
      <div className="space-y-1 text-sm">
        <p>Validation: {STATE_LABEL[v.state]}</p>
        {v.state !== 'ok' && <p className="text-warning">Validation found problems. The API checks again before posting.</p>}
        {outdated && <p className="font-medium text-warning">Validation is out of date</p>}
      </div>
      {changed && (
        <p role="alert" className="text-sm font-medium text-warning">
          This request changed while this dialog was open.
        </p>
      )}
      {request.otherUnpostedPushes.length > 0 && <OtherPushes pushes={request.otherUnpostedPushes} />}
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
          {`Post ${rowsLabel}`}
        </Button>
      </DialogFooter>
    </>
  )
}

/** What to say about another push that has not finished, by its status. */
const OTHER_PUSH_STATE: Partial<Record<string, string>> & { pending: string } = {
  pending: "and isn't posted.",
  posting: 'and is still posting.',
  partial: 'and is partly posted.',
  unknown: 'and may have posted.',
}

function OtherPushes({ pushes }: { pushes: OtherPush[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
      {pushes.map((p) => (
        <p key={p.id}>
          <Link className="underline" to={`/statements/${p.id}`} target="_blank" rel="noopener noreferrer">
            Push <PushId value={p.pushId} fallback={p.publicRef} />
          </Link>
          {p.receivedUtc && (
            <>
              {' arrived at '}
              <Timestamp utc={p.receivedUtc} />
            </>
          )}
          {` ${OTHER_PUSH_STATE[p.status] ?? OTHER_PUSH_STATE.pending} Make sure you're not posting the same statement twice.`}
        </p>
      ))}
    </div>
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
    <div className="space-y-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
      <p className="font-medium text-warning">{status ? `Possible duplicate of ${ref} (${status})` : `Possible duplicate of ${ref}`}</p>
      {of !== null && (
        <Link className="underline" to={`/statements/${of}`} target="_blank" rel="noreferrer">
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
