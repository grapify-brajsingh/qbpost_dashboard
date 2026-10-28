import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { useUrlFilters, type FilterSpec } from './useUrlFilters'

const spec = {
  q: { kind: 'text' },
  receivedFrom: { kind: 'date' },
  minTotal: { kind: 'number' },
  problems: { kind: 'bool' },
  status: { kind: 'enumList', values: ['pending', 'posted', 'failed'] },
  tab: { kind: 'enum', values: ['all', 'pending'] },
} as const satisfies FilterSpec

function Probe() {
  const { values, set, clear, activeCount } = useUrlFilters(spec)
  const loc = useLocation()
  return (
    <div>
      <output data-testid="values">{JSON.stringify(values)}</output>
      <output data-testid="search">{loc.search}</output>
      <output data-testid="count">{activeCount}</output>
      <button onClick={() => set({ q: 'a  b', receivedFrom: '2026-10-05', minTotal: 12.5, problems: true, status: ['posted', 'failed'] })}>
        all
      </button>
      <button onClick={() => set({ tab: 'pending' })}>tab</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

function setup(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const values = () => JSON.parse(screen.getByTestId('values').textContent!)
const search = () => new URLSearchParams(screen.getByTestId('search').textContent!)

describe('useUrlFilters', () => {
  it('round-trips text, date, number, bool, enumList through the URL', async () => {
    const user = setup('/s')
    await user.click(screen.getByText('all'))
    expect(values()).toEqual({
      q: 'a  b',
      receivedFrom: '2026-10-05',
      minTotal: 12.5,
      problems: true,
      status: ['posted', 'failed'],
    })
    expect(search().get('status')).toBe('posted,failed')
    expect(screen.getByTestId('count')).toHaveTextContent('5')
  })

  it('ignores ?minTotal=abc&receivedFrom=2026-13-45&tab=nope and keeps other params', () => {
    setup('/s?minTotal=abc&receivedFrom=2026-13-45&tab=nope&status=bogus&other=1')
    expect(values()).toEqual({})
    expect(screen.getByTestId('count')).toHaveTextContent('0')
    expect(search().get('other')).toBe('1')
  })

  it('does not count a false boolean as an active filter', () => {
    setup('/s?problems=false')
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('set() resets page to 1; clear() removes only spec keys', async () => {
    const user = setup('/s?page=3&tab=all&keep=x&q=hi')
    await user.click(screen.getByText('tab'))
    expect(search().get('page')).toBeNull()
    expect(search().get('tab')).toBe('pending')
    expect(search().get('keep')).toBe('x')

    await user.click(screen.getByText('clear'))
    expect([...search().keys()]).toEqual(['keep'])
  })
})
