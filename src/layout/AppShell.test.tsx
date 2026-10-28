import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '@/test/render'
import { server } from '@/mocks/server'
import { mockControl } from '@/mocks/db'

describe('app shell', () => {
  test('Users link is visible for an admin', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/requests')
    expect(await screen.findByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users')
    expect(screen.getByRole('link', { name: 'Requests' })).toBeInTheDocument()
  })

  test('Users link is absent for an editor', async () => {
    mockControl.signInAs('u-editor')
    renderApp('/requests')
    await screen.findByRole('link', { name: 'Requests' })
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  test('health light is OK on 200', async () => {
    mockControl.signInAs('u-admin')
    renderApp('/requests')
    expect(await screen.findByLabelText('Database: OK')).toBeInTheDocument()
  })

  test('health light is unavailable on 503', async () => {
    mockControl.signInAs('u-admin')
    server.use(
      http.get('/api/v1/health/database', () =>
        HttpResponse.json(
          { title: 'Database unavailable', status: 503, code: 'database-unavailable' },
          { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderApp('/requests')
    expect(await screen.findByLabelText('Database: unavailable')).toBeInTheDocument()
  })
})
