/**
 * LIVE integration tests against the linked Supabase project (real Auth,
 * PostgREST, RLS, Storage, RPCs, Edge Function). Never part of `npm test`.
 * Requires .env (browser-safe URL + anon key) and .env.live.local (dedicated
 * test accounts from scripts/live/provision-test-users.mjs).
 *   npm run test:live
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
