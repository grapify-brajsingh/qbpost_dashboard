import { useCallback, useEffect, useState } from 'react'
import type { Payload } from '@/api/schema'
import { createDraft, isDirty, type Draft } from './draft'
import { setDraftDirty } from './draftDirtyStore'

/**
 * The draft for one request. It is recreated from the server payload whenever the request id or `version` changes
 * (another request, a save, or a reload that brought someone else's version); edits are never merged. Keeps the module-level dirty store in sync.
 */
export function useDraft(id: string, version: string, payload: Payload) {
  const key = `${id}:${version}`
  const [state, setState] = useState(() => ({ key, draft: createDraft(payload) }))
  let draft = state.draft
  if (state.key !== key) {
    draft = createDraft(payload)
    setState({ key, draft })
  }

  const update = useCallback((fn: (d: Draft) => Draft) => setState((s) => ({ ...s, draft: fn(s.draft) })), [])
  const reset = useCallback(() => setState({ key, draft: createDraft(payload) }), [key, payload])

  const dirty = isDirty(draft)
  useEffect(() => setDraftDirty(id, dirty), [id, dirty])
  useEffect(() => () => setDraftDirty(id, false), [id])

  return { draft, dirty, update, reset }
}
