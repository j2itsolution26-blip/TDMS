import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit tests only — the pure logic that the migration had to port exactly
 * (policies, validation rules, identifier resolution, date/format helpers).
 * Anything needing a database is covered by the end-to-end run documented
 * in docs/migration.md, so `npm test` stays fast and offline.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      /*
       * `server-only` is a build-time tripwire: importing it from a client
       * bundle is meant to fail. Vitest is neither bundle, so it is stubbed
       * here. The protection it provides still holds where it matters —
       * `next build` enforces it, and that build runs in CI.
       */
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
});
