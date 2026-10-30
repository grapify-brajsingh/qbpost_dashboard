import { defineConfig, devices } from '@playwright/test'

// One-off walkthrough that fills a fresh integration stack with a realistic first week, through the UI.
// Run on an empty database: docker compose -f docker-compose.integration.yml down -v && ... up -d
export default defineConfig({
  testDir: 'demo',
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 600_000,
  use: { baseURL: 'http://localhost:8080', trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
