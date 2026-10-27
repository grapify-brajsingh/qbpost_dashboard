import '@testing-library/jest-dom/vitest'
import { transferableAbortController } from 'node:util'
import { mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'

// jsdom replaces AbortController/AbortSignal, but fetch/Request stay Node's (undici), which rejects jsdom signals
// ("Expected signal to be an instance of AbortSignal"). Use Node's own classes so `signal` works with fetch.
const nodeController = transferableAbortController()
globalThis.AbortController = nodeController.constructor as typeof AbortController
globalThis.AbortSignal = Object.getPrototypeOf(nodeController.signal).constructor as typeof AbortSignal

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  mockDb.reset()
})
afterAll(() => server.close())
