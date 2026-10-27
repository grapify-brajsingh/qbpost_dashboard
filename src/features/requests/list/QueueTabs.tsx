import type { Stats } from '@/api/schema'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { countFor, QUEUE_TABS, type QueueTab } from './queue'

export function QueueTabs({
  value,
  stats,
  onChange,
}: {
  value: QueueTab
  stats: Stats | undefined
  onChange: (tab: QueueTab) => void
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as QueueTab)}>
      <TabsList>
        {QUEUE_TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id}>
            {t.label}
            {stats && (
              <>
                {' '}
                <span className="text-muted-foreground tabular-nums">{countFor(t.id, stats)}</span>
              </>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
