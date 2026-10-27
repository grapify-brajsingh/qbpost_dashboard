import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError } from '@/api/problem'
import { useRequest } from '@/api/queries/requests'
import { ProblemAlert } from '@/components/ProblemAlert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TransactionsTab } from '../transactions/TransactionsTab'
import { RequestHeader } from './RequestHeader'
import { StatusBanner } from './StatusBanner'

const TABS = [
  { value: 'transactions', label: 'Transactions' },
  { value: 'versions', label: 'Versions' },
  { value: 'attempts', label: 'Attempts' },
  { value: 'history', label: 'History' },
] as const

export function RequestDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const q = useRequest(id)

  if (q.isPending) return <Skeleton className="m-6 h-40" />
  if (q.data === undefined) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) {
      return (
        <div className="p-6">
          <h1 className="text-xl font-semibold">Request not found</h1>
          <Link className="underline" to="/requests">
            Back to Requests
          </Link>
        </div>
      )
    }
    return (
      <div className="p-6">
        <ProblemAlert error={q.error} />
      </div>
    )
  }

  const { request, etag } = q.data
  const requested = params.get('tab')
  const tab = TABS.find((t) => t.value === requested)?.value ?? 'transactions'

  return (
    <div className="space-y-4 p-6">
      {q.error && <ProblemAlert error={q.error} />}
      {/* Tasks 10/11 wire the dialogs. */}
      <RequestHeader request={request} onAction={() => {}} />
      <StatusBanner request={request} />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p)
              if (v === 'transactions') next.delete('tab')
              else next.set('tab', v)
              return next
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          // The transactions tab stays mounted (hidden) so unsaved edits survive a tab switch; keyed by request so
          // nothing (draft, note, dialogs) carries over to another request.
          <TabsContent
            key={t.value}
            value={t.value}
            forceMount={t.value === 'transactions' ? true : undefined}
            hidden={t.value !== tab}
          >
            {t.value === 'transactions' ? (
              <TransactionsTab key={request.id} request={request} etag={etag} />
            ) : (
              <p className="text-sm text-muted-foreground">Coming soon</p>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
