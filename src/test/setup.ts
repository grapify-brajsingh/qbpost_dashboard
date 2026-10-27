import '@testing-library/jest-dom/vitest'
import { server } from '@/mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  // TODO(later tasks): call mockDb.reset() here once src/mocks/db.ts exists.
})
afterAll(() => server.close())
