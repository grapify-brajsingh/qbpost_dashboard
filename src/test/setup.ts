import '@testing-library/jest-dom/vitest'
import { transferableAbortController } from 'node:util'
import { mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'

// jsdom provides its own AbortController/AbortSignal (needed by jsdom's EventTarget), but fetch/Request are
// Node's (undici), which rejects jsdom signals. Bridge at the fetch boundary only: forward a jsdom signal in
// `init` to a fresh Node AbortController. Installed after msw so it wraps msw's patched fetch.
const NodeAbortController = transferableAbortController().constructor as typeof AbortController
const NodeAbortSignal = Object.getPrototypeOf(new NodeAbortController().signal).constructor as typeof AbortSignal

function toNodeSignal(signal: AbortSignal): AbortSignal {
  if (Object.getPrototypeOf(signal) === NodeAbortSignal.prototype) return signal
  const c = new NodeAbortController()
  if (signal.aborted) c.abort(signal.reason)
  else signal.addEventListener('abort', () => c.abort(signal.reason), { once: true })
  return c.signal
}

let unbridgedFetch: typeof fetch

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  unbridgedFetch = globalThis.fetch
  globalThis.fetch = (input, init) =>
    unbridgedFetch(input, init?.signal ? { ...init, signal: toNodeSignal(init.signal) } : init)
})
afterEach(() => {
  server.resetHandlers()
  mockDb.reset()
})
afterAll(() => {
  globalThis.fetch = unbridgedFetch
  server.close()
})
