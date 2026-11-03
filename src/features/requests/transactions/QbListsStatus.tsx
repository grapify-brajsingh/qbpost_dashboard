import { useEffect, useState } from 'react'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { toast } from 'sonner'
import { listKeys, startQbListRechecks, useQbLists, useSyncQbLists } from '@/api/queries/lists'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { hasScope, useSession } from '@/auth/useSession'
import { cn } from '@/lib/utils'
import { listsStatus, syncFailure, syncSuccessText, type ListsStatusView } from './qbListsSync'

/** Epoch ms that re-renders each minute, so "12 min ago" ages without another request. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/**
 * How fresh the QuickBooks lists are, and (for editors and admins) a Sync now button (R-16). The draft is never
 * touched: a sync only replaces the lists cache, so "not in QuickBooks" flags update where they stand.
 */
export function QbListsStatus({ className }: { className?: string }) {
  const { me } = useSession()
  const lists = useQbLists()
  const sync = useSyncQbLists()
  const qc = useQueryClient()
  const now = useNow()
  const canSync = hasScope(me, 'requests:edit')
  // Read from the mutation cache, so a sync started before leaving the page still shows after coming back.
  const syncing = useIsMutating({ mutationKey: listKeys.sync }) > 0
  const view = lists.data && listsStatus(lists.data, now)

  async function syncNow() {
    try {
      const body = await sync.mutateAsync()
      toast.success(syncSuccessText(body, me?.id))
    } catch (e) {
      const f = syncFailure(e)
      toast[f.level](f.text)
      if (f.stillRunning) startQbListRechecks(qc)
    }
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 text-xs', className)}>
      <span role="status" aria-live="polite" className="sr-only">
        {lists.isPending ? 'QuickBooks lists…' : (view?.announcement ?? 'QuickBooks lists unavailable')}
      </span>
      <StatusText pending={lists.isPending} view={view} />
      {canSync && (
        <Button type="button" size="xs" variant="ghost" onClick={() => void syncNow()} disabled={syncing}>
          {syncing ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCwIcon aria-hidden />}
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      )}
    </span>
  )
}

function StatusText({ pending, view }: { pending: boolean; view: ListsStatusView | undefined }) {
  if (pending) return <span className="text-muted-foreground">QuickBooks lists…</span>
  // Only with nothing cached: a failed re-read leaves the last good lists in use, so they stay on show.
  if (!view) {
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <TriangleAlertIcon className="size-3" aria-hidden />
        QuickBooks lists unavailable
      </span>
    )
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn('inline-flex items-center gap-1', view.warn ? 'text-warning' : 'text-muted-foreground')}>
            {view.warn && <TriangleAlertIcon className="size-3" aria-hidden />}
            {view.text}
          </span>
        </TooltipTrigger>
        {view.details.length > 0 && (
          <TooltipContent>
            {view.details.map((d) => (
              <p key={d}>{d}</p>
            ))}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
