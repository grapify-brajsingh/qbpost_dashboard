import type { ReactNode } from 'react'
import { BanIcon, CircleSlashIcon, History, List, MoreHorizontal, ScaleIcon, Trash2Icon, Undo2Icon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { Company, RequestDetail } from '@/api/schema'
import { FlagChips } from '@/components/FlagChips'
import { PushId } from '@/components/PushId'
import { StatusBadge } from '@/components/StatusBadge'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AccessBadge } from '@/features/companies/AccessBadge'
import { companyLabel, isCompanyReady } from '@/features/companies/companiesView'
import type { SheetTab } from '@/features/statements/sheet/useStatementSheet'
import { cn } from '@/lib/utils'

export type MenuAction = 'discard' | 'restore' | 'resolve'

const MENU: { action: MenuAction; label: string; icon: LucideIcon; destructive?: boolean }[] = [
  { action: 'discard', label: 'Discard', icon: Trash2Icon, destructive: true },
  { action: 'restore', label: 'Restore', icon: Undo2Icon },
  { action: 'resolve', label: 'Resolve', icon: ScaleIcon },
]

function Meta({ label, overflow, children }: { label: string; /** The value may show a popover, so it can't clip. */ overflow?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <dt>{label}</dt>
      <dd className={cn('min-w-0 text-foreground', !overflow && 'truncate')}>{children}</dd>
    </div>
  )
}

/** Subject as the title, the meta line, History / Results (the sheet) and the ⋯ menu per allowedActions. */
export function StatementHeader({
  request,
  title,
  onOpenSheet,
  onMenu,
  referenceSlot,
  company,
  onChangeCompany,
}: {
  request: RequestDetail
  /** The email subject, else the uploaded file name, else the SR ref. */
  title: string
  onOpenSheet: (tab: SheetTab) => void
  onMenu: (action: MenuAction) => void
  /** Present when the reference is editable: receives the element the owner of the draft renders the editor into. */
  referenceSlot?: (el: HTMLElement | null) => void
  /** The statement's company as `GET /companies` lists it, when known: its readiness shows next to the name. */
  company?: Company
  /** Present when the API allows `set-company`: opens Choose company. */
  onChangeCompany?: () => void
}) {
  const menu = MENU.filter((m) => request.allowedActions.includes(m.action))
  const dup = request.duplicate
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-[32rem]">
        <h1 className="text-2xl leading-tight font-semibold tracking-[-0.015em] break-words">{title}</h1>
        <div data-testid="statement-meta" className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
          <dl className="contents">
            {request.upload && !request.email ? (
              <>
                <Meta label="Uploaded">
                  <Timestamp utc={request.created.utc} />
                </Meta>
                <Meta label="File">
                  <span className="break-all">{request.upload.fileName}</span>
                </Meta>
              </>
            ) : (
              <>
                <Meta label="Received">{request.email?.receivedUtc ? <Timestamp utc={request.email.receivedUtc} /> : '—'}</Meta>
                <Meta label="From">{request.email?.from ?? '—'}</Meta>
              </>
            )}
            <Meta label="Reference" overflow={referenceSlot !== undefined}>
              {referenceSlot ? <span ref={referenceSlot} /> : (request.reference ?? '—')}
            </Meta>
            <Meta label="Push">
              <PushId value={request.pushId} fallback={request.publicRef} />
            </Meta>
            {'company' in request && (
              <Meta label="Company" overflow>
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn(request.company === null && 'text-warning')}>
                    {request.company ? companyLabel(request.company) : 'Needs company'}
                  </span>
                  {company && !isCompanyReady(company) && (
                    <>
                      <CompanyReadiness company={company} />
                      <Link to="/companies" className="text-primary underline-offset-4 hover:underline">
                        Companies
                      </Link>
                    </>
                  )}
                  {onChangeCompany && (
                    <Button variant="link" size="sm" className="h-auto p-0 text-[13px]" onClick={onChangeCompany}>
                      Change
                    </Button>
                  )}
                </span>
              </Meta>
            )}
          </dl>
          <StatusBadge status={request.status} />
          <FlagChips request={request} linkDuplicate />
          {dup.flagged && dup.ofStatus && <span>Other statement is {dup.ofStatus}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => onOpenSheet('history')}>
          <History aria-hidden /> History
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOpenSheet('results')}>
          <List aria-hidden /> Results
        </Button>
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="More actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {menu.map((m) => (
                <DropdownMenuItem key={m.action} variant={m.destructive ? 'destructive' : 'default'} onSelect={() => onMenu(m.action)}>
                  <m.icon aria-hidden />
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

/** Why the company can't be used yet: a missing folder or a disabled company, else its QuickBooks access. */
function CompanyReadiness({ company }: { company: Company }) {
  if (company.state === 'missing' || company.state === 'disabled') {
    const missing = company.state === 'missing'
    const Icon = missing ? BanIcon : CircleSlashIcon
    return (
      <Badge variant={missing ? 'danger' : 'muted'}>
        <Icon aria-hidden />
        {missing ? 'Folder missing' : 'Disabled'}
      </Badge>
    )
  }
  return <AccessBadge access={company.access} />
}
