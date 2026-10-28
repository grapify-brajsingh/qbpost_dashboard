import type { Finding, RequestDetail } from '@/api/schema'
import { useValidate } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/dates'

const STATE_LABEL = {
  ok: 'OK',
  held: 'Held',
  refused: 'Refused',
  unreadable: 'Unreadable',
  unavailable: 'Unavailable',
} as const

function checkedAgo(utc: string): string {
  const secs = Math.abs(Date.now() - new Date(utc).getTime()) / 1000
  return secs < 60 ? 'just now' : formatRelative(utc)
}

export function ValidationPanel({ request, orphans }: { request: RequestDetail; orphans: Finding[] }) {
  const v = request.validation
  const validate = useValidate(String(request.id))
  const outdated = v.versionNumber !== undefined && v.versionNumber < request.currentVersion
  const unknown = v.unknownNames
  const names = [...(unknown?.accounts ?? []), ...(unknown?.vendors ?? []), ...(unknown?.customers ?? [])]

  return (
    <section aria-label="Validation" className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={v.state === 'ok' ? 'secondary' : 'destructive'}>{STATE_LABEL[v.state]}</Badge>
        {v.counts && (
          <span className="flex flex-wrap gap-x-3 text-muted-foreground">
            {Object.entries(v.counts).map(([k, n]) => (
              <span key={k}>
                {k} <span className="tabular-nums text-foreground">{n}</span>
              </span>
            ))}
          </span>
        )}
        {v.validatedUtc && <span className="text-muted-foreground">checked {checkedAgo(v.validatedUtc)}</span>}
        {outdated && <span className="font-medium text-amber-700 dark:text-amber-400">Validation is out of date</span>}
        {request.allowedActions.includes('validate') && (
          <Button size="sm" variant="outline" className="ml-auto" disabled={validate.isPending} onClick={() => validate.mutate()}>
            Re-validate
          </Button>
        )}
      </div>
      {validate.error && <ProblemAlert error={validate.error} />}
      {v.reason && <p>{v.reason}</p>}
      {v.errors && v.errors.length > 0 && (
        <ul aria-label="Validation errors" className="list-disc space-y-1 pl-5 text-destructive">
          {v.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {names.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Not in QuickBooks:</span>
          {names.map((n) => (
            <Badge key={n} variant="outline">
              {n}
            </Badge>
          ))}
        </div>
      )}
      {orphans.length > 0 && (
        <div>
          <p className="font-medium">Row not found</p>
          <ul className="list-disc space-y-1 pl-5">
            {orphans.map((f, i) => (
              <li key={`${f.index}-${f.reason}-${i}`}>
                <span className="font-medium">{f.reason}</span>
                {f.detail && <span> {f.detail}</span>}
                <span className="text-muted-foreground"> (index {f.index})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
