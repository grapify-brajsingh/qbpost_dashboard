import { screen } from '@testing-library/react'
import { renderApp } from '@/test/render'

test('unknown route shows not found with a link to statements', async () => {
  renderApp('/nope')
  expect(await screen.findByText(/not found/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /statements/i })).toHaveAttribute('href', '/statements')
})
