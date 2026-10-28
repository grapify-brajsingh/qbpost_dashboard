import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { observeElementRect, useVirtualizer, type Rect } from '@tanstack/react-virtual'
import { AlertTriangle, Columns3, MoreHorizontal } from 'lucide-react'
import type { Finding, QbLists, Txn } from '@/api/schema'
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
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AmountCell } from './cells/AmountCell'
import { DateCell } from './cells/DateCell'
import { KindCell } from './cells/KindCell'
import { NameComboCell, NotInQuickBooks } from './cells/NameComboCell'
import { TextCell, type Move } from './cells/TextCell'
import { cellText, COLUMNS, isEditableField, isKnownKind, NARROW_COLUMNS, type TxColumn, type TxField } from './columns'
import { isAddedKey, type Draft } from './draft'

const STORAGE_KEY = 'qbpost-tx-columns'
const ROW_HEIGHT = 36
/** Used before the scroll box has a layout (first paint, jsdom). The real size takes over as soon as it is measured. */
const FALLBACK_RECT: Rect = { width: 1200, height: 700 }

function loadHidden(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveHidden(hidden: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden))
  } catch {
    // Storage unavailable: the choice is just not remembered.
  }
}

/** Present when the user may edit: the draft on screen and how to change it. */
export interface TxEditing {
  draft: Draft
  lists: QbLists | undefined
  onCell: (rowKey: string, field: TxField, value: unknown) => void
  onToggleDelete: (rowKey: string) => void
}

export interface TxTableProps {
  /** Rows on screen: the loaded rows (with edits) followed by added rows. */
  rows: Txn[]
  edit?: TxEditing
  findings: Map<number, Finding[]>
  /** Row index to the fields that could not be read. */
  readErrors: Map<number, Set<string>>
  onlyProblems: boolean
  toolbar?: ReactNode
}

/** The finding reasons whose candidates fill a cell. */
const CANDIDATE_FIELD: Partial<Record<string, TxField>> = { 'no-account-rule': 'lineAccount', 'unknown-payee': 'payee' }

function ProblemIcon({
  n,
  found,
  unreadable,
  onCandidate,
}: {
  n: number
  found: Finding[]
  unreadable: string[]
  onCandidate?: (field: TxField, value: string) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`Problems on row ${n}`} className="rounded text-destructive focus-visible:ring-2 focus-visible:ring-ring">
          <AlertTriangle className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-2 text-left">
        {found.map((f, i) => {
          const field = CANDIDATE_FIELD[f.reason]
          return (
            <div key={`${f.reason}-${i}`}>
              <p className="font-medium">{f.reason}</p>
              {f.detail && <p>{f.detail}</p>}
              {f.candidates && f.candidates.length > 0 && (
                <p>
                  Candidates:{' '}
                  {onCandidate && field
                    ? f.candidates.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="mr-1 rounded border border-current px-1 underline-offset-2 hover:underline"
                          onClick={() => onCandidate(field, c)}
                        >
                          {c}
                        </button>
                      ))
                    : f.candidates.join(', ')}
                </p>
              )}
            </div>
          )
        })}
        {unreadable.length > 0 && <p>Unreadable: {unreadable.join(', ')}</p>}
      </TooltipContent>
    </Tooltip>
  )
}

function nameList(field: TxField, row: Txn, lists: QbLists | undefined): string[] | null {
  if (field === 'payee') return (row.kind === 'Deposit' ? lists?.customers : lists?.vendors) ?? []
  if (field === 'account' || field === 'lineAccount') return lists?.accounts ?? []
  return null
}

/** The cell as text, plus the flags: an unknown kind, or a name that is not in QuickBooks. */
function CellView({ col, row, index, lists }: { col: TxColumn; row: Txn; index: number; lists: QbLists | undefined }) {
  const v = col.field === undefined ? undefined : row[col.field]
  if (col.field === 'kind' && v !== undefined && v !== '' && !isKnownKind(v)) {
    return (
      <span className="flex items-center">
        <span className="truncate">{cellText(v)}</span>
        <span className="ml-1.5 shrink-0 rounded bg-destructive/15 px-1 text-xs text-destructive">not a valid kind</span>
      </span>
    )
  }
  const names = lists && col.field ? nameList(col.field, row, lists) : null
  if (names && typeof v === 'string' && v !== '' && !names.includes(v)) {
    return (
      <span className="flex items-center">
        <span className="truncate">{v}</span>
        <NotInQuickBooks />
      </span>
    )
  }
  return <>{col.render(row, index)}</>
}

function Editor({ field, row, lists, onCommit, onCancel }: { field: TxField; row: Txn; lists: QbLists | undefined; onCommit: (v: unknown, move?: Move) => void; onCancel: () => void }) {
  const p = { onCommit, onCancel }
  const header = COLUMNS.find((c) => c.field === field)?.header ?? field
  if (field === 'kind') return <KindCell initial={row.kind} {...p} />
  if (field === 'amount') return <AmountCell initial={row.amount} {...p} />
  if (field === 'date') return <DateCell initial={row.date} {...p} />
  const names = nameList(field, row, lists)
  if (names) return <NameComboCell label={header} list={names} value={row[field]} {...p} />
  return <TextCell label={header} initial={cellText(row[field])} {...p} />
}

interface Pos {
  /** Payload index of the row (added rows continue after the loaded ones). */
  row: number
  col: string
}

export function TxTable({ rows, edit, findings, readErrors, onlyProblems, toolbar }: TxTableProps) {
  const [hidden, setHidden] = useState(loadHidden)
  const [focus, setFocus] = useState<Pos | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ rowKey: string; n: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wantFocus = useRef(false)

  const columns = COLUMNS.filter((c) => !hidden.includes(c.id))
  const loaded = edit ? edit.draft.rows.length : rows.length
  const rowKey = (index: number) => (index < loaded ? String(index) : `n${index - loaded}`)
  const isDeleted = (index: number) => edit !== undefined && index < loaded && edit.draft.deleted.has(index)
  const canEdit = (index: number, col: TxColumn) => edit !== undefined && isEditableField(col.field) && !isDeleted(index)

  // Row keys are the original payload index, so filtering never changes a row's identity.
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => !onlyProblems || findings.has(index) || readErrors.has(index) || index >= loaded)

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    initialRect: FALLBACK_RECT,
    observeElementRect: (instance, cb) => observeElementRect(instance, (rect) => cb(rect.height === 0 ? FALLBACK_RECT : rect)),
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items.length > 0 ? items[0].start : 0
  const padBottom = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1].end : 0

  // Roving focus: after a move, commit or cancel, focus the cell once it is rendered.
  useLayoutEffect(() => {
    if (!wantFocus.current || !focus || editing) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`tr[data-row="${focus.row}"] td[data-col="${focus.col}"]`)
    if (el) {
      wantFocus.current = false
      el.focus()
    }
  })

  function moveTo(pos: Pos) {
    const at = visible.findIndex((v) => v.index === pos.row)
    const rendered = items.some((it) => it.index === at)
    if (at >= 0 && !rendered && typeof scrollRef.current?.scrollTo === 'function') virtualizer.scrollToIndex(at, { align: 'auto' })
    wantFocus.current = true
    setFocus(pos)
  }

  /** The next (or previous) editable cell in reading order, or null at the end. */
  function step(from: Pos, dir: 1 | -1): Pos | null {
    let r = visible.findIndex((v) => v.index === from.row)
    let c = columns.findIndex((col) => col.id === from.col)
    if (r < 0 || c < 0) return null
    for (;;) {
      c += dir
      if (c < 0 || c >= columns.length) {
        r += dir
        if (r < 0 || r >= visible.length) return null
        c = dir === 1 ? 0 : columns.length - 1
      }
      if (canEdit(visible[r].index, columns[c])) return { row: visible[r].index, col: columns[c].id }
    }
  }

  function arrow(from: Pos, dr: number, dc: number): Pos {
    const r = Math.min(visible.length - 1, Math.max(0, visible.findIndex((v) => v.index === from.row) + dr))
    const c = Math.min(columns.length - 1, Math.max(0, columns.findIndex((col) => col.id === from.col) + dc))
    return { row: visible[r].index, col: columns[c].id }
  }

  function onCellKeyDown(e: KeyboardEvent<HTMLTableCellElement>, pos: Pos, editable: boolean) {
    // Keys typed inside an editor (also those bubbling from its popover portal) are the editor's.
    if (e.target !== e.currentTarget) return
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if ((e.key === 'Enter' || e.key === 'F2') && editable) {
      e.preventDefault()
      setFocus(pos)
      setEditing(true)
    } else if (arrows[e.key]) {
      e.preventDefault()
      moveTo(arrow(pos, ...arrows[e.key]))
    } else if (e.key === 'Tab' && edit) {
      const next = step(pos, e.shiftKey ? -1 : 1)
      if (next) {
        e.preventDefault()
        moveTo(next)
      }
    }
  }

  function finishEdit(pos: Pos, move?: Move) {
    setEditing(false)
    const next = move ? step(pos, move === 'next' ? 1 : -1) : null
    moveTo(next ?? pos)
  }

  function toggle(id: string, show: boolean) {
    const next = show ? hidden.filter((h) => h !== id) : [...hidden, id]
    setHidden(next)
    saveHidden(next)
  }

  const first = visible.length > 0 ? { row: visible[0].index, col: columns[Math.min(1, columns.length - 1)].id } : null
  const tabStop = focus ?? first

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">{toolbar}</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 aria-hidden /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {NARROW_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={!hidden.includes(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)}>
                  {c.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div ref={scrollRef} data-testid="tx-scroll" className="h-[70vh] overflow-auto rounded-md border">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                {columns.map((c) => (
                  <th key={c.id} scope="col" className={cn('px-2 py-2 text-left font-medium', c.width, c.align === 'right' && 'text-right')}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {padTop > 0 && (
                <tr aria-hidden style={{ height: padTop }}>
                  <td colSpan={columns.length} />
                </tr>
              )}
              {items.map((item) => {
                const { row, index } = visible[item.index]
                const key = rowKey(index)
                const added = isAddedKey(key)
                const deleted = isDeleted(index)
                const found = findings.get(index) ?? []
                const bad = readErrors.get(index)
                const problem = found.length > 0 || bad !== undefined
                return (
                  <tr
                    key={key}
                    data-index={item.index}
                    data-row={index}
                    data-problem={problem ? 'true' : undefined}
                    data-deleted={deleted ? 'true' : undefined}
                    style={{ height: ROW_HEIGHT }}
                    className={cn(
                      'border-b hover:bg-muted/40',
                      deleted && 'text-muted-foreground line-through',
                      added && 'bg-amber-50 dark:bg-amber-950/40',
                    )}
                  >
                    {columns.map((c, ci) => {
                      const pos = { row: index, col: c.id }
                      const unreadable = c.field !== undefined && bad?.has(c.field)
                      const editable = canEdit(index, c)
                      const isEditing = editing && focus?.row === index && focus.col === c.id
                      const dirty = edit !== undefined && c.field !== undefined && edit.draft.dirtyCells.has(`${key}:${c.field}`)
                      return (
                        <td
                          key={c.id}
                          data-col={c.id}
                          data-field={c.field}
                          data-dirty={dirty ? 'true' : undefined}
                          data-read-error={unreadable ? 'true' : undefined}
                          title={unreadable ? 'This value could not be read' : undefined}
                          tabIndex={tabStop?.row === index && tabStop.col === c.id ? 0 : -1}
                          onFocus={(e) => {
                            if (e.target === e.currentTarget && (focus?.row !== index || focus.col !== c.id)) setFocus(pos)
                          }}
                          onClick={() => {
                            if (isEditing) return
                            setFocus(pos)
                            if (editable) setEditing(true)
                          }}
                          onKeyDown={(e) => onCellKeyDown(e, pos, editable)}
                          className={cn(
                            'px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                            !isEditing && 'truncate',
                            c.align === 'right' && 'text-right',
                            ci === 0 && 'border-l-4 border-l-transparent',
                            ci === 0 && problem && 'border-l-destructive',
                            unreadable && 'bg-destructive/15 text-destructive outline outline-1 -outline-offset-1 outline-destructive',
                            dirty && 'bg-amber-100 dark:bg-amber-950',
                          )}
                        >
                          {c.id === 'index' ? (
                            <span className="flex items-center gap-1.5">
                              {index + 1}
                              {problem && (
                                <ProblemIcon
                                  n={index + 1}
                                  found={found}
                                  unreadable={[...(bad ?? [])]}
                                  onCandidate={edit && !deleted ? (field, v) => edit.onCell(key, field, v) : undefined}
                                />
                              )}
                              {edit && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label={`Row ${index + 1} actions`}
                                      className="ml-auto rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      <MoreHorizontal className="size-4" aria-hidden />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start">
                                    <DropdownMenuItem
                                      onSelect={() => (deleted ? edit.onToggleDelete(key) : setConfirmDelete({ rowKey: key, n: index + 1 }))}
                                    >
                                      {deleted ? 'Restore row' : 'Delete row'}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </span>
                          ) : isEditing && edit && c.field ? (
                            <Editor
                              field={c.field}
                              row={row}
                              lists={edit.lists}
                              onCommit={(v, move) => {
                                edit.onCell(key, c.field!, v)
                                finishEdit(pos, move)
                              }}
                              onCancel={() => finishEdit(pos)}
                            />
                          ) : (
                            <CellView col={c} row={row} index={index} lists={edit?.lists} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {padBottom > 0 && (
                <tr aria-hidden style={{ height: padBottom }}>
                  <td colSpan={columns.length} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete row {confirmDelete?.n}?</AlertDialogTitle>
            <AlertDialogDescription>The row is struck through until you save, and left out of the saved payload.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && edit?.onToggleDelete(confirmDelete.rowKey)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
