// Sends the post. Never re-sends it: not after a 401, a timeout, a network error or a double-click.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiTimeoutError } from '@/api/client'
import { ApiError, isGatewayError } from '@/api/problem'
import { requestKeys, useRequest } from '@/api/queries/requests'
import { interpretPost, outcomeFromRequest, waitTitle, type PostOutcome } from './outcome'
import { endFlight, getFlight, startFlight, usePostInFlight } from './postFlightStore'

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
  const updateCount = () => qc.getQueryState(requestKeys.detail(id))?.dataUpdateCount ?? 0
  // A post already in flight for this request (this page was left and reopened): keep watching it.
  const [phase, setPhase] = useState<Phase>(() => (getFlight(id) ? 'watching' : 'idle'))
  // While watching, poll even if a reload failed and the cache does not say posting.
  const q = useRequest(id, { forcePoll: phase === 'watching' })
  const data = q.data
  const [outcome, setOutcome] = useState<PostOutcome | null>(null)
  /** Seconds Post stays disabled after an answer with a wait; the object identity restarts the timer. */
  const [busy, setBusy] = useState<{ seconds: number; text: string } | null>(null)
  // Synchronous guard, module-level so a remount cannot reset it: set before the request starts, cleared only when
  // the outcome is final.
  const inFlight = usePostInFlight(id)
  // Watching: wait for a detail load newer than `watchFrom` (dataUpdateCount) whose status is not posting.
  const watchFrom = useRef(updateCount())
  // Detail loads up to this count belong to an outcome already shown; a stale "posting" there starts no watch.
  const settledAt = useRef(0)

  const invalidateAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: requestKeys.detail(id) })
    void qc.invalidateQueries({ queryKey: requestKeys.attempts(id) })
    void qc.invalidateQueries({ queryKey: [...requestKeys.all, 'list'] })
    void qc.invalidateQueries({ queryKey: requestKeys.stats() })
    void qc.invalidateQueries({ queryKey: ['audit'] })
  }, [qc, id])

  const finish = useCallback(
    (o: PostOutcome) => {
      settledAt.current = qc.getQueryState(requestKeys.detail(id))?.dataUpdateCount ?? 0
      setPhase('idle')
      setOutcome(o)
      if (o.retryAfter) setBusy({ seconds: o.retryAfter, text: o.kind === 'busy' ? o.title : waitTitle(o.retryAfter) })
      endFlight(id)
      invalidateAll()
      if (o.kind !== 'duplicate') {
        const tone = TOAST[o.kind] ?? 'error'
        toast[tone](o.title, { description: o.detail })
      }
    },
    [qc, id, invalidateAll],
  )

  const startWatching = useCallback(() => {
    if (!getFlight(id)) startFlight(id, { sending: false, attemptBefore: undefined })
    watchFrom.current = qc.getQueryState(requestKeys.detail(id))?.dataUpdateCount ?? 0
    setPhase('watching')
  }, [qc, id])

  /** `etag` is the version the person confirmed (pinned when the dialog opened), never whatever is cached now. */
  const post = useCallback(
    (opts: { etag: string; confirmDuplicate?: boolean }) => {
      if (getFlight(id)) return
      const etag = opts.etag
      if (!etag) {
        setOutcome({ kind: 'error', title: NO_ETAG })
        return
      }
      startFlight(id, { sending: true, attemptBefore: data?.request.lastAttempt?.id ?? null })
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
            // A gateway can fail after the API reached QuickBooks, so that answer proves nothing.
            if (e instanceof ApiError && !isGatewayError(e)) {
              finish(interpretPost(e))
              return
            }
            // Timeout, network or gateway error: the post may be running. Do not re-send; reload and watch the status.
            const flight = getFlight(id)
            if (flight) flight.sending = false
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
    // The page that sent the post finished it (this one was reopened meanwhile): its toast was the outcome.
    if (phase === 'watching' && !inFlight) {
      setPhase('idle')
      return
    }
    if (!data) return
    const count = updateCount()
    const flight = getFlight(id)
    if (phase === 'idle' && status === 'posting' && count > settledAt.current && !flight) {
      startWatching()
    } else if (phase === 'watching' && status !== 'posting' && count > watchFrom.current && !flight?.sending) {
      finish(outcomeFromRequest(data.request, flight?.attemptBefore))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check on every detail load
  }, [data, q.dataUpdatedAt, phase, inFlight])

  useEffect(() => {
    if (!busy) return
    const t = setTimeout(() => setBusy(null), busy.seconds * 1000)
    return () => clearTimeout(t)
  }, [busy])

  return {
    post,
    isPosting: phase !== 'idle' || inFlight,
    outcome,
    /** Why Post is disabled after an answer with a wait, or null. */
    waitText: busy?.text ?? null,
  }
}
