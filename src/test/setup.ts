import '@testing-library/jest-dom/vitest'
import { mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  mockDb.reset()
})
afterAll(() => server.close())
