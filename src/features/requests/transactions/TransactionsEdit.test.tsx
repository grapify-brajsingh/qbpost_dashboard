import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { QueryClient } from '@tanstack/react-query'
import { http } from 'msw'
import { afterEach, vi } from 'vitest'
import { TXN_KINDS, type Payload, type RequestDetail, type Txn } from '@/api/schema'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'
import { createDraft, draftToPayload, setCell } from './draft'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const API = '/api/v1/saved-requests'

const record = (id: number) => mockDb.requests.find((r) => r.id === id)!
const payloadOf = (id: number) => record(id).versions[record(id).versions.length - 1].payload

async function open(id = 1, as = 'u-admin') {
  mockControl.signInAs(as)
  const r = renderApp(`/statements/${id}`)
  await screen.findByRole('region', { name: 'Validation' })
  return r
}

const cell = (row: number, field: string) => {
  const td = document.querySelector<HTMLElement>(`tr[data-row="${row}"] td[data-field="${field}"]`)
  if (!td) throw new Error(`no cell ${row}:${field}`)
  return td
}

/** Captures the next PUT to /saved-requests/:id, then lets the mock API answer it. */
function capturePut() {
  const seen: { url: string; ifMatch: string | null; body: { payload: Payload; note?: string } }[] = []
  server.use(
    http.put(`${API}/:id`, async ({ request }) => {
      seen.push({ url: new URL(request.url).pathname, ifMatch: request.headers.get('If-Match'), body: (await request.clone().json()) as never })
      return undefined
    }),
  )
  return seen
}

/** Makes request 1 add up to 4,830.17 with row 1 at 184.32 and a control total of 4,820.17. */
function seedTotals() {
  const p = payloadOf(1)
  const rows = p.transactions as Txn[]
  rows[0].amount = 184.32
  rows[11].amount = 167
  p.controlTotal = 4820.17
}

async function choosePayee(user: ReturnType<typeof renderApp>['user'], row: number, name: string) {
  await user.click(cell(row, 'payee'))
  await user.click(await screen.findByRole('option', { name }))
}

describe('editing cells', () => {
  test('choosing a payee from the combo tints the cell and counts one unsaved change', async () => {
    const { user } = await open(1)
    expect(cell(1, 'payee')).toHaveTextContent('Metro Electric Co')
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    expect(cell(1, 'payee')).toHaveTextContent('ABC Plumbing LLC')
    expect(cell(1, 'payee')).toHaveAttribute('data-dirty', 'true')
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(within(cell(1, 'payee')).queryByText('not in QuickBooks')).not.toBeInTheDocument()
  })

  test('a Deposit row searches customers, not vendors', async () => {
    const { user } = await open(1)
    await user.click(cell(2, 'payee'))
    expect(await screen.findByRole('option', { name: 'Kiosk Rental' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'ABC Plumbing LLC' })).not.toBeInTheDocument()
  })

  test('free text is kept and flagged "not in QuickBooks"', async () => {
    const { user } = await open(1)
    await user.click(cell(1, 'payee'))
    const input = await screen.findByRole('combobox')
    await user.type(input, 'Nobody Inc{Enter}')
    await waitFor(() => expect(cell(1, 'payee')).toHaveTextContent('Nobody Inc'))
    expect(await within(cell(1, 'payee')).findByText('not in QuickBooks')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  test('kind offers exactly TXN_KINDS; the unreadable Cheque is shown, flagged and replaceable', async () => {
    const { user } = await open(3)
    expect(within(cell(3, 'kind')).getByText('Cheque')).toBeInTheDocument()
    expect(within(cell(3, 'kind')).getByText('not a valid kind')).toBeInTheDocument()
    await user.click(cell(3, 'kind'))
    const select = await screen.findByRole('combobox', { name: 'Kind' })
    const options = within(select)
      .getAllByRole('option')
      .filter((o) => !(o as HTMLOptionElement).disabled)
      .map((o) => o.textContent)
    expect(options).toEqual([...TXN_KINDS])
    await user.selectOptions(select, 'Check')
    expect(cell(3, 'kind')).toHaveTextContent('Check')
    expect(within(cell(3, 'kind')).queryByText('not a valid kind')).not.toBeInTheDocument()
  })

  test('amount rejects more than 2 decimals and stays in edit mode', async () => {
    const { user } = await open(1)
    await user.click(cell(0, 'amount'))
    const input = await screen.findByRole('textbox', { name: 'Amount' })
    await user.clear(input)
    await user.type(input, '184.321{Enter}')
    expect(screen.getByRole('textbox', { name: 'Amount' })).toBeInTheDocument()
    expect(screen.getByText('Up to 2 decimals')).toBeInTheDocument()
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
  })

  test('keyboard: Enter edits, Esc cancels, arrows move, Tab commits and moves to the next cell', async () => {
    const { user } = await open(1)
    act(() => cell(0, 'payee').focus())
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('combobox')).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument())
    expect(cell(0, 'payee')).toHaveTextContent('ABC Plumbing LLC')
    await waitFor(() => expect(cell(0, 'payee')).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(cell(1, 'payee')).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowUp}')
    expect(cell(0, 'kind')).toHaveFocus()

    act(() => cell(0, 'memo').focus())
    await user.keyboard('{Enter}')
    const memo = screen.getByRole('textbox', { name: 'Memo' })
    await user.type(memo, ' paid')
    await user.keyboard('{Tab}')
    expect(cell(0, 'memo')).toHaveTextContent('INV 88000 item 1 paid')
    expect(cell(0, 'last4')).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(cell(0, 'memo')).toHaveFocus()
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
  })

  test('clicking a finding candidate fills the line account', async () => {
    const { user } = await open(2)
    await user.click(screen.getByRole('checkbox', { name: 'Only rows with problems' }))
    await user.hover(await screen.findByRole('button', { name: 'Problems on row 89' }))
    const [candidate] = await screen.findAllByRole('button', { name: 'Repairs and Maintenance' })
    await user.click(candidate)
    expect(cell(88, 'lineAccount')).toHaveTextContent('Repairs and Maintenance')
    expect(cell(88, 'lineAccount')).toHaveAttribute('data-dirty', 'true')
  })
})

describe('totals bar', () => {
  test('sum and difference update live; control total only changes when typed', async () => {
    seedTotals()
    const { user } = await open(1)
    const bar = screen.getByRole('region', { name: 'Totals' })
    expect(within(bar).getByTestId('rows-sum')).toHaveTextContent('4,830.17')
    expect(within(bar).getByTestId('difference')).toHaveTextContent('10.00')

    await user.click(cell(0, 'amount'))
    const input = screen.getByRole('textbox', { name: 'Amount' })
    await user.clear(input)
    await user.type(input, '194.32{Enter}')
    expect(within(bar).getByTestId('rows-sum')).toHaveTextContent('4,840.17')
    const diff = within(bar).getByTestId('difference')
    expect(diff).toHaveTextContent('20.00')
    expect(diff).toHaveClass('text-destructive')
    expect(within(bar).getByRole('textbox', { name: 'Control total' })).toHaveValue('4820.17')

    const seen = capturePut()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].body.payload.controlTotal).toBe(4820.17)
    expect((seen[0].body.payload.transactions as Txn[])[0].amount).toBe(194.32)
  })

  test('typing a control total changes it', async () => {
    seedTotals()
    const { user } = await open(1)
    const bar = screen.getByRole('region', { name: 'Totals' })
    const ct = within(bar).getByRole('textbox', { name: 'Control total' })
    await user.clear(ct)
    await user.type(ct, '4,830.17{Enter}')
    expect(within(bar).getByTestId('difference')).toHaveTextContent('0.00')
    expect(within(bar).getByTestId('difference')).not.toHaveClass('text-destructive')
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
  })
})

describe('saving', () => {
  test('sends If-Match and {payload, note}; on 200 the tint clears and the new snapshot shows', async () => {
    const original = structuredClone(payloadOf(1))
    const { user } = await open(1)
    const panel = screen.getByRole('region', { name: 'Validation' })
    expect(panel).not.toHaveTextContent('checked just now')
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    await user.type(screen.getByPlaceholderText('What did you fix? (optional)'), 'payee per PDF')
    const seen = capturePut()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].ifMatch).toBe('"4"')
    expect(seen[0].body).toEqual({
      payload: draftToPayload(setCell(createDraft(original), '1', 'payee', 'ABC Plumbing LLC')),
      note: 'payee per PDF',
    })
    await waitFor(() => expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument())
    expect(cell(1, 'payee')).not.toHaveAttribute('data-dirty')
    expect(cell(1, 'payee')).toHaveTextContent('ABC Plumbing LLC')
    expect(panel).toHaveTextContent('checked just now')
    expect(screen.getByPlaceholderText('What did you fix? (optional)')).toHaveValue('')
  })

  test('note is omitted when empty', async () => {
    const { user } = await open(1)
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    const seen = capturePut()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect('note' in seen[0].body).toBe(false)
  })

  test('412 opens the conflict dialog; Copy writes the JSON; Reload drops the edits', async () => {
    const { user } = await open(1)
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    record(1).rowVersion = 9
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/Changed by Asha K/)
    expect(dialog).toHaveTextContent('Your edits are kept here; reload to see theirs.')
    await user.click(within(dialog).getByRole('button', { name: 'Copy my edits' }))
    expect(write).toHaveBeenCalledTimes(1)
    const copied = JSON.parse(write.mock.calls[0][0]) as Payload
    expect((copied.transactions as Txn[])[1].payee).toBe('ABC Plumbing LLC')
    expect(cell(1, 'payee')).toHaveAttribute('data-dirty', 'true')

    await user.click(within(dialog).getByRole('button', { name: 'Reload (lose my edits)' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(cell(1, 'payee')).toHaveTextContent('Metro Electric Co'))
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
  })

  test('409 not-editable reloads and shows the new status', async () => {
    const { user } = await open(1)
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    record(1).status = 'posted'
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'SR-000001' }).closest('header')).toHaveTextContent('Posted')
    expect(cell(1, 'payee')).toHaveTextContent('Metro Electric Co')
  })

  test('400 shows the problem detail and keeps the edits', async () => {
    const { user } = await open(1)
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    server.use(
      http.put(`${API}/:id`, () =>
        Response.json({ title: 'Payload refused', status: 400, detail: 'Row 2 is bad.' }, { status: 400, headers: { 'Content-Type': 'application/problem+json' } }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Row 2 is bad.')).toBeInTheDocument()
    expect(cell(1, 'payee')).toHaveAttribute('data-dirty', 'true')
  })

  test('without an ETag nothing is sent; the user is offered a reload', async () => {
    const { user, queryClient } = await open(1)
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    const key = ['requests', 'detail', '1']
    const cur = (queryClient as QueryClient).getQueryData(key) as { request: RequestDetail; etag: string }
    act(() => {
      queryClient.setQueryData(key, { ...cur, etag: '' })
    })
    const seen = capturePut()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('This request can’t be saved right now — reload and try again.')).toBeInTheDocument()
    expect(seen).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByText(/can’t be saved right now/)).not.toBeInTheDocument())
    expect(cell(1, 'payee')).toHaveAttribute('data-dirty', 'true')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].ifMatch).toBe('"4"')
  })
})

describe('who can edit', () => {
  test.each([
    ['a viewer', 1, 'u-viewer'],
    ['a posted request', 7, 'u-admin'],
  ])('%s: cells are not editable and there is no Save or Add row', async (_name, id, as) => {
    const { user } = await open(id, as)
    await user.click(cell(1, 'payee'))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add row' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Totals' })).queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('leaving with unsaved edits', () => {
  test('route change asks for confirmation; beforeunload is blocked while dirty', async () => {
    const { user, router } = await open(1)
    const before = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(before()).toBe(false)
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    expect(before()).toBe(true)

    act(() => {
      void router.navigate('/statements')
    })
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Leave without saving?')
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }))
    expect(router.state.location.pathname).toBe('/statements/1')
    expect(cell(1, 'payee')).toHaveAttribute('data-dirty', 'true')

    act(() => {
      void router.navigate('/statements')
    })
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/statements'))
    expect(before()).toBe(false)
  })

  test('switching tabs keeps the edits', async () => {
    const { user } = await open(1)
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    await user.click(screen.getByRole('tab', { name: 'History' }))
    await user.click(screen.getByRole('tab', { name: 'Transactions' }))
    expect(cell(1, 'payee')).toHaveAttribute('data-dirty', 'true')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('add and delete rows', () => {
  test('add appends an empty row; delete (confirmed) strikes through; save omits the deleted row', async () => {
    const { user } = await open(1)
    await user.click(screen.getByRole('button', { name: 'Add row' }))
    const added = document.querySelector('tr[data-row="12"]')!
    expect(added).not.toBeNull()
    expect(added.textContent).toMatch(/^13dash-/)
    await user.click(cell(12, 'memo'))
    await user.type(screen.getByRole('textbox', { name: 'Memo' }), 'new line{Enter}')

    await user.click(screen.getByRole('button', { name: 'Row 3 actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete row' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Delete row 3?')
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    const row3 = document.querySelector('tr[data-row="2"]')!
    expect(row3).toHaveAttribute('data-deleted', 'true')
    expect(row3).toHaveClass('line-through')
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument()

    const original = structuredClone(payloadOf(1).transactions as Txn[])
    const seen = capturePut()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    const sent = seen[0].body.payload.transactions as Txn[]
    expect(sent).toHaveLength(12)
    expect(sent).toEqual([...original.filter((_, i) => i !== 2), { externalId: expect.stringMatching(/^dash-/), memo: 'new line' }])
  })
})

describe('raw JSON editor', () => {
  test('invalid JSON disables Save; valid JSON saves with If-Match', async () => {
    const { user } = await open(4)
    const area = screen.getByRole('textbox', { name: 'Payload JSON' })
    await user.clear(area)
    await user.type(area, 'nope')
    expect(screen.getByText('Not valid JSON')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    const fixed = { reference: 'broken-shape', controlTotal: 0, transactions: [] }
    fireEvent.change(area, { target: { value: JSON.stringify(fixed) } })
    expect(screen.queryByText('Not valid JSON')).not.toBeInTheDocument()
    const seen = capturePut()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].ifMatch).toBe('"1"')
    expect(seen[0].body).toEqual({ payload: fixed })
    // The saved payload is now a table.
    expect(await screen.findByRole('columnheader', { name: 'Payee' })).toBeInTheDocument()
  })

  test('412: Copy my edits copies the text as typed, even when it is not valid JSON', async () => {
    const { user } = await open(4)
    const area = screen.getByRole('textbox', { name: 'Payload JSON' })
    fireEvent.change(area, { target: { value: '{ "reference": "mine" }' } })
    record(4).rowVersion = 9 // someone else saved: the mock answers 412
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      http.put(`${API}/4`, async () => {
        await gate
        return undefined
      }),
    )
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    // While the save is on its way, the text is changed to something that is not JSON.
    fireEvent.change(area, { target: { value: '{ "reference": "mine", oops' } })
    release()
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Copy my edits' }))
    expect(write).toHaveBeenCalledWith('{ "reference": "mine", oops')
  })

  test('read-only for a viewer', async () => {
    await open(4, 'u-viewer')
    expect(screen.getByTestId('raw-json').tagName).toBe('PRE')
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
})

describe('moving between requests', () => {
  test('following the duplicate link to a cached request at the same version shows and saves that request', async () => {
    // 12 and 5 are both pending at version 1; make 12 point at 5 as its duplicate.
    record(12).duplicate = { of: 5, reasons: ['same-reference'], acknowledgedBy: null }
    const payload5 = structuredClone(payloadOf(5))
    const { user, router } = await open(5)
    expect(document.querySelector('tr[data-row="11"]')).not.toBeNull()
    act(() => {
      void router.navigate('/statements/12')
    })
    await screen.findByRole('heading', { name: 'SR-000012' })
    await waitFor(() => expect(document.querySelector('tr[data-row="11"]')).toBeNull())
    await user.click(screen.getByRole('link', { name: 'Possible duplicate of SR-000005' }))
    await screen.findByRole('heading', { name: 'SR-000005' })
    await waitFor(() => expect(document.querySelector('tr[data-row="11"]')).not.toBeNull())

    await choosePayee(user, 1, 'ABC Plumbing LLC')
    const seen = capturePut()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].url).toBe(`${API}/5`)
    expect(seen[0].body.payload).toEqual(draftToPayload(setCell(createDraft(payload5), '1', 'payee', 'ABC Plumbing LLC')))
  })

  test('after leaving once, Stay on the next blocked navigation closes the dialog and stays', async () => {
    // Visit 12 first so it is cached: going back to it keeps the detail page mounted.
    const { user, router } = await open(12)
    act(() => {
      void router.navigate('/statements/1')
    })
    await screen.findByRole('heading', { name: 'SR-000001' })
    await waitFor(() => expect(document.querySelector('tr[data-row="11"]')).not.toBeNull())
    await choosePayee(user, 1, 'ABC Plumbing LLC')
    act(() => {
      void router.navigate('/statements/12')
    })
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }))
    await screen.findByRole('heading', { name: 'SR-000012' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()

    await choosePayee(user, 1, 'ABC Plumbing LLC')
    act(() => {
      void router.navigate('/statements')
    })
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stay' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/statements/12')
    expect(cell(1, 'payee')).toHaveAttribute('data-dirty', 'true')
  })
})
