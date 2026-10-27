import { useEffect, useState } from 'react'
import type { Payload, RequestDetail } from '@/api/schema'
import { Textarea } from '@/components/ui/textarea'
import { setDraftDirty } from './draftDirtyStore'
import { SaveBar } from './SaveBar'
import { UnsavedGuard } from './UnsavedGuard'

const isObject = (v: unknown): v is Payload => typeof v === 'object' && v !== null && !Array.isArray(v)

function check(text: string): { payload: Payload } | { error: string } {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return { error: 'Not valid JSON' }
  }
  return isObject(v) ? { payload: v } : { error: 'The payload must be a JSON object' }
}

function ReadErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <ul aria-label="Read errors" className="list-disc space-y-1 pl-5 text-sm text-destructive">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  )
}

/** A payload that can't be shown as a table: its JSON, under the read errors. Editors can fix it as text. */
export function RawJsonEditor({ request, etag }: { request: RequestDetail; etag: string }) {
  const id = String(request.id)
  const editable = request.allowedActions.includes('edit')
  const version = `${request.currentVersion}:${request.status}`
  const loaded = JSON.stringify(request.payload, null, 2)
  const [state, setState] = useState({ version, text: loaded })
  let text = state.text
  if (state.version !== version) {
    // A new version on the server (a save or a reload): start again from it, never merge.
    text = loaded
    setState({ version, text })
  }
  const dirty = editable && text !== loaded
  const checked = check(text)

  useEffect(() => setDraftDirty(id, dirty), [id, dirty])
  useEffect(() => () => setDraftDirty(id, false), [id])

  if (!editable) {
    return (
      <div className="space-y-3">
        <ReadErrors errors={request.readErrors} />
        <pre data-testid="raw-json" className="max-h-[70vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
          {loaded}
        </pre>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <UnsavedGuard dirty={dirty} />
      <ReadErrors errors={request.readErrors} />
      <SaveBar
        id={id}
        etag={etag}
        dirty={dirty}
        canSave={'payload' in checked}
        getPayload={() => ('payload' in checked ? checked.payload : request.payload)}
        onReset={() => setState({ version, text: loaded })}
      />
      <Textarea
        aria-label="Payload JSON"
        aria-invalid={'error' in checked}
        spellCheck={false}
        className="h-[70vh] font-mono text-xs"
        value={text}
        onChange={(e) => setState({ version, text: e.target.value })}
      />
      {'error' in checked && (
        <p role="alert" className="text-sm text-destructive">
          {checked.error}
        </p>
      )}
    </div>
  )
}
