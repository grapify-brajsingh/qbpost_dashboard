import { useEffect, useMemo, useState } from 'react'
import { CircleAlertIcon, FileTextIcon, Loader2Icon, PlusIcon, SaveIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError, problemCode } from '@/api/problem'
import { useQbLists } from '@/api/queries/lists'
import { useSaveUpload } from '@/api/queries/extractions'
import type { Extraction } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AddTransactionDialog } from '@/features/statements/detail/AddTransactionDialog'
import { ReconciliationMeter } from '@/features/statements/detail/ReconciliationMeter'
import type { DisplayRow } from '@/features/statements/detail/rowFilters'
import { addRow, draftToPayload, postStats, setCell, setControlTotal, setPost, toggleDeleteRow, type Draft } from '@/features/requests/transactions/draft'
import { ActionBarFrame } from '@/features/requests/transactions/SaveBar'
import { TxTable, type TxEditing } from '@/features/requests/transactions/TxTable'
import { UnsavedGuard } from '@/features/requests/transactions/UnsavedGuard'
import { useDraft } from '@/features/requests/transactions/useDraft'
import { DuplicateWarning } from './DuplicateWarning'
import { badValues, emptyFields, emptyFindings, requiredCount, saveBlocker } from './emptyFields'
import { isValidReference, REFERENCE_RULE } from '@/lib/reference'
import { referenceFromFileName } from './format'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function displayRows(d: Draft): DisplayRow[] {
  const loaded = d.rows.length
  return [
    ...d.rows.map((row, i) => ({ key: String(i), index: i, row, added: false, deleted: d.deleted.has(i) })),
    ...d.added.map((row, k) => ({ key: `n${k}`, index: loaded + k, row, added: true, deleted: false })),
  ]
}

/** Step 3: the rows as read, in the statement editor, saved only when the user presses Save statement (spec §4.4). */
export function ReviewEditor({ extraction, onDiscard }: { extraction: Extraction; onDiscard: () => void }) {
  const navigate = useNavigate()
  const { draft, update } = useDraft(`upload:${extraction.extractionId}`, '1', extraction.payload)
  const lists = useQbLists()
  const save = useSaveUpload()
  const [reference, setReference] = useState(() => {
    const read = extraction.payload.reference
    return typeof read === 'string' && read.trim() ? read : referenceFromFileName(extraction.file.name)
  })
  const [adding, setAdding] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Set once saved: the guard stands down, then the effect leaves for the statement.
  const [savedId, setSavedId] = useState<number | null>(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (savedId !== null) navigate(`/statements/${savedId}`, { replace: true })
  }, [savedId, navigate])

  const rows = useMemo(() => displayRows(draft), [draft])
  const empty = useMemo(() => emptyFields(draft), [draft])
  const findings = useMemo(() => emptyFindings(empty), [empty])
  const unreadable = useMemo(() => badValues(draft), [draft])
  const stats = postStats(draft)
  const missing = requiredCount(empty)
  const blocked = expired ? 'This upload has expired' : saveBlocker(draft, reference, save.isPending)

  const edit: TxEditing | undefined = save.isPending
    ? undefined
    : {
        draft,
        lists: lists.data,
        onCell: (rowKey, field, value) => update((d) => setCell(d, rowKey, field, value)),
        onPost: (rowKey, on) => update((d) => setPost(d, rowKey, on)),
        onToggleDelete: (rowKey) => update((d) => toggleDeleteRow(d, rowKey)),
      }

  const onSave = () => {
    const ct = draft.top.controlTotal
    save.mutate(
      {
        extractionId: extraction.extractionId,
        reference: reference.trim(),
        controlTotal: typeof ct === 'number' && Number.isFinite(ct) ? ct : null,
        transactions: draftToPayload(draft).transactions,
      },
      {
        onSuccess: (saved) => {
          toast.success('Statement saved')
          setSavedId(saved.id)
        },
        onError: (e) => {
          const code = e instanceof ApiError ? problemCode(e.problem) : undefined
          if (code === 'extraction-already-saved' && e instanceof ApiError && typeof e.problem.savedRequestId === 'number') {
            toast.info('This upload was already saved')
            setSavedId(e.problem.savedRequestId)
          } else if (code === 'extraction-expired') {
            setExpired(true)
          }
        },
      },
    )
  }

  const saveError = save.error && !(save.error instanceof ApiError && ['extraction-already-saved', 'extraction-expired'].includes(problemCode(save.error.problem) ?? ''))
  const saveButton = (
    <Button size="sm" disabled={blocked !== null} onClick={onSave}>
      {save.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <SaveIcon aria-hidden />}
      {save.isPending ? 'Saving…' : 'Save statement'}
    </Button>
  )

  return (
    <div className="space-y-4">
      <UnsavedGuard dirty={savedId === null && !expired} />
      <header className="space-y-2.5">
        <h2 tabIndex={-1} id="review-heading" className="text-2xl leading-tight font-semibold tracking-[-0.015em] break-all">
          {extraction.file.name}
        </h2>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
          <span>{plural(extraction.file.pageCount, 'page', 'pages')}</span>
          <span>
            Read by {extraction.model} · prompt {extraction.promptVersion}
          </span>
          <Badge variant="warning">
            <FileTextIcon aria-hidden />
            Not saved yet
          </Badge>
        </div>
      </header>

      <div className="grid max-w-md gap-1.5">
        <Label htmlFor="upload-reference">Reference</Label>
        <Input
          id="upload-reference"
          value={reference}
          disabled={save.isPending}
          onChange={(e) => setReference(e.target.value)}
          aria-invalid={!isValidReference(reference.trim())}
          aria-describedby={isValidReference(reference.trim()) ? undefined : 'upload-reference-rule'}
        />
        {reference.trim() !== '' && !isValidReference(reference.trim()) && (
          <p id="upload-reference-rule" className="text-xs text-destructive">
            {REFERENCE_RULE}
          </p>
        )}
      </div>

      <DuplicateWarning items={extraction.possibleDuplicates ?? []} />

      {expired && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertTitle>This upload has expired. Upload the PDF again.</AlertTitle>
          <AlertDescription>
            <Button size="sm" variant="outline" className="mt-1" onClick={onDiscard}>
              Choose another file
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <ReconciliationMeter
        allCents={stats.allCents}
        controlTotal={draft.top.controlTotal}
        postStats={stats}
        onControlTotal={save.isPending ? undefined : (ct) => update((d) => setControlTotal(d, ct))}
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          <p>No transactions were found in this PDF. Add them by hand or choose another file.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)} disabled={!edit}>
            <PlusIcon aria-hidden />
            Add row
          </Button>
        </div>
      ) : (
        <TxTable
          rows={rows}
          edit={edit}
          findings={findings}
          readErrors={unreadable}
          toolbar={
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={!edit}>
                <PlusIcon aria-hidden />
                Add row
              </Button>
            </div>
          }
        />
      )}
      <AddTransactionDialog open={adding} onOpenChange={setAdding} lists={lists.data} onAdd={(row) => update((d) => addRow(d, row))} />

      {saveError && <ProblemAlert error={save.error} />}

      <ActionBarFrame>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <p className="text-[13px] text-muted-foreground">
            {plural(stats.total, 'row', 'rows')}
            {missing > 0 && <span className="text-destructive"> · {plural(missing, 'empty required field', 'empty required fields')}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => setConfirmDiscard(true)}>
              Discard
            </Button>
            {blocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>{saveButton}</span>
                </TooltipTrigger>
                <TooltipContent>{blocked}</TooltipContent>
              </Tooltip>
            ) : (
              saveButton
            )}
          </div>
        </div>
      </ActionBarFrame>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this upload?</AlertDialogTitle>
            <AlertDialogDescription>The rows you've read and any changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={onDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
