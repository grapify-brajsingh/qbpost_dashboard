import { DownloadIcon } from 'lucide-react'
import { addDays, parse } from 'date-fns'
import { useSearchParams } from 'react-router'
import { auditCsvHref, useAuditEvents, type AuditParams } from '@/api/queries/audit'
import { useUsers } from '@/api/queries/users'
import { AUDIT_ACTIONS, type AuditAction } from '@/api/schema'
import { hasScope, useSession } from '@/auth/useSession'
import { ClearFilters, DateRangeChip, FilterChip, SearchBox, useUrlFilters, type FilterOption } from '@/components/filters'
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

/** What a person pastes for a push id (hex and dashes); anything else is a reference. */
const PUSH_ID_RE = /^[0-9a-f-]{8,}$/i

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
  const pageNo = Math.max(1, Math.floor(Number(search.get('page'))) || 1)

  const filterParams: AuditParams = {
    q: f.q,
    actor: f.actor,
    from: f.from ? localMidnightUtc(f.from) : undefined,
    // Through the end of the chosen day: local midnight of the day after.
    to: f.to ? localMidnightUtc(f.to, 1) : undefined,
    requestId: f.requestId,
    ...(f.reference && PUSH_ID_RE.test(f.reference) ? { pushId: f.reference } : { reference: f.reference }),
    action: f.action,
  }
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
    <div className="grid gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Audit trail</h1>
          <p className="text-sm text-muted-foreground">Who changed what, and when. Nothing here can be edited or deleted.</p>
        </div>
        <Button asChild variant="outline">
          <a href={auditCsvHref(filterParams)} download>
            <DownloadIcon aria-hidden />
            Export CSV
          </a>
        </Button>
      </div>

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
      ) : !events.data ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : events.data.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No audit entries match.</p>
      ) : (
        <AuditTable events={events.data.items} />
      )}

      {events.data && total > 0 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {events.data.page} of {pages} · {total} total
          </span>
          <Button variant="outline" size="sm" disabled={pageNo <= 1} onClick={() => setPage(pageNo - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={pageNo >= pages} onClick={() => setPage(pageNo + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
