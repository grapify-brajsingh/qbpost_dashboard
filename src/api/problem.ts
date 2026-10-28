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

/** Turns a failed response into an ApiError. A non-problem body becomes `{ title, status }`. */
export async function toApiError(res: Response): Promise<ApiError> {
  let problem: ApiProblem = { title: res.statusText || 'Request failed', status: res.status }
  try {
    const body: unknown = await res.json()
    if (isProblemBody(body)) problem = body
  } catch {
    // not JSON: keep the fallback
  }
  return new ApiError(problem, res.headers)
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function problemCode(p: ApiProblem): string | undefined {
  if (typeof p.code === 'string' && p.code) return p.code
  if (p.type) {
    const last = p.type.split('/').filter(Boolean).pop()
    if (last) return last
  }
  return KEBAB.test(p.title) ? p.title : undefined
}

export function retryAfterSeconds(h: Headers): number | null {
  const v = h.get('Retry-After')
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
