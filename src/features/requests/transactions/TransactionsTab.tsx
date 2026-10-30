import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useQbLists } from '@/api/queries/lists'
import type { Finding, RequestDetail, Txn } from '@/api/schema'
import { useUrlFilters } from '@/components/filters'
import { AddTransactionDialog } from '@/features/statements/detail/AddTransactionDialog'
import { ReconciliationMeter } from '@/features/statements/detail/ReconciliationMeter'
import { ReferenceField } from '@/features/statements/detail/ReferenceField'
import {
  deletedInVersion,
  editedInVersions,
  filterRows,
  ROW_FILTER_SPEC,
  type DisplayRow,
  type RowFilter,
} from '@/features/statements/detail/rowFilters'
import { RowToolbar } from '@/features/statements/detail/RowToolbar'
import { useVersionChanges } from '@/features/statements/detail/useVersionChanges'
import {
  addRow,
  changeBreakdown,
  dirtyCount,
  draftToPayload,
  postStats,
  setCell,
  setControlTotal,
  setPost,
  setReference,
  toggleDeleteRow,
  type ChangeBreakdown,
  type Draft,
} from './draft'
import { findingsByRow, readErrorCells, tableShape } from './findings'
import { RawJsonEditor } from './RawJsonEditor'
import { ActionBarFrame, SaveBar } from './SaveBar'
import { TxTable, type TxEditing } from './TxTable'
import { UnsavedGuard } from './UnsavedGuard'
import { useDraft } from './useDraft'

/** How long a row named by `?row=` stays highlighted. */
const HIGHLIGHT_MS = 2000

export interface PageActions {
  /** The page's Validate and Post buttons, shown in the save bar. */
  validate?: ReactNode
  post?: ReactNode
}

interface Props extends PageActions {
  request: RequestDetail
  /** ETag of `request`; every save sends it as If-Match. */
  etag: string
  /** The header element that shows the reference; the table editor renders the editable field into it. */
  referenceSlot?: HTMLElement | null
}

interface TabProps extends Props {
  /** Findings that replace the snapshot's, for example from a 422 post answer (same display as validation). */
  findingsOverride?: Finding[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "1 edit, 1 added row, 1 marked don't post". */
function breakdownText(b: ChangeBreakdown): string {
  return [
    b.edits && plural(b.edits, 'edit', 'edits'),
    b.added && plural(b.added, 'added row', 'added rows'),
    b.deleted && plural(b.deleted, 'deleted row', 'deleted rows'),
    b.postOff && `${b.postOff} marked don't post`,
    b.postOn && `${b.postOn} marked to post`,
  ]
    .filter(Boolean)
    .join(', ')
}

/** The statement's rows: meter, toolbar, table and save bar (or the raw JSON editor for an unreadable payload). */
export function TransactionsTab({ request, etag, findingsOverride, referenceSlot, validate, post }: TabProps) {
  const shape = tableShape(request.payload)
  const baseRows = useMemo(() => (shape === 'table' ? (request.payload.transactions as Txn[]) : []), [shape, request.payload])
  const shown = findingsOverride ?? request.validation.validation
  const findings = useMemo(() => findingsByRow(baseRows, shown ?? []), [baseRows, shown])

  return shape === 'raw' ? (
    <RawJsonEditor request={request} etag={etag} validate={validate} post={post} />
  ) : (
    <TableEditor request={request} etag={etag} findings={findings} referenceSlot={referenceSlot} validate={validate} post={post} />
  )
}

function displayRows(d: Draft): DisplayRow[] {
  const loaded = d.rows.length
  return [
    ...d.rows.map((row, i) => ({ key: String(i), index: i, row, added: false, deleted: d.deleted.has(i) })),
    ...d.added.map((row, k) => ({ key: `n${k}`, index: loaded + k, row, added: true, deleted: false })),
  ]
}

function dirtyKeysOf(d: Draft): Set<string> {
  const out = new Set<string>()
  for (const c of d.dirtyCells) out.add(c.split(':')[0])
  d.deleted.forEach((i) => out.add(String(i)))
  d.added.forEach((_, k) => out.add(`n${k}`))
  return out
}

function TableEditor({ request, etag, findings, referenceSlot, validate, post }: Props & { findings: ReturnType<typeof findingsByRow> }) {
  const id = String(request.id)
  // Buttons and editing come from allowedActions only.
  const editable = request.allowedActions.includes('edit')
  const { draft, dirty, update, reset } = useDraft(id, `${request.currentVersion}:${request.status}`, request.payload)
  const lists = useQbLists({ enabled: editable })
  const readErrors = useMemo(() => readErrorCells(request.readErrors), [request.readErrors])
  const [adding, setAdding] = useState(false)

  const filters = useUrlFilters(ROW_FILTER_SPEC)
  const v = filters.values
  const rowFilter: RowFilter = { q: v.rq, post: v.rpost, kind: v.rkind, from: v.rfrom, to: v.rto, problem: v.rproblem, edited: v.redited }

  // `?row=<externalId>`: scroll to it and highlight it, or say which version deleted it.
  const [search] = useSearchParams()
  const wanted = search.get('row')
  const all = useMemo(() => displayRows(draft), [draft])
  const target = wanted === null ? undefined : all.find((r) => r.row.externalId === wanted)
  const versions = useVersionChanges(id, request.currentVersion, v.redited === true || (wanted !== null && target === undefined))
  const [highlight, setHighlight] = useState<{ row: string; index: number } | null>(null)
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (wanted === null || handled.current === wanted) return
    if (target) {
      handled.current = wanted
      setHighlight({ row: wanted, index: target.index })
      return
    }
    if (!versions) return
    handled.current = wanted
    const n = deletedInVersion(versions, wanted)
    toast.info(n === null ? `Row ${wanted} isn't in this statement` : `Row ${wanted} was deleted in version ${n}`)
  }, [wanted, target, versions])
  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => setHighlight(null), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [highlight])

  const problemKeys = useMemo(() => {
    const out = new Set<string>()
    for (const i of findings.keys()) if (i >= 0) out.add(String(i))
    for (const i of readErrors.keys()) out.add(String(i))
    return out
  }, [findings, readErrors])
  const earlier = useMemo(() => (versions ? editedInVersions(versions, draft.rows) : new Set<string>()), [versions, draft.rows])
  const visible = filterRows(all, rowFilter, { findings: problemKeys, dirtyKeys: dirtyKeysOf(draft), editedInVersions: earlier })
  const filtered = filters.activeCount > 0

  // The meter and the counts always use the whole draft, never the filtered rows.
  const stats = postStats(draft)
  const n = dirtyCount(draft)

  const edit: TxEditing | undefined = editable
    ? {
        draft,
        lists: lists.data,
        onCell: (rowKey, field, value) => update((d) => setCell(d, rowKey, field, value)),
        onPost: (rowKey, on) => update((d) => setPost(d, rowKey, on)),
        onToggleDelete: (rowKey) => update((d) => toggleDeleteRow(d, rowKey)),
      }
    : undefined

  return (
    <div className="space-y-4">
      <UnsavedGuard dirty={dirty} />
      {editable &&
        referenceSlot &&
        createPortal(
          <ReferenceField value={draft.top.reference} saved={draft.base.reference} onChange={(r) => update((d) => setReference(d, r))} />,
          referenceSlot,
        )}
      <ReconciliationMeter
        allCents={stats.allCents}
        controlTotal={draft.top.controlTotal}
        postStats={stats}
        onControlTotal={editable ? (ct) => update((d) => setControlTotal(d, ct)) : undefined}
        was={Object.is(draft.top.controlTotal, draft.base.controlTotal) ? undefined : { value: draft.base.controlTotal }}
      />
      <TxTable
        rows={visible}
        edit={edit}
        findings={findings}
        readErrors={readErrors}
        highlight={highlight?.index ?? null}
        toolbar={
          <RowToolbar
            values={v}
            onSet={filters.set}
            onClear={filters.clear}
            activeCount={filters.activeCount}
            onAdd={editable ? () => setAdding(true) : undefined}
          />
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[13px] text-muted-foreground">
        <span>{filtered ? `Showing ${visible.length} of ${all.length} rows (filtered)` : plural(all.length, 'row', 'rows')}</span>
        {editable && <span className="text-xs">Click any cell to edit it. Enter or Tab keeps the change, Esc cancels.</span>}
      </div>
      {editable && (
        <AddTransactionDialog open={adding} onOpenChange={setAdding} lists={lists.data} onAdd={(row) => update((d) => addRow(d, row))} />
      )}
      {editable ? (
        <SaveBar
          id={id}
          etag={etag}
          dirty={dirty}
          summary={plural(n, 'unsaved change', 'unsaved changes')}
          breakdown={breakdownText(changeBreakdown(draft))}
          getPayload={() => draftToPayload(draft)}
          onReset={reset}
          validate={validate}
          post={post}
        />
      ) : (
        (validate || post) && (
          <ActionBarFrame>
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {validate}
              {post}
            </div>
          </ActionBarFrame>
        )
      )}
    </div>
  )
}
