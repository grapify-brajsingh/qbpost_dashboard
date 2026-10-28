import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { observeElementRect, useVirtualizer, type Rect } from '@tanstack/react-virtual'
import { AlertTriangle, Columns3, Trash2, Undo2 } from 'lucide-react'
import type { Finding, QbLists, Txn } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DeleteRowDialog, type DeleteTarget } from '@/features/statements/detail/DeleteRowDialog'
import type { DisplayRow } from '@/features/statements/detail/rowFilters'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AmountCell } from './cells/AmountCell'
import { DateCell } from './cells/DateCell'
import { KindCell } from './cells/KindCell'
import { NameComboCell, NotInQuickBooks } from './cells/NameComboCell'
import { TextCell, type Move } from './cells/TextCell'
import { cellText, COLUMNS, isEditableField, isKnownKind, NARROW_COLUMNS, type TxColumn, type TxField } from './columns'
import { isAddedKey, isPosting, type Draft } from './draft'

const STORAGE_KEY = 'qbpost-tx-columns'
const ROW_HEIGHT = 40
/** A row with a line under a cell ("was …" or a problem reason). */
const TALL_ROW_HEIGHT = 56
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
  onPost: (rowKey: string, post: boolean) => void
  onToggleDelete: (rowKey: string) => void
}

export interface TxTableProps {
  /** Rows to show (already filtered), in payload order. */
  rows: DisplayRow[]
  edit?: TxEditing
  findings: Map<number, Finding[]>
  /** Row index to the fields that could not be read. */
  readErrors: Map<number, Set<string>>
  toolbar?: ReactNode
  /** Payload index of a row to scroll to and highlight. */
  highlight?: number | null
}

/** The finding reasons whose candidates fill a cell. */
const CANDIDATE_FIELD: Partial<Record<string, TxField>> = { 'no-account-rule': 'lineAccount', 'unknown-payee': 'payee' }
/** The cell a finding's reason is shown under; anything else goes under the payee. */
const REASON_FIELD: Partial<Record<string, TxField>> = {
  'no-account-rule': 'lineAccount',
  'unknown-payee': 'payee',
  'unknown-vendor': 'payee',
  'unknown-account': 'account',
  'date-too-old': 'date',
}
const reasonField = (f: Finding): TxField => REASON_FIELD[f.reason] ?? 'payee'

/** Columns the keyboard moves between; the switch and the delete button are ordinary controls. */
const isNavColumn = (c: TxColumn) => c.id !== 'post' && c.id !== 'delete'

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

/** "was 184.32", "was ABC Plumbing", "was empty". */
function wasText(field: TxField, v: unknown): string {
  const shown = field === 'amount' && typeof v === 'number' ? formatMoney(v) : cellText(v)
  return `was ${shown === '' ? 'empty' : shown}`
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

export function TxTable({ rows, edit, findings, readErrors, toolbar, highlight = null }: TxTableProps) {
  const [hidden, setHidden] = useState(loadHidden)
  const [focus, setFocus] = useState<Pos | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wantFocus = useRef(false)

  const columns = COLUMNS.filter((c) => !hidden.includes(c.id))
  const nav = columns.filter(isNavColumn)
  const baseRows: Txn[] = edit && Array.isArray(edit.draft.base.transactions) ? (edit.draft.base.transactions as Txn[]) : []
  const isDirtyCell = (key: string, field: TxField | undefined) => edit !== undefined && field !== undefined && edit.draft.dirtyCells.has(`${key}:${field}`)
  const canEdit = (r: DisplayRow, col: TxColumn) => edit !== undefined && isEditableField(col.field) && !r.deleted

  // Rows with a line under a cell ("was …" or a problem reason) are taller. Worked out once per render.
  const tallKeys = new Set<string>()
  for (const r of rows) if (findings.has(r.index)) tallKeys.add(r.key)
  if (edit) {
    for (const c of edit.draft.dirtyCells) {
      const [rk, field] = c.split(':')
      if (field !== 'post' && !isAddedKey(rk)) tallKeys.add(rk)
    }
  }
  const heightOf = (r: DisplayRow) => (tallKeys.has(r.key) ? TALL_ROW_HEIGHT : ROW_HEIGHT)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i] ? heightOf(rows[i]) : ROW_HEIGHT),
    overscan: 8,
    initialRect: FALLBACK_RECT,
    observeElementRect: (instance, cb) => observeElementRect(instance, (rect) => cb(rect.height === 0 ? FALLBACK_RECT : rect)),
  })
  // The virtualizer caches sizes; re-measure whenever the shown rows or their heights change (an edit, a save,
  // a validation, a post's findings, a filter that swaps rows at the same count).
  const layout = rows.map((r) => `${r.key}${tallKeys.has(r.key) ? '+' : ''}`).join(',')
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [layout, virtualizer])
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

  const canScroll = () => typeof scrollRef.current?.scrollTo === 'function'

  // A row named in the URL: bring it into view.
  useEffect(() => {
    if (highlight === null) return
    const at = rows.findIndex((r) => r.index === highlight)
    if (at >= 0 && canScroll()) virtualizer.scrollToIndex(at, { align: 'center' })
    // Only when the highlighted row changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight])

  function moveTo(pos: Pos) {
    const at = rows.findIndex((r) => r.index === pos.row)
    const rendered = items.some((it) => it.index === at)
    if (at >= 0 && !rendered && canScroll()) virtualizer.scrollToIndex(at, { align: 'auto' })
    wantFocus.current = true
    setFocus(pos)
  }

  /** The next (or previous) editable cell in reading order, or null at the end. */
  function step(from: Pos, dir: 1 | -1): Pos | null {
    let r = rows.findIndex((v) => v.index === from.row)
    let c = nav.findIndex((col) => col.id === from.col)
    if (r < 0 || c < 0) return null
    for (;;) {
      c += dir
      if (c < 0 || c >= nav.length) {
        r += dir
        if (r < 0 || r >= rows.length) return null
        c = dir === 1 ? 0 : nav.length - 1
      }
      if (canEdit(rows[r], nav[c])) return { row: rows[r].index, col: nav[c].id }
    }
  }

  function arrow(from: Pos, dr: number, dc: number): Pos {
    const r = Math.min(rows.length - 1, Math.max(0, rows.findIndex((v) => v.index === from.row) + dr))
    const c = Math.min(nav.length - 1, Math.max(0, nav.findIndex((col) => col.id === from.col) + dc))
    return { row: rows[r].index, col: nav[c].id }
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

  /** Enter or Esc stays on the cell; Tab / Shift+Tab keep the change and edit the next (previous) cell. */
  function finishEdit(pos: Pos, move?: Move) {
    const next = move ? step(pos, move === 'next' ? 1 : -1) : null
    if (next) {
      moveTo(next)
      wantFocus.current = false
      setEditing(true)
      return
    }
    setEditing(false)
    moveTo(pos)
  }

  function toggle(id: string, show: boolean) {
    const next = show ? hidden.filter((h) => h !== id) : [...hidden, id]
    setHidden(next)
    saveHidden(next)
  }

  const first = rows.length > 0 && nav.length > 0 ? { row: rows[0].index, col: nav[Math.min(1, nav.length - 1)].id } : null
  const tabStop = focus ?? first

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 basis-[36rem]">{toolbar}</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto">
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
        <div ref={scrollRef} data-testid="tx-scroll" className="h-[70vh] min-h-80 overflow-auto rounded-lg border bg-card">
          <table className="w-full table-fixed border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
              <tr className="bg-muted/40">
                {columns.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className={cn('px-3 py-2.5 text-left text-[12.5px] font-medium whitespace-nowrap text-muted-foreground', c.width, c.align === 'right' && 'text-right')}
                  >
                    {c.srHeader ? <span className="sr-only">{c.header}</span> : c.header}
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
                const r = rows[item.index]
                const { key, index, row, added, deleted } = r
                const skip = !isPosting(row)
                const n = index + 1
                const found = findings.get(index) ?? []
                const bad = readErrors.get(index)
                const problem = found.length > 0 || bad !== undefined
                const lit = highlight === index
                return (
                  <tr
                    key={key}
                    data-index={item.index}
                    data-row={index}
                    data-problem={problem ? 'true' : undefined}
                    data-deleted={deleted ? 'true' : undefined}
                    data-added={added ? 'true' : undefined}
                    data-skip={skip ? 'true' : undefined}
                    data-highlight={lit ? 'true' : undefined}
                    style={{ height: heightOf(r) }}
                    className={cn(
                      'border-b transition-colors duration-150 hover:bg-accent/50',
                      deleted && 'text-muted-foreground line-through',
                      lit && 'bg-primary-soft ring-2 ring-primary ring-inset',
                    )}
                  >
                    {columns.map((c) => {
                      if (c.id === 'post') {
                        return (
                          <td key={c.id} data-col={c.id} className={cn('px-3', problem && 'shadow-[inset_3px_0_0_var(--destructive)]')}>
                            <Switch
                              aria-label={`Post row ${n}`}
                              checked={!skip}
                              disabled={!edit || deleted}
                              onCheckedChange={(v) => edit?.onPost(key, v)}
                            />
                          </td>
                        )
                      }
                      if (c.id === 'delete') {
                        return (
                          <td key={c.id} data-col={c.id} className="px-1 text-right">
                            {edit &&
                              (deleted ? (
                                <Button variant="ghost" size="icon-sm" aria-label={`Restore row ${n}`} onClick={() => edit.onToggleDelete(key)}>
                                  <Undo2 aria-hidden />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Delete row ${n}`}
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => setConfirmDelete({ rowKey: key, n, row })}
                                >
                                  <Trash2 aria-hidden />
                                </Button>
                              ))}
                          </td>
                        )
                      }
                      const pos = { row: index, col: c.id }
                      const unreadable = c.field !== undefined && bad?.has(c.field)
                      const editable = canEdit(r, c)
                      const isEditing = editing && focus?.row === index && focus.col === c.id
                      const dirty = isDirtyCell(key, c.field)
                      const reasons = c.field ? found.filter((f) => reasonField(f) === c.field) : []
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
                            'group/cell px-3 py-1 outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                            !isEditing && 'truncate',
                            c.align === 'right' && 'text-right tabular-nums',
                            editable && !isEditing && 'cursor-text hover:bg-primary/5',
                            skip && !deleted && 'text-muted-foreground line-through decoration-muted-foreground/60',
                            unreadable && 'bg-destructive/15 text-destructive outline outline-1 -outline-offset-1 outline-destructive',
                            dirty && 'bg-primary-soft',
                          )}
                        >
                          {c.id === 'index' ? (
                            <span className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
                              {n}
                              {added && <span className="text-[11px] text-primary no-underline">new</span>}
                              {deleted && <span className="text-[11px] text-destructive no-underline">deleted</span>}
                              {problem && (
                                <ProblemIcon
                                  n={n}
                                  found={found}
                                  unreadable={[...(bad ?? [])]}
                                  onCandidate={edit && !deleted ? (field, v) => edit.onCell(key, field, v) : undefined}
                                />
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
                            <>
                              <div className="flex items-center gap-1">
                                <div className={cn('min-w-0 flex-1 truncate', c.align === 'right' && 'text-right')}>
                                  <CellView col={c} row={row} index={index} lists={edit?.lists} />
                                </div>
                                {editable && (
                                  <span data-pencil aria-hidden className="shrink-0 text-xs text-muted-foreground opacity-0 group-hover/cell:opacity-100">
                                    ✎
                                  </span>
                                )}
                              </div>
                              {dirty && !added && c.field && (
                                <div className="truncate text-[11px] text-primary no-underline">{wasText(c.field, baseRows[index]?.[c.field])}</div>
                              )}
                              {reasons.map((f, i) => (
                                <div key={`${f.reason}-${i}`} className="flex items-center gap-1 truncate text-[11px] text-destructive">
                                  <AlertTriangle className="size-3 shrink-0" aria-hidden />
                                  <span className="truncate">{f.detail ?? f.reason}</span>
                                </div>
                              ))}
                            </>
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
      <DeleteRowDialog target={confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={(k) => edit?.onToggleDelete(k)} />
    </TooltipProvider>
  )
}
