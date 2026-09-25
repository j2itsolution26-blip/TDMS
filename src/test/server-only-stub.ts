/**
 * Test-time stand-in for the `server-only` package.
 *
 * See the alias in vitest.config.ts for why this exists. Deliberately
 * empty: the real module's only job is to throw when bundled for the
 * browser, which is a build concern, not a runtime one.
 */
export {};
