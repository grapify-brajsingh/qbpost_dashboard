import { useState } from 'react'
import { useVersion, useVersions } from '@/api/queries/requests'
import type { Txn } from '@/api/schema'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Timestamp } from '@/components/Timestamp'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { changeSentence } from './changeSentence'
import { OriginalViewer } from './OriginalViewer'

function VersionChanges({ requestId, number }: { requestId: string; number: number }) {
  const q = useVersion(requestId, number)
  if (q.isPending) return <Skeleton className="h-16" />
  if (q.data === undefined) return <ProblemAlert error={q.error} />
  const rows = Array.isArray(q.data.payload.transactions) ? (q.data.payload.transactions as Txn[]) : undefined
  if (q.data.changes.length === 0) return <p className="text-sm text-muted-foreground">No changes (original version).</p>
  return (
    <ul aria-label={`Changes in version ${number}`} className="space-y-2 text-sm">
      {q.data.changes.map((c, i) => {
        const s = changeSentence(c, rows)
        return (
          <li key={i}>
            {s.details === undefined ? (
              s.text
            ) : (
              <details>
                <summary className="cursor-pointer">{s.text}</summary>
                <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(s.details, null, 2)}</pre>
              </details>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function VersionsTab({ requestId }: { requestId: string }) {
  const q = useVersions(requestId)
  const [picked, setPicked] = useState<number | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  if (q.isPending) return <Skeleton className="h-24" />
  if (q.data === undefined) return <ProblemAlert error={q.error} />

  const selected = picked ?? q.data[0]?.number ?? null
  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" size="sm" onClick={() => setShowOriginal(true)}>
        View original
      </Button>
      <OriginalViewer requestId={requestId} open={showOriginal} onOpenChange={setShowOriginal} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul aria-label="Versions" className="space-y-2">
          {q.data.map((v) => (
            <li key={v.number}>
              <button
                type="button"
                aria-pressed={v.number === selected}
                onClick={() => setPicked(v.number)}
                className={cn('w-full rounded-md border p-3 text-left text-sm transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40', v.number === selected && 'border-primary/50 bg-primary-soft hover:bg-primary-soft')}
              >
                <span className="font-medium">v{v.number}</span> · {v.created.by.name} · <Timestamp utc={v.created.utc} />
                {v.note && <span className="block text-muted-foreground">{v.note}</span>}
                <span className="block text-xs text-muted-foreground">
                  {v.changeCount} {v.changeCount === 1 ? 'change' : 'changes'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div>{selected !== null && <VersionChanges key={selected} requestId={requestId} number={selected} />}</div>
      </div>
    </div>
  )
}
