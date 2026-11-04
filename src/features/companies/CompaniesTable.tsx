import { BanIcon, CircleAlertIcon, CircleCheckIcon, CircleSlashIcon, MoreHorizontalIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { Company } from '@/api/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatRelative, formatTimestamp } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { outcomeView, type OutcomeTone } from '@/features/lists/qbListsView'
import { AccessBadge } from './AccessBadge'
import { fileText, sortCompanies } from './companiesView'

const OUTCOME_ICON = { success: CircleCheckIcon, warning: CircleAlertIcon, danger: CircleSlashIcon } as const satisfies Record<OutcomeTone, unknown>

/** The companies, one row each; missing and disabled ones sit last and dimmed. Admins get the actions menu. */
export function CompaniesTable({
  items,
  isAdmin,
  checkingId,
  onCheck,
  onEditNames,
  onChooseFile,
  onToggleDisabled,
}: {
  items: readonly Company[]
  isAdmin: boolean
  /** The company whose access check is running, if any; every Check access waits until it answers. */
  checkingId?: number
  onCheck: (c: Company) => void
  onEditNames: (c: Company) => void
  onChooseFile: (c: Company) => void
  onToggleDisabled: (c: Company) => void
}) {
  return (
    <>
      <Table aria-label="Companies" className="min-w-[880px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Code</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>File</TableHead>
            <TableHead>QuickBooks access</TableHead>
            <TableHead>Lists</TableHead>
            <TableHead className="w-24">Waiting</TableHead>
            {isAdmin && (
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortCompanies(items).map((c) => {
            const dimmed = c.state === 'missing' || c.state === 'disabled'
            const lists = c.lists
            const outcome = lists?.outcome ? outcomeView(lists.outcome) : null
            const OutcomeIcon = outcome ? OUTCOME_ICON[outcome.tone] : null
            return (
              <TableRow key={c.id} className={cn(dimmed && 'text-muted-foreground')}>
                <TableCell className="tabular-nums">{c.code ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium break-words">{c.displayName}</span>
                    {c.state === 'missing' && (
                      <Badge variant="danger">
                        <BanIcon aria-hidden />
                        Folder missing
                      </Badge>
                    )}
                    {c.state === 'disabled' && (
                      <Badge variant="muted">
                        <CircleSlashIcon aria-hidden />
                        Disabled
                      </Badge>
                    )}
                  </div>
                  {c.qbCompanyName && c.qbCompanyName !== c.displayName && (
                    <div className="text-xs text-muted-foreground break-words">{c.qbCompanyName}</div>
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {c.filePath ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {/* Focusable so keyboard users can reach the full path too. */}
                        <span tabIndex={0} className="cursor-default break-all rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          {fileText(c)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm break-all">{c.filePath}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="break-all">{fileText(c)}</span>
                  )}
                </TableCell>
                <TableCell>
                  <AccessBadge access={c.access} />
                  {c.accessCheckedUtc && (
                    <div className="mt-0.5 text-xs text-muted-foreground" title={formatTimestamp(c.accessCheckedUtc)}>
                      {formatRelative(c.accessCheckedUtc)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {lists?.syncedUtc && outcome && OutcomeIcon ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span title={formatTimestamp(lists.syncedUtc)}>{formatRelative(lists.syncedUtc)}</span>
                      <Badge variant={outcome.tone}>
                        <OutcomeIcon aria-hidden />
                        {outcome.label}
                      </Badge>
                      <Link className="text-primary underline-offset-4 hover:underline" to={`/lists?company=${c.id}`}>
                        Lists
                      </Link>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Never synced</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  <Link
                    className="text-primary underline-offset-4 hover:underline"
                    to={`/statements?company=${c.id}`}
                    aria-label={`${c.waitingCount} waiting for ${c.displayName}`}
                  >
                    {c.waitingCount}
                  </Link>
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.displayName}`}>
                          <MoreHorizontalIcon aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {c.state === 'active' && (
                          <DropdownMenuItem disabled={checkingId !== undefined} onSelect={() => onCheck(c)}>
                            {checkingId === c.id ? 'Checking…' : 'Check access'}
                          </DropdownMenuItem>
                        )}
                        {c.state === 'ambiguous' && <DropdownMenuItem onSelect={() => onChooseFile(c)}>Choose file</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => onEditNames(c)}>Edit match names</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onToggleDisabled(c)}>{c.state === 'disabled' ? 'Enable' : 'Disable'}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </>
  )
}
