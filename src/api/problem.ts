export interface ApiProblem {
  type?: string
  title: string
  status: number
  detail?: string
  code?: string
  [ext: string]: unknown
}

export class ApiError extends Error {
  problem: ApiProblem
  headers: Headers

  constructor(problem: ApiProblem, headers: Headers) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.problem = problem
    this.headers = headers
  }
}

function isProblemBody(v: unknown): v is ApiProblem {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ApiProblem).title === 'string' &&
    typeof (v as ApiProblem).status === 'number'
  )
}

/**
 * Turns a failed response into an ApiError. A post's 503 is a post result, not a problem: its `error` becomes the
 * detail. Any other body is a proxy talking, not the API, so a 5xx says the server could not be reached.
 */
export async function toApiError(res: Response): Promise<ApiError> {
  const title = res.statusText || 'Request failed'
  let body: unknown
  try {
    body = await res.json()
  } catch {
    // not JSON: the fallbacks below
  }
  if (isProblemBody(body)) return new ApiError(body, res.headers)
  const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
  if (typeof error === 'string' && error) return new ApiError({ ...(body as object), title, status: res.status, detail: error }, res.headers)
  if (res.status < 500) return new ApiError({ title, status: res.status }, res.headers)
  const unreached = `Couldn't reach the server (${res.status})`
  return new ApiError(GATEWAY.has(res.status) ? { title: unreached, status: res.status, gateway: true } : { title: unreached, status: res.status }, res.headers)
}

const GATEWAY = new Set([502, 503, 504])

/** A proxy answered instead of the API, so whether the API did the work is not known. */
export const isGatewayError = (e: unknown) => e instanceof ApiError && e.problem.gateway === true

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function problemCode(p: ApiProblem): string | undefined {
  if (typeof p.code === 'string' && p.code) return p.code
  if (p.type) {
    // ASP.NET fills in an RFC link when the API sets no type, and that is not a code.
    const last = p.type.split('/').filter(Boolean).pop()
    if (last && KEBAB.test(last)) return last
  }
  return KEBAB.test(p.title) ? p.title : undefined
}

export function retryAfterSeconds(h: Headers): number | null {
  const v = h.get('Retry-After')
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
