/**
 * LIVE browser tests: the real UI against the linked Supabase project, using
 * the dedicated test accounts in .env.live.local. Not part of `npm run test:e2e`.
 *   npm run test:e2e:live
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e-live',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5175', channel: 'chrome', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'npx vite --port 5175 --strictPort', url: 'http://localhost:5175', reuseExistingServer: false, timeout: 60_000 },
});
