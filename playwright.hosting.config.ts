/**
 * HOSTING check: the PRODUCTION build served with vercel.json's rules
 * (scripts/serve-like-vercel.mjs) — proves deep links and refreshes of shared
 * maps, chess games and personal maps resolve to the app instead of a 404.
 *   npx playwright test -c playwright.hosting.config.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e-hosting',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4180', channel: 'chrome', viewport: { width: 1280, height: 800 } },
  webServer: {
    command: 'npx vite build --outDir dist && node scripts/serve-like-vercel.mjs 4180',
    url: 'http://localhost:4180',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
