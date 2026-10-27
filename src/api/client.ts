// Fetch wrapper for every API call: relative /api/v1 URLs, bearer token, problem → ApiError,
// and 401 → refresh once → retry once. Calls marked `noAuthRetry` (the post) are never re-sent.

import { toApiError } from './problem'
import { getAccessToken, refreshSession } from './session'

const BASE = '/api/v1'

/** A 401 from these means the credentials or session were rejected: never refresh, never re-send. */
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/change-password'])

export class ApiTimeoutError extends Error {
  constructor() {
    super('The request timed out.')
    this.name = 'ApiTimeoutError'
  }
}

export type ApiInit = RequestInit & {
  /** On 401, refresh the session but re-throw the 401 instead of re-sending the request. */
  noAuthRetry?: boolean
  timeoutMs?: number
}

export interface ApiResponse<T> {
  data: T
  headers: Headers
  status: number
}

export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<ApiResponse<T>> {
  const { noAuthRetry, timeoutMs, ...requestInit } = init

  let res = await send(path, requestInit, timeoutMs, getAccessToken())
  if (res.status === 401 && !NO_REFRESH_PATHS.has(path.split('?')[0])) {
    const first = await toApiError(res)
    const token = await refreshSession()
    if (noAuthRetry || token === null) throw first
    res = await send(path, requestInit, timeoutMs, token)
  }
  if (!res.ok) throw await toApiError(res)
  return { data: (await readBody(res, timeoutMs)) as T, headers: res.headers, status: res.status }
}

async function send(path: string, init: RequestInit, timeoutMs: number | undefined, token: string | null) {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const timeout = timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs)
  const signal = timeout && init.signal ? AbortSignal.any([timeout, init.signal]) : (timeout ?? init.signal)
  try {
    return await fetch(`${BASE}${path}`, { ...init, headers, signal, credentials: 'same-origin' })
  } catch (e) {
    if (timeout?.aborted) throw new ApiTimeoutError()
    throw e
  }
}

async function readBody(res: Response, timeoutMs: number | undefined): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined
  try {
    const text = await res.text()
    return text === '' ? undefined : (JSON.parse(text) as unknown)
  } catch (e) {
    if (timeoutMs !== undefined && e instanceof DOMException && e.name === 'TimeoutError') throw new ApiTimeoutError()
    throw e
  }
}

type Body = BodyInit | object | null | undefined

function isPlainObject(v: unknown): v is object {
  if (typeof v !== 'object' || v === null) return false
  if (Array.isArray(v)) return true
  const proto: unknown = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function withBody(method: string, body: Body, init: ApiInit = {}): ApiInit {
  if (!isPlainObject(body)) return { ...init, method, body: body as BodyInit | null | undefined }
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  return { ...init, method, headers, body: JSON.stringify(body) }
}

export const api = {
  get: <T>(path: string, init?: ApiInit) => apiFetch<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: Body, init?: ApiInit) => apiFetch<T>(path, withBody('POST', body, init)),
  put: <T>(path: string, body?: Body, init?: ApiInit) => apiFetch<T>(path, withBody('PUT', body, init)),
  patch: <T>(path: string, body?: Body, init?: ApiInit) => apiFetch<T>(path, withBody('PATCH', body, init)),
}
