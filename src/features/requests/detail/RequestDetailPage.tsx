import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError } from '@/api/problem'
import { useRequest } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Action } from '@/api/schema'
import { busyTitle, type DuplicateInfo } from '../posting/outcome'
import { DiscardDialog } from '../dialogs/DiscardDialog'
import { ResolveDialog } from '../dialogs/ResolveDialog'
import { RestoreDialog } from '../dialogs/RestoreDialog'
import { PostDialog } from '../posting/PostDialog'
import { PostingProgress } from '../posting/PostingProgress'
import { PostResultBanner } from '../posting/PostResultBanner'
import { usePost } from '../posting/usePost'
import { useDraftDirty } from '../transactions/draftDirtyStore'
import { AttemptsTab } from '../attempts/AttemptsTab'
import { HistoryTab } from '../history/HistoryTab'
import { VersionsTab } from '../versions/VersionsTab'
import { TransactionsTab } from '../transactions/TransactionsTab'
import { RequestHeader } from './RequestHeader'
import { StatusBanner } from './StatusBanner'

/** The version a post dialog opened on. */
interface Seen {
  etag: string
  version: number
}

const TABS = [
  { value: 'transactions', label: 'Transactions' },
  { value: 'versions', label: 'Versions' },
  { value: 'attempts', label: 'Attempts' },
  { value: 'history', label: 'History' },
] as const

export function RequestDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const q = useRequest(id)
  const dirty = useDraftDirty(id)
  const post = usePost(id)
  // The post dialog; `dup` is the other request when this one may be a duplicate. `seen` is the version the dialog
  // opened on: Confirm posts that ETag, never one a reload brought in under the open dialog.
  const [dialog, setDialog] = useState<{ dup: DuplicateInfo | null; seen: Seen } | null>(null)
  // The version the last post sent: held findings (422 or 200 partial) apply to the table only while that version is
  // on screen. A 409 duplicate-unconfirmed reopens the dialog on the same version.
  const [sent, setSent] = useState<Seen | null>(null)
  const [other, setOther] = useState<'discard' | 'restore' | 'resolve' | null>(null)
  const outcome = post.outcome
  useEffect(() => {
    if (outcome?.kind === 'duplicate' && sent) setDialog({ dup: outcome.duplicate ?? { of: null }, seen: sent })
  }, [outcome, sent])

  if (q.isPending) return <Skeleton className="m-6 h-40" />
  if (q.data === undefined) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) {
      return (
        <div className="p-6">
          <h1 className="text-xl font-semibold">Request not found</h1>
          <Link className="underline" to="/statements">
            Back to Requests
          </Link>
        </div>
      )
    }
    return (
      <div className="p-6">
        <ProblemAlert error={q.error} />
      </div>
    )
  }

  const { request, etag } = q.data
  const requested = params.get('tab')
  const tab = TABS.find((t) => t.value === requested)?.value ?? 'transactions'

  const onAction = (a: Action) => {
    if (a === 'discard' || a === 'restore' || a === 'resolve') return setOther(a)
    if (a !== 'post') return
    const d = request.duplicate
    setDialog({
      dup: d.flagged ? { of: d.of, ofRef: d.ofRef, ofStatus: d.ofStatus } : null,
      seen: { etag, version: request.currentVersion },
    })
  }
  const postBlocked = post.isPosting
    ? 'Posting…'
    : post.busyFor !== null
      ? busyTitle(post.busyFor)
      : dirty
        ? 'Save first'
        : undefined
  const heldFindings =
    (outcome?.kind === 'held' || outcome?.kind === 'partial') && sent?.version === request.currentVersion
      ? outcome.findings
      : undefined
  const showResult = outcome && outcome.kind !== 'timeout' && outcome.kind !== 'duplicate'

  return (
    <div className="space-y-4 p-6">
      {q.error && <ProblemAlert error={q.error} />}
      <RequestHeader request={request} onAction={onAction} disabled={postBlocked ? { post: postBlocked } : undefined} />
      <StatusBanner request={request} />
      {(post.isPosting || request.status === 'posting') && <PostingProgress rows={request.transactionCount} />}
      {showResult && <PostResultBanner outcome={outcome} requestId={id} />}
      <PostDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        request={request}
        duplicate={dialog?.dup ?? null}
        changed={dialog !== null && dialog.seen.version !== request.currentVersion}
        onConfirm={(opts) => {
          if (!dialog) return
          setDialog(null)
          setSent(dialog.seen)
          post.post({ ...opts, etag: dialog.seen.etag })
        }}
      />
      <DiscardDialog open={other === 'discard'} onOpenChange={(o) => !o && setOther(null)} requestId={id} />
      <RestoreDialog open={other === 'restore'} onOpenChange={(o) => !o && setOther(null)} requestId={id} />
      <ResolveDialog open={other === 'resolve'} onOpenChange={(o) => !o && setOther(null)} request={request} />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p)
              if (v === 'transactions') next.delete('tab')
              else next.set('tab', v)
              return next
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          // The transactions tab stays mounted (hidden) so unsaved edits survive a tab switch; keyed by request so
          // nothing (draft, note, dialogs) carries over to another request.
          <TabsContent
            key={t.value}
            value={t.value}
            forceMount={t.value === 'transactions' ? true : undefined}
            hidden={t.value !== tab}
          >
            {t.value === 'transactions' ? (
              <TransactionsTab key={request.id} request={request} etag={etag} findingsOverride={heldFindings} />
            ) : t.value === 'versions' ? (
              t.value === tab && <VersionsTab key={request.id} requestId={id} />
            ) : t.value === 'attempts' ? (
              t.value === tab && <AttemptsTab key={request.id} requestId={id} />
            ) : (
              t.value === tab && <HistoryTab key={request.id} requestId={id} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
