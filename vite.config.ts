/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    // maplibre-gl is a single ~1 MB library needed for the first screen; it is
    // isolated in its own long-cacheable chunk. Everything else is far smaller.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        // Stable vendor chunks cache independently of app releases.
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@tanstack)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    // Unit/component tests run in jsdom; database tests (tests/db) opt into
    // the node environment with a per-file `@vitest-environment node` pragma.
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/db/**/*.test.ts', 'tests/components/**/*.test.tsx'],
    testTimeout: 30000,
  },
});
