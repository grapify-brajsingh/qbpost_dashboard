import { useEffect, useState } from 'react'
import { FileQuestionIcon, Loader2Icon, SendIcon, ShieldCheckIcon } from 'lucide-react'
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
import { tableShape } from '@/features/requests/transactions/findings'
import { TransactionsTab } from '@/features/requests/transactions/TransactionsTab'
import { StatementSheet } from '@/features/statements/sheet/StatementSheet'
import { useStatementSheet } from '@/features/statements/sheet/useStatementSheet'
import { useBreadcrumb } from '@/layout/useBreadcrumb'
import { StatementHeader, type MenuAction } from './StatementHeader'
import { ValidationProblems } from './ValidationProblems'
import { statementSubject } from '@/lib/statementTitle'

/** The version a post dialog opened on. */
interface Seen {
  etag: string
  version: number
  /** The saved payload the user saw, so the dialog's counts match the ETag it posts. */
  payload: RequestDetail['payload']
}

/** The page title and last crumb: the email subject, else the uploaded file name, else the SR ref. */
function titleOf(request: RequestDetail): string {
  return statementSubject(request)?.trim() || request.publicRef
}

/** True when the saved statement has rows and every one is marked don't post. */
function allSkipped(request: RequestDetail): boolean {
  const rows = request.payload.transactions
  return Array.isArray(rows) && rows.length > 0 && rows.every((r) => typeof r === 'object' && r !== null && !isPosting(r as Txn))
}

/** The page's outline while the statement loads, so the layout does not jump when it arrives. */
function StatementSkeleton() {
  return (
    <div role="status" aria-label="Loading statement" className="page gap-4">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <Skeleton className="h-[84px] w-full rounded-lg" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-[50vh] w-full rounded-lg" />
    </div>
  )
}

/** `/statements/:id`. Mounted keyed by id: nothing (draft, post state, dialogs) carries over to another statement. */
export function StatementPage() {
  const { id = '' } = useParams()
  const q = useRequest(id)
  const dirty = useDraftDirty(id)
  const post = usePost(id)
  const validate = useValidate(id)
  const sheet = useStatementSheet()
  useBreadcrumb(q.data ? titleOf(q.data.request) : '')
  // The post dialog; `dup` is the other request when this one may be a duplicate. `seen` is the version the dialog
  // opened on: Confirm posts that ETag, never one a reload brought in under the open dialog.
  const [dialog, setDialog] = useState<{ dup: DuplicateInfo | null; seen: Seen } | null>(null)
  // The version the last post sent: held findings (422 or 200 partial) apply to the table only while that version is
  // on screen. A 409 duplicate-unconfirmed reopens the dialog on the same version.
  const [sent, setSent] = useState<Seen | null>(null)
  const [other, setOther] = useState<MenuAction | null>(null)
  // The header's reference lives in the draft, which the table editor owns: the editor renders it into this element.
  const [referenceSlot, setReferenceSlot] = useState<HTMLElement | null>(null)
  const outcome = post.outcome
  useEffect(() => {
    if (outcome?.kind === 'duplicate' && sent) setDialog({ dup: outcome.duplicate ?? { of: null }, seen: sent })
  }, [outcome, sent])

  if (q.isPending) return <StatementSkeleton />
  if (q.data === undefined) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) {
      return (
        <div className="page">
          <div className="grid justify-items-center gap-2 py-16 text-center">
            <span className="mb-1 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
              <FileQuestionIcon className="size-5" aria-hidden />
            </span>
            <h1 className="text-lg font-semibold">Statement not found</h1>
            <p className="max-w-[44ch] text-sm text-muted-foreground">It may have been removed, or the link is wrong.</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/statements">Back to Statements</Link>
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="page">
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
      seen: { etag, version: request.currentVersion, payload: request.payload },
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
      {validate.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <ShieldCheckIcon aria-hidden />}
      {validate.isPending ? 'Validating…' : 'Validate'}
    </Button>
  ) : undefined
  const postButton = !can('post') ? undefined : postBlocked ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button size="sm" disabled>
            <SendIcon aria-hidden />
            Post to QuickBooks
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{postBlocked}</TooltipContent>
    </Tooltip>
  ) : (
    <Button size="sm" onClick={openPost}>
      <SendIcon aria-hidden />
      Post to QuickBooks
    </Button>
  )

  return (
    <div className="page gap-4 pb-0 md:pb-0">
      {q.error && <ProblemAlert error={q.error} />}
      <StatementHeader
        request={request}
        title={titleOf(request)}
        onOpenSheet={(tab) => sheet.open(request.id, tab)}
        onMenu={setOther}
        referenceSlot={can('edit') && tableShape(request.payload) === 'table' ? setReferenceSlot : undefined}
      />
      <StatusBanner request={request} />
      <ValidationProblems request={request} findings={heldFindings} />
      {(post.isPosting || request.status === 'posting') && <PostingProgress rows={request.transactionCount} />}
      {showResult && <PostResultBanner outcome={outcome} requestId={id} />}
      {validate.error && <ProblemAlert error={validate.error} />}
      <TransactionsTab key={request.id} request={request} etag={etag} findingsOverride={heldFindings} referenceSlot={referenceSlot} validate={validateButton} post={postButton} />
      {dialog && (
        <PostDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          request={request}
          seenPayload={dialog.seen.payload}
          duplicate={dialog.dup}
          changed={dialog.seen.version !== request.currentVersion}
          onConfirm={(opts) => {
            setDialog(null)
            setSent(dialog.seen)
            post.post({ ...opts, etag: dialog.seen.etag })
          }}
        />
      )}
      <DiscardDialog open={other === 'discard'} onOpenChange={(o) => !o && setOther(null)} requestId={id} />
      <RestoreDialog open={other === 'restore'} onOpenChange={(o) => !o && setOther(null)} requestId={id} />
      <ResolveDialog open={other === 'resolve'} onOpenChange={(o) => !o && setOther(null)} request={request} />
      <StatementSheet />
    </div>
  )
}
