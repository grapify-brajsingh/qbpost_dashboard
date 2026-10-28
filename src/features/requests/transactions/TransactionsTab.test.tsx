import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach } from 'vitest'
import { mockControl, mockDb } from '@/mocks/db'
import { renderApp } from '@/test/render'

afterEach(() => localStorage.clear())

function open(id: number, as = 'u-admin') {
  mockControl.signInAs(as)
  return renderApp(`/statements/${id}`)
}

const rowsOf = () => document.querySelectorAll('tbody tr[data-index]')

describe('virtualised table', () => {
  test('renders far fewer than 210 rows, keeps the header, payload order', async () => {
    open(2)
    await screen.findByRole('columnheader', { name: 'Payee' })
    expect(document.querySelectorAll('tr').length).toBeLessThan(80)
    expect(document.querySelector('tr[data-index="0"]')).not.toBeNull()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      'Post', '#', 'Date', 'Kind', 'Payee', 'Account', 'Line account', 'Memo', 'Amount', 'Check no', 'Ref no', 'Last 4', 'External id', 'Delete',
    ])
    const container = screen.getByTestId('tx-scroll')
    fireEvent.scroll(container, { target: { scrollTop: 3000 } })
    expect(screen.getByRole('columnheader', { name: 'Payee' })).toBeInTheDocument()
  })
})

describe('findings', () => {
  test('"Has a problem" shows exactly the 3 problem rows; hover shows reason, detail, candidates', async () => {
    const { user } = open(2)
    await screen.findByRole('columnheader', { name: 'Payee' })
    await user.click(screen.getByRole('button', { name: 'Has a problem' }))
    await waitFor(() => expect(rowsOf()).toHaveLength(3))
    expect([...rowsOf()].every((r) => r.getAttribute('data-problem') === 'true')).toBe(true)
    await user.hover(screen.getByRole('button', { name: 'Problems on row 89' }))
    expect((await screen.findAllByText('no-account-rule')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('No rule maps this payee to an expense account').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Candidates:/).length).toBeGreaterThan(0)
  })
})

// v1's validation panel: the snapshot now lives in the sheet's Results tab, Validate in the save bar, and the rows keep
// their marks ("not in QuickBooks" names, problem reasons).
describe('validation', () => {
  test('Validate re-runs it; Results shows state and errors; an unknown name is flagged in its cell', async () => {
    const { user } = open(2)
    await screen.findByRole('columnheader', { name: 'Payee' })
    const bar = screen.getByRole('region', { name: 'Save bar' })
    await user.click(within(bar).getByRole('button', { name: 'Validate' }))
    await waitFor(() => expect(within(bar).getByRole('button', { name: 'Validate' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Results' }))
    const block = await within(await screen.findByRole('dialog')).findByRole('region', { name: 'Latest validation' })
    expect(block).toHaveTextContent('Refused by the checks')
    expect(block).toHaveTextContent(/Checked/)
    expect(within(block).getByText(/controlTotal .* does not match/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Has a problem' }))
    const payee = await waitFor(() => {
      const td = document.querySelector('tr[data-row="16"] td[data-field="payee"]')
      if (!td) throw new Error('row 17 not shown')
      return td as HTMLElement
    })
    expect(within(payee).getByText('Acme Roofing Inc')).toBeInTheDocument()
    expect(within(payee).getByText('not in QuickBooks')).toBeInTheDocument()
  })

  test('no Validate for a viewer', async () => {
    open(2, 'u-viewer')
    await screen.findByRole('columnheader', { name: 'Payee' })
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
  })

  test('findings whose row is not found are listed in Results', async () => {
    mockDb.requests.find((r) => r.id === 1)!.validation.validation = [{ index: 99, reason: 'ghost-row', detail: 'gone' }]
    const { user } = open(1)
    await screen.findByRole('columnheader', { name: 'Payee' })
    await user.click(screen.getByRole('button', { name: 'Results' }))
    const problems = await within(await screen.findByRole('dialog')).findByRole('list', { name: 'Problems' })
    expect(problems).toHaveTextContent('Row 100: ghost-row — gone')
    expect(document.querySelectorAll('tr[data-problem="true"]')).toHaveLength(0)
  })
})

describe('unreadable payloads', () => {
  test('marks the kind cell of row 4', async () => {
    open(3)
    const cell = await screen.findByText('Cheque')
    expect(cell.closest('td')).toHaveAttribute('data-read-error', 'true')
    expect(cell.closest('tr')).toHaveAttribute('data-problem', 'true')
  })

  test('non-array transactions shows raw JSON with the read errors above (read-only for a viewer)', async () => {
    open(4, 'u-viewer')
    const raw = await screen.findByTestId('raw-json')
    expect(raw.tagName).toBe('PRE')
    expect(raw).toHaveTextContent('"not-an-array"')
    const errors = screen.getByRole('list', { name: 'Read errors' })
    expect(errors.compareDocumentPosition(raw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(errors).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('column menu', () => {
  test('hiding Check no persists across a re-render', async () => {
    const first = open(1)
    await first.user.click(await screen.findByRole('button', { name: 'Columns' }))
    await first.user.click(await screen.findByRole('menuitemcheckbox', { name: 'Check no' }))
    expect(screen.queryByRole('columnheader', { name: 'Check no' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('qbpost-tx-columns')!)).toEqual(['checkNo'])
    first.unmount()
    open(1)
    await screen.findByRole('columnheader', { name: 'Payee' })
    expect(screen.queryByRole('columnheader', { name: 'Check no' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Ref no' })).toBeInTheDocument()
  })
})

describe('row heights', () => {
  test('a row that becomes taller (a "was" line under an edited cell) is re-measured, so the spacer above stays right', async () => {
    const { user } = open(2)
    await screen.findByRole('columnheader', { name: 'Payee' })
    const box = screen.getByTestId('tx-scroll')
    const padTop = () => {
      const first = box.querySelector<HTMLElement>('tbody tr[aria-hidden]')
      return first && box.querySelector('tbody tr')?.getAttribute('aria-hidden') ? parseFloat(first.style.height) : 0
    }
    const scrollTo = (top: number) => fireEvent.scroll(box, { target: { scrollTop: top } })
    // Rows are 40 px, rows with a finding 56 px (row 17 is one of them, above the scrolled-to window).
    scrollTo(3020)
    await waitFor(() => expect(padTop()).toBeGreaterThan(0))
    expect(padTop() % 40).toBe(16)

    scrollTo(0)
    await waitFor(() => expect(document.querySelector('tr[data-row="0"]')).not.toBeNull())
    await user.click(document.querySelector<HTMLElement>('tr[data-row="0"] td[data-field="memo"]')!)
    await user.type(screen.getByRole('textbox', { name: 'Memo' }), ' x{Enter}')
    scrollTo(3020)
    await waitFor(() => expect(padTop() % 40).toBe(32))
  })
})
