import { useSyncExternalStore } from 'react'

// Which requests have a post in flight in this tab, outside any component: leaving the page and coming back (or a
// remount) must never allow a second send. An entry is added before the POST starts and removed only when the
// outcome is final (usePost's finish).
export interface Flight {
  /** True while the POST itself has not answered. A status reload must not end the watch before then. */
  sending: boolean
  /** The latest attempt before the post (undefined when unknown, e.g. the page was reopened while posting). */
  attemptBefore: number | null | undefined
}

const flights = new Map<string, Flight>()
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

export function usePostInFlight(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => flights.has(id),
    () => false,
  )
}

export const getFlight = (id: string): Flight | undefined => flights.get(id)

export function startFlight(id: string, flight: Flight): void {
  flights.set(id, flight)
  emit()
}

export function endFlight(id: string): void {
  if (flights.delete(id)) emit()
}

export function resetPostFlights(): void {
  if (flights.size === 0) return
  flights.clear()
  emit()
}
