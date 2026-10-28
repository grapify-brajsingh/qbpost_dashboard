import type { ReactNode } from 'react'
import type { Action, RequestDetail } from '@/api/schema'
import { FlagChips } from '@/components/FlagChips'
import { StatusBadge } from '@/components/StatusBadge'
import { Timestamp } from '@/components/Timestamp'
import { ActionBar } from './ActionBar'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

interface Props {
  request: RequestDetail
  onAction: (a: Action) => void
  /** Passed to the action bar: a reason disables that button and shows as its tooltip. */
  disabled?: Partial<Record<Action, string>>
}

export function RequestHeader({ request, onAction, disabled }: Props) {
  const dup = request.duplicate
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{request.publicRef}</h1>
        <StatusBadge status={request.status} />
        <FlagChips request={request} linkDuplicate />
        {dup.flagged && dup.ofStatus && (
          <span className="text-sm text-muted-foreground">Other request is {dup.ofStatus}</span>
        )}
        <div className="ml-auto">
          <ActionBar request={request} onAction={onAction} disabled={disabled} />
        </div>
      </div>
      <p className="text-lg">{request.email?.subject ?? <span className="text-muted-foreground">No subject</span>}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
        <Field label="Received">
          {request.email?.receivedUtc ? <Timestamp utc={request.email.receivedUtc} /> : '—'}
        </Field>
        <Field label="Reference">{request.reference ?? '—'}</Field>
        <Field label="Source">{request.source.name}</Field>
        {request.postId && (
          <Field label="Post ID">
            <span className="font-mono">{request.postId}</span>
          </Field>
        )}
        <Field label="Created">
          {request.created.by.name} · <Timestamp utc={request.created.utc} />
        </Field>
        <Field label="Updated">
          {request.updated.by.name} · <Timestamp utc={request.updated.utc} />
        </Field>
      </dl>
    </header>
  )
}
