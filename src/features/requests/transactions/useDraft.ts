import { useCallback, useEffect, useState } from 'react'
import type { Payload } from '@/api/schema'
import { createDraft, isDirty, type Draft } from './draft'
import { setDraftDirty } from './draftDirtyStore'

/**
 * The draft for one request. It is recreated from the server payload whenever `version` changes (a save, or a
 * reload that brought someone else's version); edits are never merged. Keeps the module-level dirty store in sync.
 */
export function useDraft(id: string, version: string, payload: Payload) {
  const [state, setState] = useState(() => ({ version, draft: createDraft(payload) }))
  let draft = state.draft
  if (state.version !== version) {
    draft = createDraft(payload)
    setState({ version, draft })
  }

  const update = useCallback((fn: (d: Draft) => Draft) => setState((s) => ({ ...s, draft: fn(s.draft) })), [])
  const reset = useCallback(() => setState({ version, draft: createDraft(payload) }), [version, payload])

  const dirty = isDirty(draft)
  useEffect(() => setDraftDirty(id, dirty), [id, dirty])
  useEffect(() => () => setDraftDirty(id, false), [id])

  return { draft, dirty, update, reset }
}
