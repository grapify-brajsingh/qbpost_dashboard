import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { DateRangeChip } from './DateRangeChip'
import { FilterChip } from './FilterChip'
import { SearchBox } from './SearchBox'

const options = [
  { value: 'pending', label: 'Pending' },
  { value: 'posted', label: 'Posted' },
]

describe('FilterChip', () => {
  it('shows "+ Status" dashed when unset and "Status: Posted ✕" when set; ✕ clears it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<FilterChip label="Status" options={options} onChange={onChange} />)
    const unset = screen.getByRole('button', { name: 'Status' })
    expect(unset).toHaveClass('border-dashed')

    rerender(<FilterChip label="Status" value="posted" options={options} onChange={onChange} />)
    const set = screen.getByRole('button', { name: 'Status: Posted' })
    expect(set).toHaveClass('border-solid')
    await user.click(screen.getByRole('button', { name: 'Clear Status filter' }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('picks an option from the popover', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterChip label="Status" options={options} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Status' }))
    await user.click(await screen.findByText('Posted'))
    expect(onChange).toHaveBeenCalledWith('posted')
  })
})

describe('DateRangeChip', () => {
  afterEach(() => vi.useRealTimers())

  it('preset "Last 7 days" sets from/to as yyyy-MM-dd in local time', async () => {
    // 00:30 local on the 1st: toISOString() would give the previous day in UTC+ zones.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 0, 30))
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateRangeChip label="Received" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /Received/ }))
    await user.click(await screen.findByRole('button', { name: 'Last 7 days' }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-26', to: '2026-11-01' })
  })
})

describe('SearchBox', () => {
  afterEach(() => vi.useRealTimers())

  it('debounces 250 ms and keeps inner whitespace as typed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null })
    const onChange = vi.fn()
    render(<SearchBox value={undefined} onChange={onChange} placeholder="Search" />)
    await user.type(screen.getByRole('searchbox'), 'ab  c ')
    expect(onChange).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('ab  c ')
    expect(screen.getByRole('searchbox')).toHaveValue('ab  c ')
  })

  it('does not overwrite typed text when the caller echoes it back trimmed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null })
    const { rerender } = render(<SearchBox value={undefined} onChange={() => {}} />)
    await user.type(screen.getByRole('searchbox'), 'a b ')
    rerender(<SearchBox value="a b" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('a b ')
    rerender(<SearchBox value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })
})
