import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, vi } from 'vitest'
import { toast } from 'sonner'
import type { Payload, RequestDetail, Txn } from '@/api/schema'
import { mockControl, mockDb } from '@/mocks/db'
import { diffPayload } from '@/mocks/payloadRules'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

const API = '/api/v1/saved-requests'

afterEach(() => {
  server.events.removeAllListeners()
  localStorage.clear()
  vi.useRealTimers()
  vi.mocked(toast.info).mockClear()
})

const record = (id: number) => mockDb.requests.find((r) => r.id === id)!
const payloadOf = (id: number) => record(id).versions[record(id).versions.length - 1].payload

/** Opens a statement and waits until its page (not just the shell) is on screen. */
async function open(id: number, search = '', as = 'u-admin') {
  mockControl.signInAs(as)
  const r = renderApp(`/statements/${id}${search}`)
  const h1 = await screen.findByRole('heading', { level: 1 })
  await within(screen.getByRole('navigation', { name: 'Breadcrumb' })).findByText(h1.textContent!)
  return r
}

const cell = (row: number, field: string) => {
  const td = document.querySelector<HTMLElement>(`tr[data-row="${row}"] td[data-field="${field}"]`)
  if (!td) throw new Error(`no cell ${row}:${field}`)
  return td
}
const rowEl = (row: number) => document.querySelector<HTMLElement>(`tr[data-row="${row}"]`)
const shownRows = () => [...document.querySelectorAll<HTMLElement>('tbody tr[data-row]')].map((r) => Number(r.dataset.row))
const meter = () => screen.getByRole('region', { name: 'Reconciliation' })
const saveBar = () => screen.getByRole('region', { name: 'Save bar' })
const postButton = () => within(saveBar()).getByRole('button', { name: 'Post to QuickBooks' })

function capturePut() {
  const seen: { body: { payload: Payload; note?: string } }[] = []
  server.use(
    http.put(`${API}/:id`, async ({ request }) => {
      seen.push({ body: (await request.clone().json()) as never })
      return undefined
    }),
  )
  return seen
}

function detail(over: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 6,
    publicRef: 'SR-000006',
    status: 'posting',
    rowVersion: 2,
    source: { kind: 'api-client', id: 'n8n-mailbox', name: 'n8n mailbox workflow' },
    reference: 'ref-6',
    controlTotal: 10,
    transactionCount: 1,
    currentVersion: 1,
    needsAttention: false,
    duplicate: { flagged: false, of: null, reasons: [], acknowledgedBy: null },
    validation: { state: 'ok' },
    lastAttempt: null,
    postId: null,
    email: { subject: 'Subject 6', receivedUtc: '2026-10-27T07:12:44Z' },
    pushId: null,
    historyCount: 0,
    validationSummary: { state: 'ok', problemCount: 0, validatedUtc: null, versionNumber: null },
    postSummary: null,
    skipCount: 0,
    created: { utc: '2026-10-27T07:12:50Z', by: { id: 'x', name: 'n8n' } },
    updated: { utc: '2026-10-28T09:30:00Z', by: { id: 'u-admin', name: 'Asha K' } },
    allowedActions: [],
    payload: { transactions: [] },
    readErrors: [],
    otherUnpostedPushes: [],
    ...over,
  }
}

describe('header', () => {
  test('header: subject as title, received, from, reference, push id, status; History/Results open the sheet', async () => {
    const { user, router } = await open(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Chase statement – Aug 2026' })).toBeInTheDocument()
    const meta = screen.getByTestId('statement-meta')
    expect(within(meta).getByText('Received').nextSibling).toHaveTextContent(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(within(meta).getByText('From').nextSibling).toHaveTextContent('alerts@chase.com')
    expect(within(meta).getByText('Reference').nextSibling).toHaveTextContent('chase-4521-2026-08')
    expect(within(meta).getByText('7f3a…f01')).toBeInTheDocument()
    expect(within(meta).getByRole('button', { name: 'Copy push id' })).toBeInTheDocument()
    expect(within(meta).getByText('Pending')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(new URLSearchParams(router.state.location.search).get('sheet')).toBe('1')
    expect(new URLSearchParams(router.state.location.search).get('sheetTab')).toBe('history')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Results' }))
    expect(new URLSearchParams(router.state.location.search).get('sheetTab')).toBe('results')
    expect(await within(await screen.findByRole('dialog')).findByRole('region', { name: 'Latest validation' })).toBeInTheDocument()
  })

  test('no email and no push id: the ref stands in for both, nothing crashes', async () => {
    await open(12)
    expect(screen.getByRole('heading', { level: 1, name: 'SR-000012' })).toBeInTheDocument()
    const meta = screen.getByTestId('statement-meta')
    expect(within(meta).getByText('Received').nextSibling).toHaveTextContent('—')
    expect(within(meta).getByText('From').nextSibling).toHaveTextContent('—')
    expect(within(meta).getByText('Push').nextSibling).toHaveTextContent('SR-000012')
  })

  test('a duplicate links to the other statement and shows its status', async () => {
    await open(5)
    const link = screen.getByRole('link', { name: /Possible duplicate of SR-000001/ })
    expect(link).toHaveAttribute('href', '/statements/1')
    expect(screen.getByText(/Other statement is pending/)).toBeInTheDocument()
  })

  test('renders a hostile subject as text', async () => {
    server.use(
      http.get(`${API}/6`, () =>
        HttpResponse.json(detail({ status: 'pending', email: { subject: '<img src=x onerror=alert(1)>', receivedUtc: null } }), {
          headers: { ETag: '"2"' },
        }),
      ),
    )
    await open(6)
    expect(screen.getByRole('heading', { level: 1, name: '<img src=x onerror=alert(1)>' })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  test('⋯ menu shows Discard/Restore/Resolve only per allowedActions', async () => {
    const cases: [number, string, string[] | null][] = [
      [1, 'u-admin', ['Discard']],
      [10, 'u-admin', ['Restore']],
      [8, 'u-admin', ['Resolve']],
      [1, 'u-viewer', null],
      [7, 'u-admin', null],
    ]
    for (const [id, as, items] of cases) {
      const { user, unmount } = await open(id, '', as)
      const more = screen.queryByRole('button', { name: 'More actions' })
      if (items === null) expect(more).not.toBeInTheDocument()
      else {
        await user.click(more!)
        const menu = await screen.findByRole('menu')
        expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(items)
      }
      unmount()
    }
  })

  test('the Discard item opens the discard dialog', async () => {
    const { user } = await open(2)
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Discard' }))
    expect(await screen.findByLabelText('Reason')).toBeInTheDocument()
  })

  test('the breadcrumb names the statement by its subject, or its ref when the subject is missing or blank', async () => {
    const crumb = () => within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    const first = await open(5)
    expect(crumb().getByText('Chase statement – Aug 2026 (resent)')).toHaveAttribute('aria-current', 'page')
    first.unmount()
    const second = await open(12)
    expect(crumb().getByText('SR-000012')).toHaveAttribute('aria-current', 'page')
    second.unmount()
    record(13).email = { subject: '   ', receivedUtc: null }
    await open(13)
    expect(screen.getByRole('heading', { level: 1, name: 'SR-000013' })).toBeInTheDocument()
    expect(crumb().getByText('SR-000013')).toHaveAttribute('aria-current', 'page')
  })

  test('404 shows Statement not found with a link back', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/statements/9999')
    expect(await screen.findByRole('heading', { name: 'Statement not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Statements' })).toHaveAttribute('href', '/statements')
  })
})

describe('banners', () => {
  test.each([
    [6, /Posting… started by Asha K/],
    [7, /Posted\. Locked\..*api-savings-1177-2026-07/],
    [8, /QuickBooks may have posted this/],
    [9, /Some rows posted/],
    [10, /Sent by mistake while testing the n8n workflow/],
  ])('statement %i shows its status banner', async (id, text) => {
    await open(id)
    expect(screen.getByRole('status', { name: 'Request status' })).toHaveTextContent(text)
  })

  test('pending has no banner', async () => {
    await open(1)
    expect(screen.queryByRole('status', { name: 'Request status' })).not.toBeInTheDocument()
  })
})

describe('post switch', () => {
  test('Post switch off greys and strikes the row, updates meter text and the save bar "1 marked don\'t post"', async () => {
    const { user } = await open(1)
    expect(meter()).toHaveTextContent('12 of 12 rows will post')
    const amount = (payloadOf(1).transactions as Txn[])[2].amount!
    await user.click(screen.getByRole('switch', { name: 'Post row 3' }))
    expect(screen.getByRole('switch', { name: 'Post row 3' })).not.toBeChecked()
    expect(rowEl(2)).toHaveAttribute('data-skip', 'true')
    expect(cell(2, 'payee')).toHaveClass('line-through')
    expect(meter()).toHaveTextContent(`11 of 12 rows will post (1 marked don't post, ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })})`)
    expect(saveBar()).toHaveTextContent('1 unsaved change')
    expect(saveBar()).toHaveTextContent("1 marked don't post")
    // Still editable.
    await user.click(cell(2, 'memo'))
    expect(screen.getByRole('textbox', { name: 'Memo' })).toBeInTheDocument()
  })

  test('switching back clears the change; a saved don\'t-post row arrives switched off', async () => {
    const { user } = await open(12)
    expect(screen.getByRole('switch', { name: 'Post row 2' })).not.toBeChecked()
    expect(meter()).toHaveTextContent("3 of 4 rows will post (1 marked don't post")
    await user.click(screen.getByRole('switch', { name: 'Post row 2' }))
    expect(saveBar()).toHaveTextContent('1 marked to post')
    await user.click(screen.getByRole('switch', { name: 'Post row 2' }))
    expect(saveBar()).not.toHaveTextContent(/unsaved/)
  })
})

describe('inline editing', () => {
  test('click a payee cell, type "abc", pick "ABC Plumbing LLC" from the list, Enter → tinted cell with "was ABC Plumbing"', async () => {
    ;(payloadOf(1).transactions as Txn[])[1].payee = 'ABC Plumbing'
    const { user } = await open(1)
    await user.click(cell(1, 'payee'))
    await user.type(await screen.findByRole('combobox', { name: 'Payee' }), 'abc')
    expect(await screen.findByRole('option', { name: 'ABC Plumbing LLC' })).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument())
    expect(cell(1, 'payee')).toHaveAttribute('data-dirty', 'true')
    expect(within(cell(1, 'payee')).getByText('ABC Plumbing LLC')).toBeInTheDocument()
    expect(within(cell(1, 'payee')).getByText('was ABC Plumbing')).toBeInTheDocument()
  })

  test('Tab keeps the change and edits the next cell; Esc cancels', async () => {
    const { user } = await open(1)
    const amount = cell(0, 'amount').textContent
    await user.click(cell(0, 'memo'))
    await user.type(screen.getByRole('textbox', { name: 'Memo' }), ' paid')
    await user.keyboard('{Tab}')
    expect(cell(0, 'memo')).toHaveTextContent('INV 88000 item 1 paid')
    expect(within(cell(0, 'memo')).getByText('was INV 88000 item 1')).toBeInTheDocument()
    const amountInput = screen.getByRole('textbox', { name: 'Amount' })
    expect(amountInput).toHaveFocus()
    await user.clear(amountInput)
    await user.type(amountInput, '1')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Amount' })).not.toBeInTheDocument()
    expect(cell(0, 'amount')).toHaveTextContent(amount!)
    expect(cell(0, 'amount')).not.toHaveAttribute('data-dirty')
    expect(saveBar()).toHaveTextContent('1 unsaved change')
  })

  test('editable cells show the pencil; a viewer gets no pencil, no switches to flip and no save bar', async () => {
    const first = await open(1)
    expect(cell(0, 'payee').querySelector('[data-pencil]')).not.toBeNull()
    first.unmount()
    await open(1, '', 'u-viewer')
    expect(cell(0, 'payee').querySelector('[data-pencil]')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Post row 1' })).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Save bar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add transaction' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete row 1' })).not.toBeInTheDocument()
  })
})

describe('add and delete', () => {
  test('Add transaction dialog appends a row tagged new with a dash- id; Delete opens the confirm that mentions Post', async () => {
    const { user } = await open(1)
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    const d = await screen.findByRole('dialog', { name: 'Add transaction' })
    await user.type(within(d).getByLabelText('Date'), '2026-08-30')
    await user.selectOptions(within(d).getByLabelText('Kind'), 'Check')
    await user.type(within(d).getByLabelText('Payee'), 'Chase')
    await user.type(within(d).getByLabelText('Account'), 'Bank Service Charges')
    await user.type(within(d).getByLabelText('Amount'), '12.345')
    await user.type(within(d).getByLabelText('Memo'), 'monthly fee')
    await user.click(within(d).getByRole('button', { name: 'Add row' }))
    expect(within(d).getByText('Up to 2 decimals')).toBeInTheDocument()
    await user.clear(within(d).getByLabelText('Amount'))
    await user.type(within(d).getByLabelText('Amount'), '12.00')
    await user.click(within(d).getByRole('button', { name: 'Add row' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const added = rowEl(12)!
    expect(added).toHaveAttribute('data-added', 'true')
    expect(within(added).getByText('new')).toBeInTheDocument()
    expect(cell(12, 'payee')).toHaveTextContent('Chase')
    expect(cell(12, 'externalId')).toHaveTextContent(/^dash-[0-9a-f-]{36}$/)
    expect(meter()).toHaveTextContent('13 of 13 rows will post')
    expect(saveBar()).toHaveTextContent('1 added row')

    await user.click(screen.getByRole('button', { name: 'Delete row 3' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Delete row 3?')
    expect(confirm).toHaveTextContent("Use this only for a row that shouldn't exist. To keep it but leave it out of QuickBooks, switch off Post instead.")
    await user.click(within(confirm).getByRole('button', { name: 'Delete row' }))
    expect(rowEl(2)).toHaveAttribute('data-deleted', 'true')
    expect(within(rowEl(2)!).getByText('deleted')).toBeInTheDocument()
    expect(saveBar()).toHaveTextContent('2 unsaved changes')
    expect(saveBar()).toHaveTextContent('1 added row, 1 deleted row')

    const original = structuredClone(payloadOf(1).transactions as Txn[])
    const seen = capturePut()
    await user.click(within(saveBar()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    const sent = seen[0].body.payload.transactions as Txn[]
    expect(sent).toEqual([
      ...original.filter((_, i) => i !== 2),
      { externalId: expect.stringMatching(/^dash-/), date: '2026-08-30', kind: 'Check', payee: 'Chase', account: 'Bank Service Charges', amount: 12, memo: 'monthly fee' },
    ])
  })
})

describe('row filters', () => {
  test('row filters hide rows only: meter, counts and the saved payload are unchanged; "Showing 2 of 6 rows (filtered)"', async () => {
    const { user, router } = await open(13)
    await user.click(screen.getByRole('switch', { name: 'Post row 2' }))
    await user.click(screen.getByRole('switch', { name: 'Post row 4' }))
    const before = meter().textContent
    expect(before).toContain("4 of 6 rows will post (2 marked don't post")
    expect(screen.getByText('6 rows')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Post or don't post" }))
    await user.click(await screen.findByRole('option', { name: "Don't post" }))
    await waitFor(() => expect(shownRows()).toEqual([1, 3]))
    expect(new URLSearchParams(router.state.location.search).get('rpost')).toBe('skip')
    expect(screen.getByText('Showing 2 of 6 rows (filtered)')).toBeInTheDocument()
    expect(meter().textContent).toBe(before)
    expect(saveBar()).toHaveTextContent('2 unsaved changes')

    await user.click(screen.getByRole('button', { name: 'Kind' }))
    await user.click(await screen.findByRole('checkbox', { name: 'CcCredit' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(shownRows()).toEqual([3]))
    expect(new URLSearchParams(router.state.location.search).get('rkind')).toBe('CcCredit')
    expect(meter().textContent).toBe(before)

    const original = structuredClone(payloadOf(13).transactions as Txn[])
    const seen = capturePut()
    await user.click(within(saveBar()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].body.payload.transactions).toEqual(original.map((r, i) => (i === 1 || i === 3 ? { ...r, post: false } : r)))
    await waitFor(() => expect(saveBar()).not.toHaveTextContent(/unsaved/))
    expect(meter().textContent).toBe(before)
    expect(shownRows()).toEqual([3])

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(shownRows()).toEqual([0, 1, 2, 3, 4, 5]))
  })

  test('Kind takes several kinds', async () => {
    const { user, router } = await open(13)
    await user.click(screen.getByRole('button', { name: 'Kind' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Deposit' }))
    await user.click(screen.getByRole('checkbox', { name: 'Check' }))
    await waitFor(() => expect(shownRows()).toEqual([0, 2, 4, 5]))
    expect(new URLSearchParams(router.state.location.search).get('rkind')).toBe('Check,Deposit')
    expect(screen.getByText('Showing 4 of 6 rows (filtered)')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Deposit' }))
    await waitFor(() => expect(shownRows()).toEqual([0, 4, 5]))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Kind: Check' })).toBeInTheDocument()
  })

  test('filters come from the URL; search, post and garbage values', async () => {
    await open(13, '?rpost=skip&rfrom=2026-13-45&rkind=Nope')
    expect(shownRows()).toEqual([])
    expect(screen.getByText('Showing 0 of 6 rows (filtered)')).toBeInTheDocument()
  })

  test('search hides rows by payee, memo or account; kind and dates come from the URL', async () => {
    const first = await open(13, '?rq=metro')
    expect(shownRows()).toEqual([1])
    first.unmount()
    await open(13, '?rkind=Check&rfrom=2026-08-02')
    expect(shownRows()).toEqual([4, 5])
  })

  test('Edited filter shows dirty rows and rows changed in earlier versions', async () => {
    const { user } = await open(1)
    await user.click(cell(2, 'memo'))
    await user.type(screen.getByRole('textbox', { name: 'Memo' }), ' x{Enter}')
    await user.click(screen.getByRole('button', { name: 'Edited' }))
    // Row 1's payee changed in version 2, row 5's amount in version 3; row 3 is unsaved.
    await waitFor(() => expect(shownRows()).toEqual([0, 2, 4]))
    expect(screen.getByText('Showing 3 of 12 rows (filtered)')).toBeInTheDocument()
  })

  test('Has a problem shows only rows with findings', async () => {
    const { user } = await open(2)
    await user.click(screen.getByRole('button', { name: 'Has a problem' }))
    await waitFor(() => expect(shownRows()).toEqual([16, 88, 139]))
    expect([16, 88, 139].every((i) => rowEl(i)!.dataset.problem === 'true')).toBe(true)
    // The reason sits under the cell it is about.
    expect(within(cell(88, 'lineAccount')).getByText(/No rule maps this payee/)).toBeInTheDocument()
  })
})

describe('?row=', () => {
  test('?row=row-7 scrolls to and highlights row 7; unknown row → toast "Row row-7 was deleted in version N"', async () => {
    const first = await open(1, '?row=row-7')
    await waitFor(() => expect(rowEl(6)).toHaveAttribute('data-highlight', 'true'))
    first.unmount()

    const r = record(1)
    const prev = r.versions[r.versions.length - 1]
    const next = structuredClone(prev.payload)
    next.transactions = (next.transactions as Txn[]).filter((t) => t.externalId !== 'row-7')
    const changes = diffPayload(prev.payload, next)
    r.versions.push({ ...prev, number: 4, payload: next, changes, changeCount: changes.length })
    r.rowVersion++
    await open(1, '?row=row-7')
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Row row-7 was deleted in version 4'))
    expect(document.querySelector('tr[data-highlight]')).toBeNull()
  })

  test('the highlight fades after 2 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await open(1, '?row=row-7')
    await waitFor(() => expect(rowEl(6)).toHaveAttribute('data-highlight', 'true'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(rowEl(6)).not.toHaveAttribute('data-highlight')
  })
})

describe('control total', () => {
  test('editing the control total updates the meter, marks the draft dirty and is saved', async () => {
    const { user } = await open(13)
    const sum = within(meter()).getByTestId('meter-sum').textContent!
    expect(within(meter()).getByTestId('meter-delta')).toHaveTextContent('Matches to the cent')
    await user.click(within(meter()).getByRole('button', { name: 'Edit control total' }))
    const input = within(meter()).getByRole('textbox', { name: 'Control total' })
    await user.clear(input)
    await user.type(input, '1.234{Enter}')
    expect(within(meter()).getByText('Up to 2 decimals')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(within(meter()).queryByRole('textbox')).not.toBeInTheDocument()
    expect(saveBar()).not.toHaveTextContent(/unsaved/)

    await user.click(within(meter()).getByRole('button', { name: 'Edit control total' }))
    const again = within(meter()).getByRole('textbox', { name: 'Control total' })
    await user.clear(again)
    await user.type(again, '10{Enter}')
    expect(within(meter()).getByTestId('control-total')).toHaveTextContent('10.00')
    expect(within(meter()).getByTestId('control-total')).toHaveAttribute('data-dirty', 'true')
    expect(within(meter()).getByText(`was ${sum}`)).toBeInTheDocument()
    expect(within(meter()).getByTestId('meter-delta')).toHaveTextContent(/^Over by /)
    expect(saveBar()).toHaveTextContent('1 unsaved change')
    expect(saveBar()).toHaveTextContent('1 edit')
    expect(postButton()).toBeDisabled()

    const seen = capturePut()
    await user.click(within(saveBar()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].body.payload.controlTotal).toBe(10)
    await waitFor(() => expect(saveBar()).not.toHaveTextContent(/unsaved/))
    expect(within(meter()).getByTestId('control-total')).not.toHaveAttribute('data-dirty')
  })

  test('a viewer sees the control total as text only', async () => {
    await open(13, '', 'u-viewer')
    expect(within(meter()).queryByRole('button', { name: 'Edit control total' })).not.toBeInTheDocument()
    expect(meter()).toHaveTextContent(/Control total [0-9,.]+, never changed by the app/)
  })
})

describe('save bar', () => {
  test('save bar: "3 unsaved changes" + breakdown; Undo changes resets; Post disabled while dirty', async () => {
    const { user } = await open(1)
    expect(postButton()).toBeEnabled()
    await user.click(cell(0, 'memo'))
    await user.type(screen.getByRole('textbox', { name: 'Memo' }), ' x{Enter}')
    await user.click(screen.getByRole('switch', { name: 'Post row 3' }))
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    const d = await screen.findByRole('dialog', { name: 'Add transaction' })
    await user.type(within(d).getByLabelText('Amount'), '5')
    await user.click(within(d).getByRole('button', { name: 'Add row' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(saveBar()).toHaveTextContent('3 unsaved changes')
    expect(saveBar()).toHaveTextContent("1 edit, 1 added row, 1 marked don't post")
    expect(postButton()).toBeDisabled()
    await user.hover(postButton().parentElement!)
    expect((await screen.findAllByText('Save first')).length).toBeGreaterThan(0)

    await user.click(within(saveBar()).getByRole('button', { name: 'Undo changes' }))
    expect(saveBar()).not.toHaveTextContent(/unsaved/)
    expect(rowEl(12)).toBeNull()
    expect(screen.getByRole('switch', { name: 'Post row 3' })).toBeChecked()
    expect(postButton()).toBeEnabled()
  })

  test('Validate re-runs validation; the Results tab shows the new check and says when it is out of date', async () => {
    let who = 'Eli Editor'
    server.use(
      http.get('/api/v1/audit-events', () =>
        HttpResponse.json({
          items: [{ id: 'v', atUtc: '2026-10-27T08:00:00Z', actor: { id: 'u', name: who, kind: 'user' }, action: 'validated', request: null, row: null, field: null, old: null, new: null, versionNumber: null, detail: null }],
          page: 1, pageSize: 1, total: 1,
        }),
      ),
    )
    const { user, queryClient } = await open(2)
    await user.click(screen.getByRole('button', { name: 'Results' }))
    const sheet = await screen.findByRole('dialog')
    await waitFor(() => expect(within(sheet).getByRole('region', { name: 'Latest validation' })).toHaveTextContent('by Eli Editor'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    who = 'Asha K'
    await user.click(within(saveBar()).getByRole('button', { name: 'Validate' }))
    // Validate marks the audit queries stale, so the next look at History or Results asks again.
    await waitFor(() => expect(queryClient.getQueryCache().findAll({ queryKey: ['audit'] }).every((q) => q.state.isInvalidated)).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Results' }))
    const again = await screen.findByRole('dialog')
    await waitFor(() => expect(within(again).getByRole('region', { name: 'Latest validation' })).toHaveTextContent('by Asha K'))
    const key = ['requests', 'detail', '2']
    const cur = queryClient.getQueryData(key) as { request: RequestDetail; etag: string }
    act(() => {
      queryClient.setQueryData(key, { ...cur, request: { ...cur.request, currentVersion: 5, validation: { ...cur.request.validation, versionNumber: 2 } } })
    })
    expect(await within(again).findByText('Validation is out of date')).toBeInTheDocument()
  })

  test('every row switched off → Post disabled with "Every row is marked don\'t post"', async () => {
    const { user } = await open(13)
    for (let n = 1; n <= 6; n++) await user.click(screen.getByRole('switch', { name: `Post row ${n}` }))
    expect(meter()).toHaveTextContent("0 of 6 rows will post (6 marked don't post")
    const seen = capturePut()
    await user.click(within(saveBar()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    await waitFor(() => expect(saveBar()).not.toHaveTextContent(/unsaved/))
    expect(postButton()).toBeDisabled()
    await user.hover(postButton().parentElement!)
    expect((await screen.findAllByText("Every row is marked don't post")).length).toBeGreaterThan(0)
  })
})

describe('moving between statements', () => {
  test('/statements/1 → /statements/2 does not carry draft or post state over', async () => {
    // 5 is a resend of 1: same rows, so anything carried over would show.
    const { user, router } = await open(1)
    await user.click(screen.getByRole('switch', { name: 'Post row 2' }))
    await user.click(cell(0, 'memo'))
    await user.type(screen.getByRole('textbox', { name: 'Memo' }), ' x{Enter}')
    expect(saveBar()).toHaveTextContent('2 unsaved changes')
    act(() => {
      void router.navigate('/statements/5')
    })
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }))
    await within(screen.getByRole('navigation', { name: 'Breadcrumb' })).findByText('Chase statement – Aug 2026 (resent)')
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Post row 2' })).toBeChecked())
    expect(saveBar()).not.toHaveTextContent(/unsaved/)
    expect(cell(0, 'memo')).not.toHaveAttribute('data-dirty')
    expect(meter()).toHaveTextContent('12 of 12 rows will post')
    expect(postButton()).toBeEnabled()
  })
})

describe('polling', () => {
  test('refetches every 3 s while posting and stops once the status changes', async () => {
    let gets = 0
    let posted = false
    server.use(
      http.get(`${API}/6`, () => {
        gets++
        return HttpResponse.json(detail({ status: posted ? 'posted' : 'posting', postId: posted ? 'api-6' : null }), {
          headers: { ETag: '"2"' },
        })
      }),
    )
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await open(6)
    expect(screen.getByRole('status', { name: 'Request status' })).toHaveTextContent('Posting…')
    expect(gets).toBe(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    await waitFor(() => expect(gets).toBe(3))
    posted = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await waitFor(() => expect(screen.getByRole('status', { name: 'Request status' })).toHaveTextContent('Posted. Locked.'))
    const settled = gets
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(gets).toBe(settled)
  })

  test('a failed background refetch keeps the page and shows an alert', async () => {
    let gets = 0
    server.use(
      http.get(`${API}/6`, () => {
        gets++
        if (gets > 1) return HttpResponse.json({ title: 'Server error', status: 500 }, { status: 500 })
        return HttpResponse.json(detail(), { headers: { ETag: '"2"' } })
      }),
    )
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await open(6)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
    expect(screen.getByRole('heading', { level: 1, name: 'Subject 6' })).toBeInTheDocument()
  })
})
