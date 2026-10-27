import { useRef, useState, type ReactNode } from 'react'
import { observeElementRect, useVirtualizer, type Rect } from '@tanstack/react-virtual'
import { AlertTriangle, Columns3 } from 'lucide-react'
import type { Finding, Txn } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { COLUMNS, NARROW_COLUMNS } from './columns'

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

export interface TxTableProps {
  rows: Txn[]
  /** Task 9 turns editing on. */
  editable: boolean
  findings: Map<number, Finding[]>
  /** Row index to the fields that could not be read. */
  readErrors: Map<number, Set<string>>
  onlyProblems: boolean
  toolbar?: ReactNode
}

function ProblemIcon({ n, found, unreadable }: { n: number; found: Finding[]; unreadable: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`Problems on row ${n}`} className="rounded text-destructive focus-visible:ring-2 focus-visible:ring-ring">
          <AlertTriangle className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-2 text-left">
        {found.map((f, i) => (
          <div key={`${f.reason}-${i}`}>
            <p className="font-medium">{f.reason}</p>
            {f.detail && <p>{f.detail}</p>}
            {f.candidates && f.candidates.length > 0 && <p>Candidates: {f.candidates.join(', ')}</p>}
          </div>
        ))}
        {unreadable.length > 0 && <p>Unreadable: {unreadable.join(', ')}</p>}
      </TooltipContent>
    </Tooltip>
  )
}

export function TxTable({ rows, findings, readErrors, onlyProblems, toolbar }: TxTableProps) {
  const [hidden, setHidden] = useState(loadHidden)
  const scrollRef = useRef<HTMLDivElement>(null)

  const columns = COLUMNS.filter((c) => !hidden.includes(c.id))
  // Row keys are the original payload index, so filtering never changes a row's identity.
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => !onlyProblems || findings.has(index) || readErrors.has(index))

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

  function toggle(id: string, show: boolean) {
    const next = show ? hidden.filter((h) => h !== id) : [...hidden, id]
    setHidden(next)
    saveHidden(next)
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>{toolbar}</div>
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
                const found = findings.get(index) ?? []
                const bad = readErrors.get(index)
                const problem = found.length > 0 || bad !== undefined
                return (
                  <tr
                    key={index}
                    data-index={item.index}
                    data-row={index}
                    data-problem={problem ? 'true' : undefined}
                    style={{ height: ROW_HEIGHT }}
                    className="border-b hover:bg-muted/40"
                  >
                    {columns.map((c, ci) => {
                      const unreadable = c.field !== undefined && bad?.has(c.field)
                      return (
                        <td
                          key={c.id}
                          data-read-error={unreadable ? 'true' : undefined}
                          title={unreadable ? 'This value could not be read' : undefined}
                          className={cn(
                            'truncate px-2',
                            c.align === 'right' && 'text-right',
                            ci === 0 && 'border-l-4 border-l-transparent',
                            ci === 0 && problem && 'border-l-destructive',
                            unreadable && 'bg-destructive/15 text-destructive outline outline-1 -outline-offset-1 outline-destructive',
                          )}
                        >
                          {c.id === 'index' ? (
                            <span className="flex items-center gap-1.5">
                              {index + 1}
                              {problem && <ProblemIcon n={index + 1} found={found} unreadable={[...(bad ?? [])]} />}
                            </span>
                          ) : (
                            c.render(row, index)
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
    </TooltipProvider>
  )
}
