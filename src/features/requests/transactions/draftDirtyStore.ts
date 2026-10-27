import { useSyncExternalStore } from 'react'

// Which requests have unsaved edits on screen. Task 9 sets it; useRequest reads it to avoid refetching under the user.
const dirty = new Set<string>()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useDraftDirty(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => dirty.has(id),
    () => false,
  )
}

export function setDraftDirty(id: string, isDirty: boolean): void {
  if (dirty.has(id) === isDirty) return
  if (isDirty) dirty.add(id)
  else dirty.delete(id)
  emit()
}

export function resetDraftDirty(): void {
  if (dirty.size === 0) return
  dirty.clear()
  emit()
}
