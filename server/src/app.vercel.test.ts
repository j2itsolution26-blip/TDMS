import { describe, expect, it, vi } from 'vitest';

/*
 * On Vercel the API function must start without loading @fastify/static.
 *
 * The CDN serves the React app there, so the plugin is never registered — yet
 * when app.ts imported it at the top, loading the app loaded it, and its
 * require() of content-disposition 3 (an ES module) crashed the function on
 * Vercel's runtime before any route could answer (ERR_REQUIRE_ESM, every
 * /api request a 500). Here the module throws the moment anything loads it,
 * so this file fails if the app ever imports it eagerly again.
 */
vi.mock('@fastify/static', () => {
  throw new Error('@fastify/static was loaded although no client is being served');
});

describe('the API without a client to serve (the Vercel function)', () => {
  it('builds and answers without loading @fastify/static', async () => {
    const { buildApp } = await import('./app');
    const app = await buildApp();
    app.get('/ping', async () => ({ ok: true }));
    const res = await app.inject({ method: 'GET', url: '/ping' });
    await app.close();
    expect(res.statusCode).toBe(200);
    // The first import compiles the whole server, inside the test's own time.
  }, 60_000);
});
