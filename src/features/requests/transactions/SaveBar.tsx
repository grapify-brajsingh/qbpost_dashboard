import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, problemCode, type ApiProblem } from '@/api/problem'
import { requestKeys, useSaveRequest } from '@/api/queries/requests'
import type { Payload } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConflictDialog } from '../dialogs/ConflictDialog'

interface Props {
  id: string
  /** ETag of the record on screen. Empty means the server did not send one: saving is refused. */
  etag: string
  dirty: boolean
  /** For example "2 unsaved changes"; shown only while dirty. */
  summary?: string
  /** For example "1 edit, 1 added row"; shown next to the summary. */
  breakdown?: string
  /** False disables Save (for example invalid JSON). */
  canSave?: boolean
  getPayload: () => Payload
  /** What "Copy my edits" copies; defaults to the payload as JSON. The raw editor passes its text as typed. */
  getCopyText?: () => string
  /** Drops the edits (Undo changes, Reload after a conflict, or a request that is no longer editable). */
  onReset: () => void
  onSaved?: () => void
  /** The page's Validate and Post buttons, shown around Save. */
  validate?: ReactNode
  post?: ReactNode
}

/** The bar fixed under the statement. Only the page's buttons, for someone who can't edit but can validate or post. */
export function ActionBarFrame({ children }: { children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Save bar"
      className="sticky bottom-0 z-20 -mx-4 mt-4 space-y-2 border-t bg-card/90 px-4 py-3 backdrop-blur-md md:-mx-7 md:px-7"
    >
      {children}
    </div>
  )
}

/** "N unsaved changes" with the breakdown, Undo changes, the note and Save. Owns the PUT and its errors (412, 409, 400/413). */
export function SaveBar({ id, etag, dirty, summary, breakdown, canSave = true, getPayload, getCopyText, onReset, onSaved, validate, post }: Props) {
  const qc = useQueryClient()
  const save = useSaveRequest(id)
  const [note, setNote] = useState('')
  const [conflict, setConflict] = useState<ApiProblem | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [noEtag, setNoEtag] = useState(false)

  const reload = () => void qc.invalidateQueries({ queryKey: requestKeys.detail(id), exact: true })

  function onSave() {
    setError(null)
    if (!etag) {
      setNoEtag(true)
      return
    }
    setNoEtag(false)
    const trimmed = note.trim()
    save.mutate(
      { payload: getPayload(), note: trimmed || undefined, etag },
      {
        onSuccess: () => {
          setNote('')
          onReset()
          onSaved?.()
        },
        onError: (e) => {
          const p = e instanceof ApiError ? e.problem : null
          if (p?.status === 412) setConflict(p)
          else if (p?.status === 409 && problemCode(p) === 'not-editable') {
            onReset()
            reload()
          } else setError(e)
        },
      },
    )
  }

  return (
    <ActionBarFrame>
      {noEtag && !etag && (
        <div role="alert" className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <span>This request can’t be saved right now — reload and try again.</span>
          <Button size="sm" variant="outline" onClick={reload}>
            Reload
          </Button>
        </div>
      )}
      {error !== null && <ProblemAlert error={error} />}
      <div className="flex flex-wrap items-center gap-2.5">
        {dirty && summary && (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="size-2 rounded-full bg-amber-500" aria-hidden />
            <b className="font-semibold">{summary}</b>
            {breakdown && <span className="text-xs text-muted-foreground">{breakdown}</span>}
          </div>
        )}
        <div className="flex-1" />
        <Input
          aria-label="Note"
          className="h-8 w-56"
          placeholder="What did you fix? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {dirty && (
          <Button variant="ghost" size="sm" onClick={onReset} disabled={save.isPending}>
            Undo changes
          </Button>
        )}
        {validate}
        <Button size="sm" variant="outline" onClick={onSave} disabled={!dirty || !canSave || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        {post}
      </div>
      <ConflictDialog
        problem={conflict}
        onClose={() => setConflict(null)}
        onCopy={() => navigator.clipboard.writeText(getCopyText ? getCopyText() : JSON.stringify(getPayload(), null, 2))}
        onReload={() => {
          setConflict(null)
          onReset()
          reload()
        }}
      />
    </ActionBarFrame>
  )
}
