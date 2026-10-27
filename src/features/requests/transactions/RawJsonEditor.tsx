import type { Payload } from '@/api/schema'

/** Read-only for now: pretty-printed JSON as text, under the list of read errors. */
export function RawJsonEditor({ payload, readErrors }: { payload: Payload; readErrors: string[] }) {
  return (
    <div className="space-y-3">
      {readErrors.length > 0 && (
        <ul aria-label="Read errors" className="list-disc space-y-1 pl-5 text-sm text-destructive">
          {readErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <pre data-testid="raw-json" className="max-h-[70vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  )
}
