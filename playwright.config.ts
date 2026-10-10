/**
 * Browser E2E tests. They run against the Vite dev server in "no Supabase"
 * mode (env vars blanked), which exercises Discover with labeled development
 * fixtures, filters, search, map interaction, welcome overlay, layout and the
 * dev-only image-marker harness. Flows that need a real Supabase project are
 * covered at the database level by tests/db (PGlite) — see README.
 *
 * Uses the locally installed Google Chrome (channel: 'chrome'); run
 * `npx playwright install chromium` and drop `channel` if Chrome isn't installed.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
