import { http, HttpResponse } from 'msw'
import { mockControl, mockDb } from '../db'
import { API, authenticate, nowUtc, problem } from './common'

export const supportHandlers = [
  http.get(`${API}/quickbooks/lists`, ({ request }) => {
    const auth = authenticate(request, 'lists:read', { ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    return HttpResponse.json(mockDb.lists)
  }),

  http.get(`${API}/health/database`, ({ request }) => {
    const auth = authenticate(request, 'requests:read', { ignoreDatabaseDown: true })
    if ('error' in auth) return auth.error
    if (mockControl.databaseDown) {
      return problem(503, 'database-unavailable', 'Database unavailable', 'The database is not reachable.', {}, {
        'Retry-After': '30',
      })
    }
    return HttpResponse.json({ status: 'ok', checkedUtc: nowUtc() })
  }),
]
