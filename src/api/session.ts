// Access-token store (memory only) and the refresh coordinator.
// Within a tab, concurrent refreshes share one promise. Across tabs, refresh runs inside a Web Lock and the
// result is shared over a BroadcastChannel, so two tabs never present the same (rotated) refresh cookie at once.

const LOCK_NAME = 'qbpost-refresh'
const CHANNEL_NAME = 'qbpost-session'
const REFRESH_URL = '/api/v2/auth/refresh'

type SessionMessage = { type: 'token'; token: string } | { type: 'ended' }

let accessToken: string | null = null
/** Bumped whenever a new token is stored, so a queued refresh can see that another tab already refreshed. */
let tokenGeneration = 0
/** A signed-in session ended without the user asking. Cleared by the next sign-in. */
let sessionLost = false
let inFlight: Promise<string | null> | null = null
const endedListeners = new Set<() => void>()

const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)

if (channel) {
  channel.onmessage = (e: MessageEvent<SessionMessage>) => {
    const msg = e.data
    if (msg?.type === 'token' && typeof msg.token === 'string') {
      storeToken(msg.token)
    } else if (msg?.type === 'ended') {
      sessionLost = accessToken !== null
      accessToken = null
      notifyEnded()
    }
  }
}

function storeToken(t: string | null) {
  accessToken = t
  if (t !== null) {
    tokenGeneration++
    sessionLost = false
  }
}

function broadcast(msg: SessionMessage) {
  channel?.postMessage(msg)
}

function notifyEnded() {
  for (const cb of [...endedListeners]) cb()
}

export const wasSessionLost = () => sessionLost

export function getAccessToken(): string | null {
  return accessToken
}

/** Stores the token. With `broadcast`, other tabs receive it (a null token tells them the session ended). */
export function setAccessToken(t: string | null, opts: { broadcast?: boolean } = {}): void {
  storeToken(t)
  if (opts.broadcast) broadcast(t === null ? { type: 'ended' } : { type: 'token', token: t })
}

/** Called when the session ends (refresh rejected here or in another tab). Returns an unsubscribe function. */
export function onSessionEnded(cb: () => void): () => void {
  endedListeners.add(cb)
  return () => {
    endedListeners.delete(cb)
  }
}

/** Gets a new access token, or null when the session could not be refreshed. Never rejects. */
export function refreshSession(): Promise<string | null> {
  if (!inFlight) {
    const startGeneration = tokenGeneration
    const work = () => refreshOnce(startGeneration)
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
    const run = locks ? locks.request(LOCK_NAME, work) : work()
    inFlight = run.finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

async function refreshOnce(startGeneration: number): Promise<string | null> {
  // Another tab refreshed while this one waited for the lock: use its token.
  if (tokenGeneration !== startGeneration && accessToken !== null) return accessToken

  let res: Response
  try {
    res = await fetch(REFRESH_URL, { method: 'POST', credentials: 'same-origin' })
  } catch {
    // Network failure: the session may still be valid, so do not end it.
    return null
  }

  if (!res.ok) {
    if (sessionRejected(res.status)) {
      sessionLost = accessToken !== null
      accessToken = null
      broadcast({ type: 'ended' })
      notifyEnded()
    }
    return null
  }

  try {
    const body = (await res.json()) as { accessToken?: unknown }
    if (typeof body.accessToken !== 'string') return null
    setAccessToken(body.accessToken, { broadcast: true })
    return body.accessToken
  } catch {
    return null
  }
}

/** A 4xx (other than 429) means the refresh cookie is gone or revoked; 5xx and 429 are transient. */
function sessionRejected(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429
}
