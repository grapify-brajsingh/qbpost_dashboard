import { render, screen } from '@testing-library/react'
import { addRow, createDraft, postStats, rowsSumCents, setPost } from '@/features/requests/transactions/draft'
import { ReconciliationMeter } from './ReconciliationMeter'

const meterFor = (rows: object[], controlTotal: unknown) => {
  const d = createDraft({ controlTotal, transactions: rows })
  render(<ReconciliationMeter allCents={rowsSumCents(d)} controlTotal={controlTotal} postStats={postStats(d)} />)
}

it('meter matches to the cent when all rows (including skipped) equal control; short/over otherwise', () => {
  meterFor([{ amount: 62.1 }, { amount: 2250, post: false }], 2312.1)
  expect(screen.getByText('Matches to the cent')).toHaveClass('bg-success-soft', 'text-success')
  expect(screen.getByText("1 of 2 rows will post (1 marked don't post, 2,250.00)")).toBeInTheDocument()
  expect(screen.getByText('Control total 2,312.10, never changed by the app')).toBeInTheDocument()
  expect(screen.getByText(/Sum of all rows/)).toBeInTheDocument()
  expect(screen.getByTestId('meter-bar')).toHaveStyle({ width: '100%' })
})

it('shows short and over in rose', () => {
  meterFor([{ amount: 90 }], 100)
  expect(screen.getByText('Short by 10.00')).toHaveClass('bg-destructive-soft', 'text-destructive')
  expect(screen.getByTestId('meter-bar')).toHaveStyle({ width: '90%' })
})

it('over caps the bar at 100%', () => {
  meterFor([{ amount: 110 }], 100)
  expect(screen.getByText('Over by 10.00')).toBeInTheDocument()
  expect(screen.getByTestId('meter-bar')).toHaveStyle({ width: '100%' })
})

it('no control total', () => {
  meterFor([{ amount: 1 }], null)
  expect(screen.getAllByText('No control total')).toHaveLength(2)
  expect(screen.getByTestId('meter-delta')).toHaveClass('text-destructive')
})

it('meter ignores table filters: it takes postStats of the whole draft', () => {
  let d = createDraft({ controlTotal: 3, transactions: [{ amount: 1 }, { amount: 2 }] })
  d = setPost(d, '1', false)
  d = addRow(d, { amount: 0 })
  render(<ReconciliationMeter allCents={rowsSumCents(d)} controlTotal={3} postStats={postStats(d)} />)
  expect(screen.getByText(/2 of 3 rows will post/)).toBeInTheDocument()
  expect(screen.getByText('Matches to the cent')).toBeInTheDocument()
})
