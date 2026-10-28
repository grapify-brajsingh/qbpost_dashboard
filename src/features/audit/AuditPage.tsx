import { useState } from 'react'
import { DownloadIcon, HistoryIcon, Loader2Icon } from 'lucide-react'
import { addDays, parse } from 'date-fns'
import { useSearchParams } from 'react-router'
import { parsePage } from '@/lib/pageParam'
import { api } from '@/api/client'
import { auditCsvPath, useAuditEvents, type AuditParams } from '@/api/queries/audit'
import { useUsers } from '@/api/queries/users'
import { AUDIT_ACTIONS, type AuditAction } from '@/api/schema'
import { hasScope, useSession } from '@/auth/useSession'
import { ClearFilters, DateRangeChip, FilterChip, SearchBox, useUrlFilters, type FilterOption } from '@/components/filters'
import { DataPanel, EmptyState, Pager, TableSkeleton } from '@/components/DataPanel'
import { PageHeader } from '@/components/PageHeader'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ACTION_LABEL } from './auditSentence'
import { AuditTable } from './AuditTable'

export const AUDIT_PAGE_SIZE = 50

// Module level: useUrlFilters memoises on the spec's identity.
const FILTER_SPEC = {
  q: { kind: 'text' },
  actor: { kind: 'text' },
  from: { kind: 'date' },
  to: { kind: 'date' },
  requestId: { kind: 'number' },
  reference: { kind: 'text' },
  action: { kind: 'enumList', values: AUDIT_ACTIONS },
} as const

/** What a person pastes for a push id: a UUID or a prefix of one (8+ hex digits, dashes where a UUID has them). */
const PUSH_ID_RE = /^[0-9a-f]{8}[0-9a-f-]{0,28}$/i
/** Pure digits and dashes (a date, a number) are references, not push ids. */
const isPushId = (v: string) => PUSH_ID_RE.test(v) && /[a-f]/i.test(v)

/** Fetches the CSV through the api client (bearer token, 401 refresh) and saves it as a file. */
async function downloadCsv(path: string): Promise<void> {
  const text = await api.getText(path)
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit-events.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** The API client n8n posts statements with. */
const N8N_ACTOR = 'api-client:n8n-mailbox'

/** Local midnight of a `yyyy-MM-dd` day as a UTC instant. */
function localMidnightUtc(day: string, plusDays = 0): string {
  return addDays(parse(day, 'yyyy-MM-dd', new Date()), plusDays).toISOString()
}

/** A chip whose popover takes one typed value, applied with Enter or the button. */
function TextChip({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <FilterChip label={label} value={value} onChange={onChange}>
      <form
        className="grid gap-2 p-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = String(new FormData(e.currentTarget).get('value') ?? '').trim()
          onChange(v || undefined)
        }}
      >
        <Input name="value" aria-label={label} defaultValue={value ?? ''} />
        <Button type="submit" size="sm">
          Apply
        </Button>
      </form>
    </FilterChip>
  )
}

function ActorChip({ value, options, onChange }: { value?: string; options: readonly FilterOption[]; onChange: (v: string | undefined) => void }) {
  return <FilterChip label="User" value={value} options={options} onChange={onChange} />
}

/** Admin only: the list of users is fetched here, so nobody else ever asks for it. */
function AdminActorChip({ meId, ...rest }: { meId: string; value?: string; onChange: (v: string | undefined) => void }) {
  const users = useUsers({})
  const others = (users.data?.items ?? []).filter((u) => u.id !== meId)
  return (
    <ActorChip
      {...rest}
      options={[
        { value: meId, label: 'Me' },
        { value: N8N_ACTOR, label: 'n8n' },
        ...others.map((u) => ({ value: u.id, label: u.displayName })),
      ]}
    />
  )
}

function ActionChip({ value, actions, onChange }: { value: readonly AuditAction[]; actions: readonly AuditAction[]; onChange: (v: AuditAction[] | undefined) => void }) {
  const shown = value.length ? value.map((a) => ACTION_LABEL[a]).join(', ') : undefined
  return (
    <FilterChip label="Action" value={shown} onChange={() => onChange(undefined)}>
      <ul aria-label="Actions" className="max-h-72 overflow-auto p-2">
        {actions.map((a) => (
          <li key={a} className="flex items-center gap-2 py-1">
            <Checkbox
              id={`action-${a}`}
              checked={value.includes(a)}
              onCheckedChange={(on) => {
                const next = on === true ? [...value, a] : value.filter((x) => x !== a)
                onChange(next.length ? next : undefined)
              }}
            />
            <Label htmlFor={`action-${a}`} className="font-normal">
              {ACTION_LABEL[a]}
            </Label>
          </li>
        ))}
      </ul>
    </FilterChip>
  )
}

export function AuditPage() {
  const { me } = useSession()
  const isAdmin = hasScope(me, 'users:manage')
  const filters = useUrlFilters(FILTER_SPEC)
  const [search, setSearch] = useSearchParams()
  const f = filters.values
  const pageNo = parsePage(search.get('page'))

  const filterParams: AuditParams = {
    q: f.q,
    actor: f.actor,
    from: f.from ? localMidnightUtc(f.from) : undefined,
    // Through the end of the chosen day: local midnight of the day after.
    to: f.to ? localMidnightUtc(f.to, 1) : undefined,
    requestId: f.requestId,
    ...(f.reference && isPushId(f.reference) ? { pushId: f.reference } : { reference: f.reference }),
    action: f.action,
  }
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)
  const events = useAuditEvents({ ...filterParams, page: pageNo, pageSize: AUDIT_PAGE_SIZE })

  const setPage = (n: number) =>
    setSearch((prev) => {
      const next = new URLSearchParams(prev)
      if (n <= 1) next.delete('page')
      else next.set('page', String(n))
      return next
    })

  const total = events.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / (events.data?.pageSize ?? AUDIT_PAGE_SIZE)))
  // Members never see user events, so they are not offered as a filter either.
  const actions = AUDIT_ACTIONS.filter((a) => isAdmin || !a.startsWith('user-'))

  return (
    <div className="page">
      <PageHeader
        title="Audit trail"
        description="Who changed what, and when. Nothing here can be edited or deleted."
        actions={
          <Button
            variant="outline"
            disabled={exporting}
            onClick={() => {
              setExporting(true)
              setExportError(null)
              downloadCsv(auditCsvPath(filterParams))
                .catch((e: unknown) => setExportError(e))
                .finally(() => setExporting(false))
            }}
          >
            {exporting ? <Loader2Icon className="animate-spin" aria-hidden /> : <DownloadIcon aria-hidden />}
            Export CSV
          </Button>
        }
      />
      {exportError !== null && <ProblemAlert error={exportError} />}

      <div role="search" aria-label="Filters" className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={f.q}
          onChange={(v) => filters.set({ q: v.trim() || undefined })}
          label="Search"
          placeholder="Search payee, value or push ID"
        />
        {isAdmin && me ? (
          <AdminActorChip meId={me.id} value={f.actor} onChange={(v) => filters.set({ actor: v })} />
        ) : (
          <ActorChip
            value={f.actor}
            options={[
              ...(me ? [{ value: me.id, label: 'Me' }] : []),
              { value: N8N_ACTOR, label: 'n8n' },
            ]}
            onChange={(v) => filters.set({ actor: v })}
          />
        )}
        <DateRangeChip label="Date range" from={f.from} to={f.to} onChange={(r) => filters.set({ from: r.from, to: r.to })} />
        <TextChip label="Statement" value={f.reference} onChange={(v) => filters.set({ reference: v })} />
        {f.requestId !== undefined && (
          <FilterChip label="Request" value={`#${f.requestId}`} onChange={() => filters.set({ requestId: undefined })}>
            <p className="p-2 text-sm text-muted-foreground">Showing one statement's entries.</p>
          </FilterChip>
        )}
        <ActionChip value={f.action ?? []} actions={actions} onChange={(v) => filters.set({ action: v })} />
        <ClearFilters onClear={filters.clear} disabled={filters.activeCount === 0} />
      </div>

      {events.isError ? (
        <ProblemAlert error={events.error} />
      ) : (
        <DataPanel>
          {!events.data ? (
            <TableSkeleton columns={6} rows={8} />
          ) : events.data.items.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="No audit entries match."
              description={filters.activeCount > 0 ? 'Try a wider date range, or clear the filters above.' : 'Changes appear here as people work.'}
            />
          ) : (
            <AuditTable events={events.data.items} />
          )}
        </DataPanel>
      )}

      {events.data && total > 0 && <Pager page={pageNo} shown={events.data.page} pages={pages} total={total} onPage={setPage} />}
    </div>
  )
}
