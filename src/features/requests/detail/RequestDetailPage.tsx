import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError } from '@/api/problem'
import { useRequest } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Action } from '@/api/schema'
import { busyTitle, type DuplicateInfo } from '../posting/outcome'
import { PostDialog } from '../posting/PostDialog'
import { PostingProgress } from '../posting/PostingProgress'
import { PostResultBanner } from '../posting/PostResultBanner'
import { usePost } from '../posting/usePost'
import { useDraftDirty } from '../transactions/draftDirtyStore'
import { TransactionsTab } from '../transactions/TransactionsTab'
import { RequestHeader } from './RequestHeader'
import { StatusBanner } from './StatusBanner'

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
  // The post dialog; `dup` is the other request when this one may be a duplicate.
  const [dialog, setDialog] = useState<{ dup: DuplicateInfo | null } | null>(null)
  // The version the last post sent: a 422's findings apply to the table only while that version is on screen.
  const [sentVersion, setSentVersion] = useState<number | null>(null)
  const outcome = post.outcome
  useEffect(() => {
    if (outcome?.kind === 'duplicate') setDialog({ dup: outcome.duplicate ?? { of: null } })
  }, [outcome])

  if (q.isPending) return <Skeleton className="m-6 h-40" />
  if (q.data === undefined) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) {
      return (
        <div className="p-6">
          <h1 className="text-xl font-semibold">Request not found</h1>
          <Link className="underline" to="/requests">
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
    if (a !== 'post') return // Task 11 wires the other dialogs.
    const d = request.duplicate
    setDialog({ dup: d.flagged ? { of: d.of, ofRef: d.ofRef, ofStatus: d.ofStatus } : null })
  }
  const postBlocked = post.isPosting
    ? 'Posting…'
    : post.busyFor !== null
      ? busyTitle(post.busyFor)
      : dirty
        ? 'Save first'
        : undefined
  const heldFindings =
    outcome?.kind === 'held' && sentVersion === request.currentVersion ? outcome.findings : undefined
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
        onConfirm={(opts) => {
          setDialog(null)
          setSentVersion(request.currentVersion)
          post.post(opts)
        }}
      />
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
            ) : (
              <p className="text-sm text-muted-foreground">Coming soon</p>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
