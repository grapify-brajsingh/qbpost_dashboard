import { useState } from 'react'
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
  /** False disables Save (for example invalid JSON). */
  canSave?: boolean
  getPayload: () => Payload
  /** Drops the edits (Discard changes, Reload after a conflict, or a request that is no longer editable). */
  onReset: () => void
  onSaved?: () => void
}

/** "N unsaved changes", Discard, the note and Save. Owns the PUT and its error handling (412, 409, 400/413). */
export function SaveBar({ id, etag, dirty, summary, canSave = true, getPayload, onReset, onSaved }: Props) {
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && summary && <span className="text-sm font-medium">{summary}</span>}
        {dirty && (
          <Button variant="ghost" size="sm" onClick={onReset} disabled={save.isPending}>
            Discard changes
          </Button>
        )}
        <Input
          aria-label="Note"
          className="h-8 w-64"
          placeholder="What did you fix? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" onClick={onSave} disabled={!dirty || !canSave || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
      {noEtag && !etag && (
        <div role="alert" className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <span>This request can’t be saved right now — reload and try again.</span>
          <Button size="sm" variant="outline" onClick={reload}>
            Reload
          </Button>
        </div>
      )}
      {error !== null && <ProblemAlert error={error} />}
      <ConflictDialog
        problem={conflict}
        onClose={() => setConflict(null)}
        onCopy={() => navigator.clipboard.writeText(JSON.stringify(getPayload(), null, 2))}
        onReload={() => {
          setConflict(null)
          onReset()
          reload()
        }}
      />
    </div>
  )
}
