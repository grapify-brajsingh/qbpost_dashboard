import '@testing-library/jest-dom/vitest'
import { transferableAbortController } from 'node:util'
import { mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { resetDraftDirty } from '@/features/requests/transactions/draftDirtyStore'

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
let unbridgedRequest: typeof Request

// react-router builds a `new Request(url, { signal })` with jsdom's signal on every client-side navigation.
class BridgedRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init?.signal ? { ...init, signal: toNodeSignal(init.signal) } : init)
  }
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  unbridgedRequest = globalThis.Request
  globalThis.Request = BridgedRequest
  unbridgedFetch = globalThis.fetch
  globalThis.fetch = (input, init) =>
    unbridgedFetch(input, init?.signal ? { ...init, signal: toNodeSignal(init.signal) } : init)
})
afterEach(() => {
  server.resetHandlers()
  mockDb.reset()
  resetDraftDirty()
})
afterAll(() => {
  globalThis.fetch = unbridgedFetch
  globalThis.Request = unbridgedRequest
  server.close()
})

// jsdom has no matchMedia; next-themes reads it to resolve the "system" theme.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// next-themes renders an inline <script> (flash-of-theme guard); React 19 warns about it on the client.
// It is harmless here, so drop exactly that message and nothing else.
const consoleError = console.error
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Encountered a script tag while rendering React component')) return
  consoleError(...args)
}

// jsdom has no ResizeObserver; Radix (tooltip, popper) measures with it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom has no scrollIntoView; cmdk scrolls the highlighted option into view.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}
