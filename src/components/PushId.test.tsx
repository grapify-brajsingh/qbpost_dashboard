import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PushId } from './PushId'

const FULL = '7f3a2b10-1111-2222-3333-44445555a0c21'

function setup(value: string | null) {
  const user = userEvent.setup()
  render(
    <TooltipProvider>
      <PushId value={value} fallback="—" />
    </TooltipProvider>,
  )
  return user
}

describe('PushId', () => {
  test('shortens the id to first four and last three characters', () => {
    setup(FULL)
    expect(screen.getByText('7f3a…c21')).toBeInTheDocument()
  })

  test('copy writes the full id', async () => {
    const user = setup(FULL)
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: 'Copy push id' }))
    expect(write).toHaveBeenCalledWith(FULL)
  })

  test('null renders the fallback and no copy button', () => {
    setup(null)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
