import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { AuditEvent, Page } from '@/api/schema'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

const FEED = '/api/v2/audit-events'

const local = (daysAgo: number, h: number, min = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, min, 0, 0)
  return d.toISOString()
}

const request = { id: 12, publicRef: 'SR-000012', reference: 'chase-2026-08', pushId: '7f3a9c1e-5b2d-4e6a-9d10-3c8b1a2e4f01', emailSubject: 'Chase' }

const event = (id: string, over: Partial<AuditEvent> = {}): AuditEvent => ({
  id,
  atUtc: local(0, 9),
  actor: { id: 'u-admin', name: 'Asha K', kind: 'user' },
  action: 'row-edited',
  request,
  row: { externalId: 'row-7', index: 6 },
  field: 'payee',
  old: 'ABC Plumbing',
  new: 'ABC Plumbing LLC',
  versionNumber: 2,
  detail: null,
  ...over,
})

let seen: URL[] = []
function feed(items: AuditEvent[], total = items.length) {
  server.use(
    http.get(FEED, ({ request: r }) => {
      seen.push(new URL(r.url))
      return HttpResponse.json({ items, page: 1, pageSize: 50, total } satisfies Page<AuditEvent>)
    }),
  )
}
function open(route = '/audit', as = 'u-admin') {
  mockControl.signInAs(as)
  seen = []
  return renderApp(route)
}
const lastQuery = () => seen[seen.length - 1].searchParams

describe('Audit trail page', () => {
  test('groups by local day with Today / Yesterday labels, newest first', async () => {
    feed([event('a', { atUtc: local(0, 9) }), event('b', { atUtc: local(1, 16) }), event('c', { atUtc: local(0, 14) })])
    open()
    await screen.findByRole('table', { name: 'Audit trail' })
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent(/^Today, \d+ \w+$/)
    expect(rows[1]).toHaveTextContent('14:00')
    expect(rows[2]).toHaveTextContent('09:00')
    expect(rows[3]).toHaveTextContent(/^Yesterday, \d+ \w+$/)
  })

  test('row-edited shows field, old struck through and new; row-added shows the row in one line', async () => {
    feed([
      event('a'),
      event('b', {
        action: 'row-added',
        field: null,
        old: null,
        new: { date: '2026-08-30', kind: 'Check', payee: 'Acme', account: 'Chase', amount: 12 },
      }),
    ])
    open()
    const old = await screen.findByText('ABC Plumbing')
    expect(old).toHaveClass('line-through')
    expect(screen.getByText('ABC Plumbing LLC')).not.toHaveClass('line-through')
    expect(screen.getByText('payee')).toBeInTheDocument()
    expect(screen.getByText('2026-08-30 · Check · Acme · Chase · 12')).toBeInTheDocument()
  })

  test('hostile old/new render as text, truncated with a tooltip', async () => {
    const big = 'x'.repeat(10_000)
    feed([
      event('a', { old: '<img src=x onerror=alert(1)>', new: '=cmd|calc' }),
      event('b', { old: big, new: { payee: '<script>alert(1)</script>', amount: 5 } }),
    ])
    open()
    const html = await screen.findByText('<img src=x onerror=alert(1)>')
    expect(html).toHaveAttribute('title', '<img src=x onerror=alert(1)>')
    expect(screen.getByText('=cmd|calc')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Audit trail' }).querySelector('img, script')).toBeNull()
    const cut = screen.getByText(`${'x'.repeat(80)}…`)
    expect(cut).toHaveAttribute('title', big)
    expect(screen.getByText('<script>alert(1)</script> · 5')).toBeInTheDocument()
  })

  test('statement cell links to /statements/:id; row cell links to /statements/:id?row=<externalId>', async () => {
    feed([event('a', { row: { externalId: 'dash-a b', index: 134 } })])
    open()
    const statement = await screen.findByRole('link', { name: /chase-2026-08/ })
    expect(statement).toHaveAttribute('href', '/statements/12')
    expect(statement).toHaveTextContent('7f3a…f01')
    expect(screen.getByRole('link', { name: '135' })).toHaveAttribute('href', '/statements/12?row=dash-a%20b')
  })

  test('filters round-trip through the URL; Export CSV sends the same filters with the token', async () => {
    feed([event('a')])
    const { router } = open('/audit?q=plumb&actor=u-admin&from=2026-10-20&to=2026-10-21&requestId=12&reference=chase&action=row-edited,posted')
    await screen.findByRole('table', { name: 'Audit trail' })
    const q = lastQuery()
    expect(q.get('q')).toBe('plumb')
    expect(q.get('actor')).toBe('u-admin')
    expect(q.get('requestId')).toBe('12')
    expect(q.get('reference')).toBe('chase')
    expect(q.getAll('action')).toEqual(['row-edited', 'posted'])
    // local midnight of the first day through local midnight after the last day
    expect(q.get('from')).toBe(new Date(2026, 9, 20).toISOString())
    expect(q.get('to')).toBe(new Date(2026, 9, 22).toISOString())

    expect(screen.getByRole('button', { name: 'User: Me' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action: Edited, Posted' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Statement: chase' })).toBeInTheDocument()
    expect(router.state.location.search).toContain('requestId=12')
  })

  test('Statement filter sends pushId when the value looks like a push id (prefix, dashes or not), else reference', async () => {
    feed([event('a')])
    open('/audit?reference=7f3a9c1e-5b2d')
    await screen.findByRole('table', { name: 'Audit trail' })
    expect(lastQuery().get('pushId')).toBe('7f3a9c1e-5b2d')
    expect(lastQuery().has('reference')).toBe(false)
  })

  test('digits-only references (20261028, 2026-10-28) go as reference; a hex prefix goes as pushId', async () => {
    feed([event('a')])
    open('/audit?reference=20261028')
    await screen.findByRole('table', { name: 'Audit trail' })
    expect(lastQuery().get('reference')).toBe('20261028')
    expect(lastQuery().has('pushId')).toBe(false)
  })

  test('a date-shaped reference goes as reference', async () => {
    feed([event('a')])
    open('/audit?reference=2026-10-28')
    await screen.findByRole('table', { name: 'Audit trail' })
    expect(lastQuery().get('reference')).toBe('2026-10-28')
    expect(lastQuery().has('pushId')).toBe(false)
  })

  test('a full push id and a dashless prefix go as pushId', async () => {
    feed([event('a')])
    open('/audit?reference=7f3a9c1e5b2d')
    await screen.findByRole('table', { name: 'Audit trail' })
    expect(lastQuery().get('pushId')).toBe('7f3a9c1e5b2d')
  })

  test('an action this build does not know renders as its raw name instead of crashing', async () => {
    feed([event('a', { action: 'something-new' as AuditEvent['action'] })])
    open()
    const table = await screen.findByRole('table', { name: 'Audit trail' })
    expect(within(table).getAllByText('something-new').length).toBeGreaterThan(0)
  })

  test('Export CSV fetches with the bearer token and the current filters, then saves a file', async () => {
    feed([event('a')])
    let auth: string | null = null
    let url: URL | null = null
    server.use(
      http.get('/api/v2/audit-events.csv', ({ request: r }) => {
        auth = r.headers.get('Authorization')
        url = new URL(r.url)
        return new HttpResponse('a,b\n1,2\n', { headers: { 'Content-Type': 'text/csv' } })
      }),
    )
    const created = vi.fn(() => 'blob:x')
    const revoked = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked }))
    const { user } = open('/audit?q=plumb&requestId=12&action=posted')
    await screen.findByRole('table', { name: 'Audit trail' })
    await user.click(screen.getByRole('button', { name: /Export CSV/ }))
    await waitFor(() => expect(revoked).toHaveBeenCalledWith('blob:x'))
    expect(auth).toMatch(/^Bearer .+/)
    expect(url!.searchParams.get('q')).toBe('plumb')
    expect(url!.searchParams.get('requestId')).toBe('12')
    expect(url!.searchParams.getAll('action')).toEqual(['posted'])
    expect(url!.searchParams.has('page')).toBe(false)
    expect(created).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  test('Export CSV shows the problem detail when the export is too large', async () => {
    feed([event('a')])
    server.use(
      http.get('/api/v2/audit-events.csv', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Too many entries', status: 413, detail: 'Narrow the dates and try again.' },
          { status: 413, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const { user } = open()
    await screen.findByRole('table', { name: 'Audit trail' })
    await user.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(await screen.findByText('Narrow the dates and try again.')).toBeInTheDocument()
  })

  test('row-added / row-deleted with no old/new fall back to the sentence', async () => {
    feed([event('a', { action: 'row-added', field: null, old: null, new: null }), event('b', { action: 'row-deleted', field: null, old: null, new: null, row: { externalId: 'r9', index: 8 } })])
    open()
    expect(await screen.findByText('Added row 7')).toBeInTheDocument()
    expect(screen.getByText('Deleted row 9')).toBeInTheDocument()
  })

  test('picking and clearing filters writes the URL and refetches', async () => {
    feed([event('a')])
    const { user, router } = open()
    await screen.findByRole('table', { name: 'Audit trail' })
    await user.click(screen.getByRole('button', { name: 'Action' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Posted' }))
    await waitFor(() => expect(router.state.location.search).toBe('?action=posted'))
    await waitFor(() => expect(lastQuery().getAll('action')).toEqual(['posted']))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  test('garbage in the URL is ignored', async () => {
    feed([event('a')])
    open('/audit?action=nope&from=2026-13-45&requestId=abc&page=zzz')
    await screen.findByRole('table', { name: 'Audit trail' })
    const q = lastQuery()
    expect([q.has('action'), q.has('from'), q.has('requestId'), q.has('page')]).toEqual([false, false, false, false])
  })

  test('admin sees user events and every user in the User filter', async () => {
    mockDb.userAudit['u-editor'] = [{ id: 1, kind: 'unlocked', actor: { id: 'u-admin', name: 'Asha K' }, detail: null, atUtc: local(0, 8) }]
    const { user } = open()
    expect(await screen.findByText('Unlocked eli@example.com')).toBeInTheDocument()
    expect(screen.getByText('Not a statement')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'User' }))
    const list = await screen.findByRole('listbox')
    await waitFor(() => expect(within(list).getByText('Eli Editor')).toBeInTheDocument())
    expect(within(list).getByText('Me')).toBeInTheDocument()
    expect(within(list).getByText('n8n')).toBeInTheDocument()
  })

  test('viewer role does not see user events or the user filter options beyond Me and n8n', async () => {
    mockDb.userAudit['u-editor'] = [{ id: 1, kind: 'unlocked', actor: { id: 'u-admin', name: 'Asha K' }, detail: null, atUtc: local(0, 8) }]
    let usersAsked = false
    server.use(
      http.get('/api/v2/users', () => {
        usersAsked = true
        return HttpResponse.json({ items: [], page: 1, pageSize: 25, total: 0 })
      }),
    )
    const { user } = open('/audit', 'u-viewer')
    await screen.findByRole('table', { name: 'Audit trail' })
    expect(screen.queryByText('Unlocked eli@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('Not a statement')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'User' }))
    const list = await screen.findByRole('listbox')
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Me', 'n8n'])
    expect(usersAsked).toBe(false)

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Action' }))
    const actions = await screen.findByRole('list', { name: 'Actions' })
    expect(within(actions).getByText('Posted')).toBeInTheDocument()
    expect(within(actions).queryByText('User created')).not.toBeInTheDocument()
  })

  test('pages 50 per page', async () => {
    feed([event('a')], 120)
    const { user } = open()
    await screen.findByText('Page 1 of 3 · 120 total')
    expect(lastQuery().get('pageSize')).toBe('50')
    expect(lastQuery().has('page')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastQuery().get('page')).toBe('2'))
    expect(lastQuery().get('pageSize')).toBe('50')
  })

  test('shows an empty message when nothing matches', async () => {
    feed([])
    open()
    expect(await screen.findByText('No audit entries match.')).toBeInTheDocument()
  })

  test('is reachable by every role', async () => {
    feed([event('a')])
    open('/audit', 'u-viewer')
    expect(await screen.findByRole('heading', { name: 'Audit trail' })).toBeInTheDocument()
  })
})
