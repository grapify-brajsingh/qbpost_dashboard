import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { formatTimestamp } from '@/lib/dates'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

async function open(id: number, tab: string) {
  mockControl.signInAs('u-admin')
  const r = renderApp(`/requests/${id}?tab=${tab}`)
  await screen.findByRole('heading', { name: `SR-${String(id).padStart(6, '0')}` })
  return r
}

describe('Versions tab', () => {
  test('lists versions newest first with who, when, note and change count; selecting v2 shows its sentences', async () => {
    const { user } = await open(1, 'versions')
    const list = await screen.findByRole('list', { name: 'Versions' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('v3')
    expect(items[0]).toHaveTextContent('Asha K')
    expect(items[0]).toHaveTextContent('amount on row 5 per the PDF')
    expect(items[0]).toHaveTextContent(formatTimestamp('2026-10-27T08:10:00Z'))
    expect(items[0]).toHaveTextContent('2 changes')

    // the latest is selected by default
    expect(await screen.findByRole('list', { name: 'Changes in version 3' })).toBeInTheDocument()
    await user.click(within(items[1]).getByRole('button'))
    const changes = await screen.findByRole('list', { name: 'Changes in version 2' })
    expect(within(changes).getByText(/^Row 1 \(row-1\) payee: ABC PLUMBING → /)).toBeInTheDocument()
  })

  test('View original shows pretty JSON, and Raw shows the exact text with its whitespace', async () => {
    const exact = '{"reference":  "r-1",\n\t"controlTotal":1}'
    server.use(http.get('/api/v1/saved-requests/:id/original', () => new HttpResponse(exact, { headers: { 'Content-Type': 'application/json' } })))
    const { user } = await open(1, 'versions')
    await user.click(await screen.findByRole('button', { name: 'View original' }))
    const body = await screen.findByLabelText('Original body')
    await waitFor(() => expect(body.textContent).toBe('{\n  "reference": "r-1",\n  "controlTotal": 1\n}'))
    await user.click(screen.getByRole('button', { name: 'Raw' }))
    expect(screen.getByLabelText('Original body').textContent).toBe(exact)
  })

  test('Copy writes the shown text to the clipboard', async () => {
    const { user } = await open(1, 'versions')
    await user.click(await screen.findByRole('button', { name: 'View original' }))
    const body = await screen.findByLabelText('Original body')
    await waitFor(() => expect(body.textContent).toContain('"reference"'))
    const shown = body.textContent
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(shown))
  })
})

describe('Attempts tab', () => {
  test('an older result that lists its rows as `rows` still shows the TxnID table', async () => {
    const a = mockDb.requests.find((r) => r.id === 7)!.attempts.find((x) => x.id === 2)!
    const { posted, ...rest } = a.result as { posted: unknown[] }
    a.result = { ...rest, rows: posted }
    const { user } = await open(7, 'attempts')
    await user.click(await screen.findByRole('button', { name: 'Attempt 2' }))
    const table = await screen.findByRole('table', { name: 'Posted rows for attempt 2' })
    expect(within(table).getAllByRole('row')).toHaveLength(9)
  })

  test('a posted attempt expands to the TxnID table', async () => {
    const { user } = await open(7, 'attempts')
    await user.click(await screen.findByRole('button', { name: 'Attempt 2' }))
    const table = await screen.findByRole('table', { name: 'Posted rows for attempt 2' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      '#',
      'External ID',
      'Kind',
      'Account',
      'Amount',
      'TxnID',
    ])
    const first = within(table).getAllByRole('row')[1]
    expect(first).toHaveTextContent('row-1')
    expect(first).toHaveTextContent(/[0-9A-Za-z-]{4,}$/)
    expect(within(table).getAllByRole('row')).toHaveLength(9)
  })

  test('a partial attempt shows its findings', async () => {
    const { user } = await open(9, 'attempts')
    await user.click(await screen.findByRole('button', { name: 'Attempt 4' }))
    const list = await screen.findByRole('list', { name: 'Findings for attempt 4' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Row 5 (row-5): quickbooks-rejected — QuickBooks rejected the row')
  })

  test('an error attempt shows the problem title and detail', async () => {
    const r = mockDb.requests.find((x) => x.id === 11)!
    r.attempts[0].result = { title: 'QuickBooks is busy', detail: 'Another process holds the company file.' }
    const { user } = await open(11, 'attempts')
    await user.click(await screen.findByRole('button', { name: 'Attempt 5' }))
    expect(await screen.findByText('QuickBooks is busy')).toBeInTheDocument()
    expect(screen.getByText('Another process holds the company file.')).toBeInTheDocument()
  })

  test('a resolved attempt shows who resolved it and the note', async () => {
    const r = mockDb.requests.find((x) => x.id === 9)!
    r.attempts[0].resolvedBy = { id: 'u-admin', name: 'Asha K' }
    r.attempts[0].resolvedUtc = '2026-10-19T10:00:00Z'
    r.attempts[0].resolutionNote = 'accepted as is'
    const { user } = await open(9, 'attempts')
    await user.click(await screen.findByRole('button', { name: 'Attempt 4' }))
    expect(await screen.findByText(/Resolved by Asha K/)).toHaveTextContent(
      `Resolved by Asha K at ${formatTimestamp('2026-10-19T10:00:00Z')}: accepted as is`,
    )
  })

  test('attempts are listed newest first', async () => {
    const r = mockDb.requests.find((x) => x.id === 7)!
    r.attempts.unshift({ ...r.attempts[0], id: 1, outcome: 'busy', httpStatus: 409 })
    await open(7, 'attempts')
    const items = within(await screen.findByRole('list', { name: 'Attempts' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('#2')
    expect(items[1]).toHaveTextContent('#1')
  })
})

describe('History tab', () => {
  test('shows the timeline in API order with actors and local times', async () => {
    await open(7, 'history')
    const items = within(await screen.findByRole('list', { name: 'History' })).getAllByRole('listitem')
    const api = mockDb.requests.find((x) => x.id === 7)!.events
    const expected = [...api].reverse() // the mock serves newest first; the tab keeps the order it is given
    expect(items).toHaveLength(expected.length)
    expect(items[0]).toHaveTextContent('Post finished: posted')
    expect(items[0]).toHaveTextContent('Asha K')
    expect(items[0]).toHaveTextContent(formatTimestamp('2026-10-20T09:00:41Z'))
    expect(items[items.length - 1]).toHaveTextContent('Request received')
  })
})
