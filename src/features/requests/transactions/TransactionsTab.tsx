import { useMemo, useState } from 'react'
import { useQbLists } from '@/api/queries/lists'
import type { Finding, RequestDetail, Txn } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { addRow, dirtyCount, draftToPayload, rowsSumCents, setCell, setControlTotal, toggleDeleteRow } from './draft'
import { findingsByRow, readErrorCells, tableShape } from './findings'
import { RawJsonEditor } from './RawJsonEditor'
import { SaveBar } from './SaveBar'
import { TotalsBar } from './TotalsBar'
import { TxTable, type TxEditing } from './TxTable'
import { UnsavedGuard } from './UnsavedGuard'
import { useDraft } from './useDraft'
import { ValidationPanel } from './ValidationPanel'

interface Props {
  request: RequestDetail
  /** ETag of `request`; every save sends it as If-Match. */
  etag: string
}

interface TabProps extends Props {
  /** Findings that replace the snapshot's, for example from a 422 post answer (same display as validation). */
  findingsOverride?: Finding[]
}

export function TransactionsTab({ request, etag, findingsOverride }: TabProps) {
  const shape = tableShape(request.payload)
  const baseRows = useMemo(() => (shape === 'table' ? (request.payload.transactions as Txn[]) : []), [shape, request.payload])
  const shown = findingsOverride ?? request.validation.validation
  const findings = useMemo(() => findingsByRow(baseRows, shown ?? []), [baseRows, shown])

  return (
    <div className="space-y-4">
      <ValidationPanel request={request} orphans={findings.get(-1) ?? []} />
      {shape === 'raw' ? <RawJsonEditor request={request} etag={etag} /> : <TableEditor request={request} etag={etag} findings={findings} />}
    </div>
  )
}

function TableEditor({ request, etag, findings }: Props & { findings: ReturnType<typeof findingsByRow> }) {
  const id = String(request.id)
  // Buttons and editing come from allowedActions only.
  const editable = request.allowedActions.includes('edit')
  const [onlyProblems, setOnlyProblems] = useState(false)
  const { draft, dirty, update, reset } = useDraft(id, `${request.currentVersion}:${request.status}`, request.payload)
  const lists = useQbLists({ enabled: editable })
  const readErrors = useMemo(() => readErrorCells(request.readErrors), [request.readErrors])
  const rows = useMemo(() => [...draft.rows, ...draft.added], [draft.rows, draft.added])
  const n = dirtyCount(draft)

  const edit: TxEditing | undefined = editable
    ? {
        draft,
        lists: lists.data,
        onCell: (rowKey, field, value) => update((d) => setCell(d, rowKey, field, value)),
        onToggleDelete: (rowKey) => update((d) => toggleDeleteRow(d, rowKey)),
      }
    : undefined

  return (
    <div className="space-y-2">
      <UnsavedGuard dirty={dirty} />
      {editable && (
        <SaveBar
          id={id}
          etag={etag}
          dirty={dirty}
          summary={`${n} unsaved ${n === 1 ? 'change' : 'changes'}`}
          getPayload={() => draftToPayload(draft)}
          onReset={reset}
        />
      )}
      <TxTable
        rows={rows}
        edit={edit}
        findings={findings}
        readErrors={readErrors}
        onlyProblems={onlyProblems}
        toolbar={
          <div className="flex items-center gap-2">
            <Checkbox id="only-problems" checked={onlyProblems} onCheckedChange={(c) => setOnlyProblems(c === true)} />
            <Label htmlFor="only-problems">Only rows with problems</Label>
          </div>
        }
      />
      {editable && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => update(addRow)}>
          Add row
        </Button>
      )}
      <TotalsBar
        sumCents={rowsSumCents(draft)}
        controlTotal={draft.top.controlTotal}
        changed={!Object.is(draft.top.controlTotal, draft.base.controlTotal)}
        onControlTotal={editable ? (v) => update((d) => setControlTotal(d, v)) : undefined}
      />
    </div>
  )
}
