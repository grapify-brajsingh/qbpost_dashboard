import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach } from 'vitest'
import type { RequestDetail } from '@/api/schema'
import { mockControl } from '@/mocks/db'
import { renderApp } from '@/test/render'

afterEach(() => localStorage.clear())

function open(id: number, as = 'u-admin') {
  mockControl.signInAs(as)
  return renderApp(`/statements/${id}`)
}

const rowsOf = () => document.querySelectorAll('tbody tr[data-index]')

function patchDetail(qc: QueryClient, id: number, patch: (r: RequestDetail) => RequestDetail) {
  const key = ['requests', 'detail', String(id)]
  const cur = qc.getQueryData(key) as { request: RequestDetail; etag: string }
  qc.setQueryData(key, { ...cur, request: patch(cur.request) })
}

describe('virtualised table', () => {
  test('renders far fewer than 210 rows, keeps the header, payload order', async () => {
    open(2)
    await screen.findByRole('columnheader', { name: 'Payee' })
    expect(document.querySelectorAll('tr').length).toBeLessThan(80)
    expect(document.querySelector('tr[data-index="0"]')).not.toBeNull()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      '#', 'Date', 'Kind', 'Payee', 'Account', 'Line account', 'Amount', 'Check no', 'Ref no', 'Memo', 'Last 4', 'External id',
    ])
    const container = screen.getByTestId('tx-scroll')
    fireEvent.scroll(container, { target: { scrollTop: 3000 } })
    expect(screen.getByRole('columnheader', { name: 'Payee' })).toBeInTheDocument()
  })
})

describe('findings', () => {
  test('only-problems toggle shows exactly the 3 problem rows; hover shows reason, detail, candidates', async () => {
    const { user } = open(2)
    await screen.findByRole('columnheader', { name: 'Payee' })
    await user.click(screen.getByRole('checkbox', { name: 'Only rows with problems' }))
    await waitFor(() => expect(rowsOf()).toHaveLength(3))
    expect([...rowsOf()].every((r) => r.getAttribute('data-problem') === 'true')).toBe(true)
    await user.hover(screen.getByRole('button', { name: 'Problems on row 89' }))
    expect((await screen.findAllByText('no-account-rule')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('No rule maps this payee to an expense account').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Candidates:/).length).toBeGreaterThan(0)
  })
})

describe('validation panel', () => {
  test('shows state (refused: control total off), counts, age, errors, unknown names; re-validate updates it', async () => {
    const { user } = open(2)
    const panel = await screen.findByRole('region', { name: 'Validation' })
    expect(within(panel).getByText('Refused')).toBeInTheDocument()
    expect(panel).toHaveTextContent(/submitted\s*210/i)
    expect(panel).toHaveTextContent(/held\s*3/i)
    expect(panel).toHaveTextContent(/checked .* ago/)
    expect(within(panel).getByText(/controlTotal .* does not match/)).toBeInTheDocument()
    expect(within(panel).getByText('Acme Roofing Inc')).toBeInTheDocument()
    expect(within(panel).queryByText('Validation is out of date')).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Re-validate' }))
    await waitFor(() => expect(panel).toHaveTextContent('checked just now'))
  })

  test('no Re-validate for a viewer', async () => {
    open(2, 'u-viewer')
    const panel = await screen.findByRole('region', { name: 'Validation' })
    expect(within(panel).queryByRole('button', { name: 'Re-validate' })).not.toBeInTheDocument()
  })

  test('says so when the validation is for an older version', async () => {
    const { queryClient } = open(1)
    await screen.findByRole('region', { name: 'Validation' })
    patchDetail(queryClient, 1, (r) => ({ ...r, currentVersion: 5, validation: { ...r.validation, versionNumber: 2 } }))
    expect(await screen.findByText('Validation is out of date')).toBeInTheDocument()
  })

  test('findings whose row is not found are listed', async () => {
    const { queryClient } = open(1)
    await screen.findByRole('region', { name: 'Validation' })
    patchDetail(queryClient, 1, (r) => ({
      ...r,
      validation: { ...r.validation, validation: [{ index: 99, reason: 'ghost-row', detail: 'gone' }] },
    }))
    expect(await screen.findByText('Row not found')).toBeInTheDocument()
    expect(screen.getByText('ghost-row')).toBeInTheDocument()
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
