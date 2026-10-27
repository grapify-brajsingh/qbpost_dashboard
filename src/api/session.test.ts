import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockControl } from '@/mocks/db'
import { server } from '@/mocks/server'

type SessionModule = typeof import('./session')

/** In-memory BroadcastChannel shared by every module instance: delivers to other channels of the same name. */
class FakeChannel {
  static open = new Set<FakeChannel>()
  name: string
  onmessage: ((e: MessageEvent) => void) | null = null

  constructor(name: string) {
    this.name = name
    FakeChannel.open.add(this)
  }

  postMessage(data: unknown) {
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) {
        queueMicrotask(() => other.onmessage?.({ data } as MessageEvent))
      }
    }
  }

  close() {
    FakeChannel.open.delete(this)
  }
}

/** Fake Web Locks: one serialising async mutex per lock name, shared by every "tab". */
function fakeLocks() {
  const tails = new Map<string, Promise<unknown>>()
  return {
    request<T>(name: string, cb: () => Promise<T>): Promise<T> {
      const run = (tails.get(name) ?? Promise.resolve()).then(() => cb())
      tails.set(name, run.catch(() => undefined))
      return run
    },
  }
}

/** A fresh module instance, as if loaded by another browser tab. */
async function openTab(): Promise<SessionModule> {
  vi.resetModules()
  return import('./session')
}

function countRefreshes() {
  let n = 0
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/v1/auth/refresh') n++
  })
  return () => n
}

function setLocks(locks: unknown) {
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true, writable: true })
}

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  mockControl.signInAs('u-admin')
})

afterEach(() => {
  server.events.removeAllListeners()
  FakeChannel.open.clear()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('refreshSession', () => {
  it('two tabs refreshing at once call the API once', async () => {
    setLocks(fakeLocks())
    const tabA = await openTab()
    const tabB = await openTab()
    expect(tabA).not.toBe(tabB)
    const refreshes = countRefreshes()

    const [a, b] = await Promise.all([tabA.refreshSession(), tabB.refreshSession()])

    expect(refreshes()).toBe(1)
    expect(a).toBe('mock-token-u-admin-1')
    expect(b).toBe(a)
    expect(tabA.getAccessToken()).toBe(a)
    expect(tabB.getAccessToken()).toBe(a)
  })

  it('without navigator.locks, concurrent calls in a tab share one refresh', async () => {
    setLocks(undefined)
    const tab = await openTab()
    const refreshes = countRefreshes()
    const [a, b, c] = await Promise.all([tab.refreshSession(), tab.refreshSession(), tab.refreshSession()])
    expect(refreshes()).toBe(1)
    expect(new Set([a, b, c])).toEqual(new Set(['mock-token-u-admin-1']))
    // Cleared once settled: a later call refreshes again.
    expect(await tab.refreshSession()).toBe('mock-token-u-admin-2')
    expect(refreshes()).toBe(2)
  })

  it('refresh failure ends the session in this tab and the others', async () => {
    setLocks(fakeLocks())
    const tabA = await openTab()
    const tabB = await openTab()
    tabA.setAccessToken('mock-token-u-admin-0')
    tabB.setAccessToken('mock-token-u-admin-0')
    const endedA = vi.fn()
    const endedB = vi.fn()
    tabA.onSessionEnded(endedA)
    const offB = tabB.onSessionEnded(endedB)
    mockControl.endSession()

    expect(await tabA.refreshSession()).toBeNull()
    await Promise.resolve()

    expect(endedA).toHaveBeenCalledTimes(1)
    expect(endedB).toHaveBeenCalledTimes(1)
    expect(tabA.getAccessToken()).toBeNull()
    expect(tabB.getAccessToken()).toBeNull()

    offB()
    tabA.setAccessToken(null, { broadcast: true })
    await Promise.resolve()
    expect(endedB).toHaveBeenCalledTimes(1)
  })

  it('setAccessToken broadcasts only when asked', async () => {
    const tabA = await openTab()
    const tabB = await openTab()
    tabA.setAccessToken('t1')
    await Promise.resolve()
    expect(tabB.getAccessToken()).toBeNull()
    tabA.setAccessToken('t2', { broadcast: true })
    await Promise.resolve()
    expect(tabB.getAccessToken()).toBe('t2')
  })
})
