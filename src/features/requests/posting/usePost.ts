// Sends the post. Never re-sends it: not after a 401, a timeout, a network error or a double-click.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiTimeoutError } from '@/api/client'
import { ApiError } from '@/api/problem'
import { requestKeys, useRequest } from '@/api/queries/requests'
import { interpretPost, outcomeFromRequest, type PostOutcome } from './outcome'

/** Client timeout for the post (10 minutes). Tests lower it and restore it afterwards. */
export const postConfig = { timeoutMs: 600_000 }

export const NO_ETAG = "This request can't be posted right now — reload and try again."

type Phase = 'idle' | 'sending' | 'watching'

const TOAST: Partial<Record<PostOutcome['kind'], 'success' | 'warning' | 'error' | 'info'>> = {
  posted: 'success',
  partial: 'warning',
  unknown: 'warning',
  busy: 'warning',
  conflict: 'info',
  stale: 'warning',
}

export function usePost(id: string) {
  const qc = useQueryClient()
  const q = useRequest(id)
  const data = q.data
  const [phase, setPhase] = useState<Phase>('idle')
  const [outcome, setOutcome] = useState<PostOutcome | null>(null)
  /** Seconds Post stays disabled after a busy answer; the object identity restarts the timer. */
  const [busy, setBusy] = useState<{ seconds: number } | null>(null)
  // Synchronous guard: set before the request starts, cleared only when the outcome is final.
  const inFlight = useRef(false)
  // Watching: wait for a detail load newer than `watchFrom` (dataUpdateCount) whose status is not posting.
  const watchFrom = useRef(0)
  const attemptBefore = useRef<number | null | undefined>(undefined)
  // Detail loads up to this count belong to an outcome already shown; a stale "posting" there starts no watch.
  const settledAt = useRef(0)

  const updateCount = () => qc.getQueryState(requestKeys.detail(id))?.dataUpdateCount ?? 0

  const invalidateAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: requestKeys.detail(id) })
    void qc.invalidateQueries({ queryKey: requestKeys.attempts(id) })
    void qc.invalidateQueries({ queryKey: requestKeys.events(id) })
    void qc.invalidateQueries({ queryKey: [...requestKeys.all, 'list'] })
    void qc.invalidateQueries({ queryKey: requestKeys.stats() })
  }, [qc, id])

  const finish = useCallback(
    (o: PostOutcome) => {
      inFlight.current = false
      settledAt.current = qc.getQueryState(requestKeys.detail(id))?.dataUpdateCount ?? 0
      setPhase('idle')
      setOutcome(o)
      if (o.kind === 'busy' && o.retryAfter) setBusy({ seconds: o.retryAfter })
      invalidateAll()
      if (o.kind !== 'duplicate') {
        const tone = TOAST[o.kind] ?? 'error'
        toast[tone](o.title, { description: o.detail })
      }
    },
    [qc, id, invalidateAll],
  )

  const startWatching = useCallback(() => {
    inFlight.current = true
    watchFrom.current = qc.getQueryState(requestKeys.detail(id))?.dataUpdateCount ?? 0
    setPhase('watching')
  }, [qc, id])

  const post = useCallback(
    (opts: { confirmDuplicate?: boolean } = {}) => {
      if (inFlight.current) return
      const etag = data?.etag ?? ''
      if (!etag) {
        setOutcome({ kind: 'error', title: NO_ETAG })
        return
      }
      inFlight.current = true
      attemptBefore.current = data?.request.lastAttempt?.id ?? null
      setPhase('sending')
      setOutcome(null)
      const body = opts.confirmDuplicate ? { confirmDuplicate: true } : {}
      api
        .post<unknown>(`/saved-requests/${id}/post`, body, {
          headers: { 'If-Match': etag },
          noAuthRetry: true,
          timeoutMs: postConfig.timeoutMs,
        })
        .then(
          (res) => finish(interpretPost({ status: res.status, body: res.data, headers: res.headers })),
          (e: unknown) => {
            if (e instanceof ApiError) {
              finish(interpretPost(e))
              return
            }
            // Timeout or network error: the post may be running. Do not re-send; reload and watch the status.
            setOutcome(
              e instanceof ApiTimeoutError
                ? interpretPost(e)
                : { kind: 'timeout', title: 'Lost contact with the server. Checking whether the post went through…' },
            )
            startWatching()
            void qc.invalidateQueries({ queryKey: requestKeys.detail(id), exact: true })
          },
        )
    },
    [data, id, qc, finish, startWatching],
  )

  // Recovery: a load showing `posting` (reopened page, or after a 409 already-posting) starts a watch; the first
  // newer load that is no longer posting ends it with the outcome of the latest attempt.
  const status = data?.request.status
  useEffect(() => {
    if (!data) return
    const count = updateCount()
    if (phase === 'idle' && status === 'posting' && count > settledAt.current) {
      attemptBefore.current = undefined
      startWatching()
    } else if (phase === 'watching' && status !== 'posting' && count > watchFrom.current) {
      finish(outcomeFromRequest(data.request, attemptBefore.current))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check on every detail load
  }, [data, q.dataUpdatedAt, phase])

  useEffect(() => {
    if (!busy) return
    const t = setTimeout(() => setBusy(null), busy.seconds * 1000)
    return () => clearTimeout(t)
  }, [busy])

  return {
    post,
    isPosting: phase !== 'idle',
    outcome,
    /** Seconds Post is disabled after a busy answer, or null. */
    busyFor: busy?.seconds ?? null,
  }
}
