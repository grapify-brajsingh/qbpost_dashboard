import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach } from 'vitest'
import type { Attempt, AuditEvent, Page, RequestDetail, RequestSummary } from '@/api/schema'
import { mockControl } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

const A = '/api/v2/saved-requests'

function summary(id: number, over: Partial<RequestSummary> = {}): RequestSummary {
  return {
    publicRef: `SR-${String(id).padStart(6, '0')}`,
    id,
    status: 'pending',
    rowVersion: 1,
    source: { kind: 'api-client', id: 'n8n-mailbox', name: 'n8n mailbox workflow' },
    reference: `ref-${id}`,
    controlTotal: 100,
    transactionCount: 3,
    currentVersion: 1,
    needsAttention: false,
    duplicate: { flagged: false, of: null, reasons: [], acknowledgedBy: null },
    validation: { state: 'ok' },
    lastAttempt: null,
    postId: null,
    email: { subject: `Subject ${id}`, receivedUtc: '2026-10-27T07:12:44Z', from: `s${id}@bank.example` },
    pushId: `0000000${id}-aaaa-bbbb-cccc-dddddddddddd`,
    historyCount: 2,
    validationSummary: { state: 'ok', problemCount: 0, validatedUtc: null, versionNumber: null },
    postSummary: null,
    skipCount: 0,
    created: { utc: '2026-10-27T07:12:50Z', by: { id: 'x', name: 'n8n' } },
    updated: { utc: '2026-10-28T09:30:00Z', by: { id: 'x', name: 'n8n' } },
    allowedActions: [],
    ...over,
  }
}

function detail(id: number, over: Partial<RequestDetail> = {}): RequestDetail {
  return {
    ...summary(id),
    payload: { reference: `ref-${id}`, controlTotal: 100, transactions: [{ externalId: 'a', amount: 60 }, { externalId: 'b', amount: 40 }] },
    readErrors: [],
    otherUnpostedPushes: [],
    validation: { state: 'ok', validatedUtc: '2026-10-27T08:00:00Z', versionNumber: 1 },
    ...over,
  }
}

const attempt = (id: number, over: Partial<Attempt> = {}): Attempt => ({
  id,
  versionNumber: 1,
  outcome: 'posted',
  httpStatus: 200,
  postId: 'p-1',
  counts: null,
  error: null,
  startedUtc: `2026-10-27T09:0${id}:00Z`,
  finishedUtc: null,
  startedBy: { id: 'u', name: 'Asha K' },
  ...over,
})

const event = (id: string, atUtc: string, over: Partial<AuditEvent> = {}): AuditEvent => ({
  id,
  atUtc,
  actor: { id: 'u', name: 'Asha K', kind: 'user' },
  action: 'row-edited',
  request: null,
  row: null,
  field: null,
  old: null,
  new: null,
  versionNumber: null,
  detail: null,
  ...over,
})

function useDetail(d: RequestDetail) {
  server.use(
    http.get(`${A}/${d.id}`, () => HttpResponse.json(d, { headers: { ETag: '"1"' } })),
    http.get(A, () => HttpResponse.json({ items: [summary(d.id, { ...d })], page: 1, pageSize: 25, total: 1 } satisfies Page<RequestSummary>)),
  )
}
const useAttempts = (id: number, list: Attempt[], full: Record<number, unknown> = {}) =>
  server.use(
    http.get(`${A}/${id}/attempts`, () => HttpResponse.json({ items: list })),
    http.get(`${A}/${id}/attempts/:aid`, ({ params }) => {
      const a = list.find((x) => x.id === Number(params.aid))!
      return HttpResponse.json({ ...a, result: full[a.id] })
    }),
  )

function open(route: string) {
  mockControl.signInAs('u-admin')
  return renderApp(route)
}

afterEach(() => localStorage.clear())

describe('statement sheet', () => {
  test('opens from a Statements row on the requested tab and keeps the list visible', async () => {
    useDetail(detail(7))
    useAttempts(7, [])
    server.use(http.get('/api/v2/audit-events', () => HttpResponse.json({ items: [], page: 1, pageSize: 100, total: 0 })))
    const { user, router } = open('/statements?reference=zz&page=1')
    await user.click(await screen.findByRole('button', { name: 'History 2' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('tab', { name: 'History', selected: true })).toBeInTheDocument()
    expect(router.state.location.search).toContain('sheet=7')
    expect(router.state.location.search).toContain('sheetTab=history')
    expect(router.state.location.search).toContain('reference=zz')
    expect(screen.getByText('Subject 7', { selector: 'td *, td' })).toBeInTheDocument()
  })

  test('Results, not posted: latest validation state, when, each problem with its row number, control-total check', async () => {
    useDetail(
      detail(7, {
        payload: { controlTotal: 100, transactions: [{ externalId: 'a', amount: 60 }, { externalId: 'b', amount: 30.5, post: false }] },
        validation: {
          state: 'held',
          validatedUtc: '2026-10-27T08:00:00Z',
          versionNumber: 2,
          validation: [{ index: 1, externalId: 'b', reason: 'unknown-account', detail: 'No such account' }],
        },
      }),
    )
    useAttempts(7, [])
    open('/statements?sheet=7&sheetTab=results')
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByText('Held: problems to fix')).toBeInTheDocument()
    expect(within(sheet).getByText(/against version 2/)).toBeInTheDocument()
    expect(within(sheet).getByText(/Row 2 \(b\): unknown-account — No such account/)).toBeInTheDocument()
    // the switched-off row still counts
    expect(within(sheet).getByText('Rows add up to 90.50; the control total is 100.00.')).toBeInTheDocument()
  })

  test('Results shows who last validated, from the newest validated audit event; "by" is left out when there is none', async () => {
    useDetail(detail(7))
    useAttempts(7, [])
    let asked: URLSearchParams | null = null
    server.use(
      http.get('/api/v2/audit-events', ({ request }) => {
        asked = new URL(request.url).searchParams
        return HttpResponse.json({
          items: [event('v1', '2026-10-27T08:00:00Z', { action: 'validated', actor: { id: 'u2', name: 'Eli Editor', kind: 'user' } })],
          page: 1,
          pageSize: 1,
          total: 1,
        })
      }),
    )
    const { unmount } = open('/statements?sheet=7&sheetTab=results')
    const block = await within(await screen.findByRole('dialog')).findByRole('region', { name: 'Latest validation' })
    await waitFor(() => expect(block).toHaveTextContent(/Validated .* by Eli Editor against version 1/))
    expect(asked!.get('requestId')).toBe('7')
    expect(asked!.getAll('action')).toEqual(['validated'])
    expect(asked!.get('pageSize')).toBe('1')
    unmount()

    server.use(http.get('/api/v2/audit-events', () => HttpResponse.json({ items: [], page: 1, pageSize: 1, total: 0 })))
    open('/statements?sheet=7&sheetTab=results')
    const bare = await within(await screen.findByRole('dialog')).findByRole('region', { name: 'Latest validation' })
    await waitFor(() => expect(bare).toHaveTextContent(/Validated .* against version 1/))
    expect(bare).not.toHaveTextContent(' by ')
  })

  test('Results, posted: posted by/when/counts/batch and the row to TxnID table, first 10, "Show all 61"', async () => {
    const rows = Array.from({ length: 61 }, (_, i) => ({ index: i, externalId: `r${i}`, txnId: `TXN-${i}`, kind: 'check', account: 'Checking', amount: 1 }))
    useDetail(
      detail(7, {
        status: 'posted',
        postSummary: { postId: 'p-1', postedCount: 61, postedUtc: '2026-10-27T09:01:00Z', postedBy: { id: 'u', name: 'Asha K' } },
        ledgerBatch: { postId: 'p-1', status: 'posted', createdUtc: '2026-10-27T09:01:00Z', counts: { posted: 61 } },
      }),
    )
    useAttempts(7, [attempt(1)], { 1: { posted: rows } })
    const { user } = open('/statements?sheet=7&sheetTab=results')
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByText(/Posted by Asha K/)).toBeInTheDocument()
    expect(within(sheet).getByText(/posted 61/)).toBeInTheDocument()
    expect(within(sheet).getByText('Ledger batch p-1')).toBeInTheDocument()
    const table = await within(sheet).findByRole('table', { name: 'Row to TxnID' })
    expect(within(table).getAllByRole('row')).toHaveLength(11)
    expect(within(table).getByText('TXN-9')).toBeInTheDocument()
    expect(within(table).queryByText('TXN-10')).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Show all 61' }))
    expect(within(table).getAllByRole('row')).toHaveLength(62)
  })

  test('Results, partly posted: the TxnID table is shown for a partial attempt too', async () => {
    const rows = [{ index: 0, externalId: 'r0', txnId: 'TXN-PART', kind: 'check', account: 'Checking', amount: 1 }]
    useDetail(
      detail(7, {
        status: 'partial',
        postSummary: { postId: 'p-2', postedCount: 1, postedUtc: '2026-10-27T09:01:00Z', postedBy: { id: 'u', name: 'Asha K' } },
      }),
    )
    useAttempts(7, [attempt(1, { outcome: 'partial' })], { 1: { posted: rows } })
    open('/statements?sheet=7&sheetTab=results')
    const sheet = await screen.findByRole('dialog')
    const table = await within(sheet).findByRole('table', { name: 'Row to TxnID' })
    expect(within(table).getByText('TXN-PART')).toBeInTheDocument()
  })

  test('Results lists attempts newest first, including refused ones', async () => {
    useDetail(detail(7))
    useAttempts(7, [attempt(1, { outcome: 'held' }), attempt(3, { outcome: 'refused', httpStatus: 422 }), attempt(2, { outcome: 'failed' })])
    open('/statements?sheet=7&sheetTab=results')
    const sheet = await screen.findByRole('dialog')
    const list = await within(sheet).findByRole('list', { name: 'Attempts' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('#3'),
      expect.stringContaining('#2'),
      expect.stringContaining('#1'),
    ])
    expect(items[0]).toHaveTextContent('refused')
  })

  test("History: this statement's events newest first, as plain text; Open in Audit trail goes to /audit?requestId=", async () => {
    useDetail(detail(7))
    server.use(
      http.get('/api/v2/audit-events', ({ request }) => {
        expect(new URL(request.url).searchParams.get('requestId')).toBe('7')
        return HttpResponse.json({
          items: [
            event('e1', '2026-10-27T08:00:00Z', { field: 'amount', old: 10, new: 12 }),
            event('e2', '2026-10-27T10:00:00Z', { field: 'memo', old: 'x', new: '<img src=x onerror=alert(1)>' }),
          ],
          page: 1,
          pageSize: 100,
          total: 2,
        })
      }),
    )
    const { user, router } = open('/statements?sheet=7&sheetTab=history')
    const sheet = await screen.findByRole('dialog')
    const list = await within(sheet).findByRole('list', { name: 'History' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Changed memo')
    expect(items[0]).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(items[0].querySelector('img')).toBeNull()
    expect(items[1]).toHaveTextContent('Changed amount')
    expect(items[1]).toHaveTextContent('10→12')
    expect(within(items[1]).getByText('10')).toHaveClass('line-through')
    await user.click(within(sheet).getByRole('link', { name: 'Open in Audit trail' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/audit'))
    expect(router.state.location.search).toBe('?requestId=7')
  })

  test('Versions tab renders the v1 version list and original body viewer', async () => {
    open('/statements?sheet=1&sheetTab=versions')
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByRole('list', { name: 'Versions' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'View original' })).toBeInTheDocument()
  })

  test('Esc and browser Back close the sheet', async () => {
    useDetail(detail(7))
    useAttempts(7, [])
    const { user, router } = open('/statements')
    await user.click(await screen.findByRole('button', { name: 'Results' }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.search).toBe('')

    await user.click(screen.getByRole('button', { name: 'Results' }))
    await screen.findByRole('dialog')
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
