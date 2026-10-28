import '@testing-library/jest-dom/vitest'
import { transferableAbortController } from 'node:util'
import { mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { resetDraftDirty } from '@/features/requests/transactions/draftDirtyStore'
import { resetPostFlights } from '@/features/requests/posting/postFlightStore'

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

// Node's fetch cannot send jsdom's FormData: it would send "[object FormData]", and its own FormData checks parts
// against the global Blob, which is jsdom's here. So write the multipart body as bytes, exactly as a browser sends it.
const CRLF = '\r\n'

async function toMultipart(init: RequestInit & { body: FormData }): Promise<RequestInit> {
  const boundary = `----vitest-${crypto.randomUUID()}`
  const chunks: Buffer[] = []
  for (const [name, value] of init.body.entries()) {
    const head =
      typeof value === 'string'
        ? `Content-Disposition: form-data; name="${name}"`
        : `Content-Disposition: form-data; name="${name}"; filename="${value.name}"${CRLF}Content-Type: ${value.type || 'application/octet-stream'}`
    chunks.push(Buffer.from(`--${boundary}${CRLF}${head}${CRLF}${CRLF}`, 'latin1'))
    chunks.push(typeof value === 'string' ? Buffer.from(value) : await readBlob(value))
    chunks.push(Buffer.from(CRLF))
  }
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`))
  const headers = new Headers(init.headers)
  headers.set('Content-Type', `multipart/form-data; boundary=${boundary}`)
  return { ...init, headers, body: Buffer.concat(chunks) }
}

/** A jsdom Blob's bytes (it has no arrayBuffer()); read as a binary string so no foreign-realm ArrayBuffer is involved. */
function readBlob(blob: Blob): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(Buffer.from(reader.result as string, 'latin1'))
    reader.onerror = () => reject(reader.error)
    reader.readAsBinaryString(blob)
  })
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
  globalThis.fetch = async (input, init) => {
    const bridged = init?.body instanceof FormData ? await toMultipart(init as RequestInit & { body: FormData }) : init
    return unbridgedFetch(input, bridged?.signal ? { ...bridged, signal: toNodeSignal(bridged.signal) } : bridged)
  }
})
afterEach(() => {
  server.resetHandlers()
  mockDb.reset()
  resetDraftDirty()
  resetPostFlights()
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

// jsdom lays nothing out, so Recharts' responsive container always measures 0 × 0 and says so. Drop exactly that.
const consoleWarn = console.warn
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('The width(0) and height(0) of chart should be greater than 0')) return
  consoleWarn(...args)
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
