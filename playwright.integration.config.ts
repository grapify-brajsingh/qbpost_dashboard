import { defineConfig, devices } from '@playwright/test'

// End-to-end tests against the real stack (docker-compose.integration.yml): nginx + the dashboard build, the
// QbAutopost API with a simulated QuickBooks, PostgreSQL and the OpenRouter stand-in. Start the stack first.
export default defineConfig({
  testDir: 'e2e-integration',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: process.env.INTEGRATION_BASE_URL ?? 'http://localhost:8080', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
