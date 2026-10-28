import type { ReactNode } from 'react'
import { History, List, MoreHorizontal } from 'lucide-react'
import type { RequestDetail } from '@/api/schema'
import { FlagChips } from '@/components/FlagChips'
import { PushId } from '@/components/PushId'
import { StatusBadge } from '@/components/StatusBadge'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { SheetTab } from '@/features/statements/sheet/useStatementSheet'

export type MenuAction = 'discard' | 'restore' | 'resolve'

const MENU: { action: MenuAction; label: string }[] = [
  { action: 'discard', label: 'Discard' },
  { action: 'restore', label: 'Restore' },
  { action: 'resolve', label: 'Resolve' },
]

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  )
}

/** Subject as the title, the meta line, History / Results (the sheet) and the ⋯ menu per allowedActions. */
export function StatementHeader({
  request,
  title,
  onOpenSheet,
  onMenu,
}: {
  request: RequestDetail
  /** The email subject, or the SR ref when there is none. */
  title: string
  onOpenSheet: (tab: SheetTab) => void
  onMenu: (action: MenuAction) => void
}) {
  const menu = MENU.filter((m) => request.allowedActions.includes(m.action))
  const dup = request.duplicate
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight break-words">{title}</h1>
        <div data-testid="statement-meta" className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
          <dl className="contents">
            <Meta label="Received">{request.email?.receivedUtc ? <Timestamp utc={request.email.receivedUtc} /> : '—'}</Meta>
            <Meta label="From">{request.email?.from ?? '—'}</Meta>
            <Meta label="Reference">{request.reference ?? '—'}</Meta>
            <Meta label="Push">
              <PushId value={request.pushId} fallback={request.publicRef} />
            </Meta>
          </dl>
          <StatusBadge status={request.status} />
          <FlagChips request={request} linkDuplicate />
          {dup.flagged && dup.ofStatus && <span>Other statement is {dup.ofStatus}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenSheet('history')}>
          <History aria-hidden /> History
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOpenSheet('results')}>
          <List aria-hidden /> Results
        </Button>
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menu.map((m) => (
                <DropdownMenuItem key={m.action} onSelect={() => onMenu(m.action)}>
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
