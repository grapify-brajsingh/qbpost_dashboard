import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '@/api/problem'
import { useRequest, useValidate } from '@/api/queries/requests'
import type { RequestDetail, Txn } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusBanner } from '@/features/requests/detail/StatusBanner'
import { DiscardDialog } from '@/features/requests/dialogs/DiscardDialog'
import { ResolveDialog } from '@/features/requests/dialogs/ResolveDialog'
import { RestoreDialog } from '@/features/requests/dialogs/RestoreDialog'
import { busyTitle, type DuplicateInfo } from '@/features/requests/posting/outcome'
import { PostDialog } from '@/features/requests/posting/PostDialog'
import { PostingProgress } from '@/features/requests/posting/PostingProgress'
import { PostResultBanner } from '@/features/requests/posting/PostResultBanner'
import { usePost } from '@/features/requests/posting/usePost'
import { isPosting } from '@/features/requests/transactions/draft'
import { useDraftDirty } from '@/features/requests/transactions/draftDirtyStore'
import { TransactionsTab } from '@/features/requests/transactions/TransactionsTab'
import { StatementSheet } from '@/features/statements/sheet/StatementSheet'
import { useStatementSheet } from '@/features/statements/sheet/useStatementSheet'
import { useBreadcrumb } from '@/layout/useBreadcrumb'
import { StatementHeader, type MenuAction } from './StatementHeader'

/** The version a post dialog opened on. */
interface Seen {
  etag: string
  version: number
}

/** True when the saved statement has rows and every one is marked don't post. */
function allSkipped(request: RequestDetail): boolean {
  const rows = request.payload.transactions
  return Array.isArray(rows) && rows.length > 0 && rows.every((r) => typeof r === 'object' && r !== null && !isPosting(r as Txn))
}

/** `/statements/:id`. Mounted keyed by id: nothing (draft, post state, dialogs) carries over to another statement. */
export function StatementPage() {
  const { id = '' } = useParams()
  const q = useRequest(id)
  const dirty = useDraftDirty(id)
  const post = usePost(id)
  const validate = useValidate(id)
  const sheet = useStatementSheet()
  useBreadcrumb(q.data?.request.publicRef ?? '')
  // The post dialog; `dup` is the other request when this one may be a duplicate. `seen` is the version the dialog
  // opened on: Confirm posts that ETag, never one a reload brought in under the open dialog.
  const [dialog, setDialog] = useState<{ dup: DuplicateInfo | null; seen: Seen } | null>(null)
  // The version the last post sent: held findings (422 or 200 partial) apply to the table only while that version is
  // on screen. A 409 duplicate-unconfirmed reopens the dialog on the same version.
  const [sent, setSent] = useState<Seen | null>(null)
  const [other, setOther] = useState<MenuAction | null>(null)
  const outcome = post.outcome
  useEffect(() => {
    if (outcome?.kind === 'duplicate' && sent) setDialog({ dup: outcome.duplicate ?? { of: null }, seen: sent })
  }, [outcome, sent])

  if (q.isPending) return <Skeleton className="m-6 h-40" />
  if (q.data === undefined) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) {
      return (
        <div className="p-6">
          <h1 className="text-xl font-semibold">Statement not found</h1>
          <Link className="underline" to="/statements">
            Back to Statements
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
  const can = (a: RequestDetail['allowedActions'][number]) => request.allowedActions.includes(a)

  const openPost = () => {
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
        : allSkipped(request)
          ? "Every row is marked don't post"
          : undefined
  const heldFindings =
    (outcome?.kind === 'held' || outcome?.kind === 'partial') && sent?.version === request.currentVersion
      ? outcome.findings
      : undefined
  const showResult = outcome && outcome.kind !== 'timeout' && outcome.kind !== 'duplicate'

  const validateButton = can('validate') ? (
    <Button variant="outline" size="sm" disabled={validate.isPending} onClick={() => validate.mutate()}>
      {validate.isPending ? 'Validating…' : 'Validate'}
    </Button>
  ) : undefined
  const postButton = !can('post') ? undefined : postBlocked ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button size="sm" disabled>
            Post to QuickBooks
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{postBlocked}</TooltipContent>
    </Tooltip>
  ) : (
    <Button size="sm" onClick={openPost}>
      Post to QuickBooks
    </Button>
  )

  return (
    <div className="space-y-4 px-4 pt-6 md:px-7">
      {q.error && <ProblemAlert error={q.error} />}
      <StatementHeader request={request} onOpenSheet={(tab) => sheet.open(request.id, tab)} onMenu={setOther} />
      <StatusBanner request={request} />
      {(post.isPosting || request.status === 'posting') && <PostingProgress rows={request.transactionCount} />}
      {showResult && <PostResultBanner outcome={outcome} requestId={id} />}
      {validate.error && <ProblemAlert error={validate.error} />}
      <TransactionsTab key={request.id} request={request} etag={etag} findingsOverride={heldFindings} validate={validateButton} post={postButton} />
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
      <StatementSheet />
    </div>
  )
}
