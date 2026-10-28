import { useRequest } from '@/api/queries/requests'
import { PushId } from '@/components/PushId'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VersionsTab } from '@/features/requests/versions/VersionsTab'
import { HistoryTimeline } from './HistoryTimeline'
import { ResultsTab } from './ResultsTab'
import { useStatementSheet, type SheetTab } from './useStatementSheet'

function Heading({ id }: { id: number }) {
  const q = useRequest(String(id))
  const d = q.data?.request
  return (
    <SheetHeader>
      <SheetTitle>{d ? (d.email?.subject ?? d.publicRef) : `Statement ${id}`}</SheetTitle>
      <SheetDescription asChild>
        <div>{d ? <PushId value={d.pushId} fallback={d.publicRef} /> : null}</div>
      </SheetDescription>
    </SheetHeader>
  )
}

/** Mount once on a page that opens it; open and close through `useStatementSheet`. */
export function StatementSheet() {
  const { id, tab, close, setTab } = useStatementSheet()
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {id !== null && (
          <>
            <Heading id={id} />
            <Tabs value={tab} onValueChange={(t) => setTab(t as SheetTab)} className="px-4 pb-4">
              <TabsList>
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="versions">Versions</TabsTrigger>
              </TabsList>
              <TabsContent value="results" className="pt-3">
                <ResultsTab requestId={id} />
              </TabsContent>
              <TabsContent value="history" className="pt-3">
                <HistoryTimeline requestId={id} />
              </TabsContent>
              <TabsContent value="versions" className="pt-3">
                <VersionsTab requestId={String(id)} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
