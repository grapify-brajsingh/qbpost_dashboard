import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError, problemCode } from './problem'

// The single place that reacts to `403 password-change-required`. Every query and mutation error passes through
// the caches below; the session provider subscribes and navigates to /change-password.
const listeners = new Set<() => void>()

export function onPasswordChangeRequired(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function handleError(error: unknown) {
  if (
    error instanceof ApiError &&
    error.problem.status === 403 &&
    problemCode(error.problem) === 'password-change-required'
  ) {
    for (const cb of [...listeners]) cb()
  }
}

export function makeQueryClient(opts: { retry: number | false } = { retry: 1 }): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: { retry: opts.retry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  })
}
