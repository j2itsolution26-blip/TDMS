import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, proxyTrusted } from './app';

describe('proxyTrusted', () => {
  it('trusts the proxy unless told otherwise (Vercel, Render, nginx)', () => {
    expect(proxyTrusted({})).toBe(true);
    expect(proxyTrusted({ TRUST_PROXY: 'true' })).toBe(true);
    expect(proxyTrusted({ TRUST_PROXY: '1' })).toBe(true);
  });
  it('is off for false, 0 or no, in any case', () => {
    for (const v of ['false', 'FALSE', ' 0 ', 'no']) expect(proxyTrusted({ TRUST_PROXY: v })).toBe(false);
  });
});

describe('forwarded headers', () => {
  const previous = process.env.TRUST_PROXY;
  afterEach(() => {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  });

  async function seenForwardedFor(trust: string | undefined) {
    if (trust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = trust;
    const app = await buildApp();
    app.get('/echo-ip', async (request) => ({ xff: request.headers['x-forwarded-for'] ?? null, realIp: request.headers['x-real-ip'] ?? null }));
    const res = await app.inject({ method: 'GET', url: '/echo-ip', headers: { 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9' } });
    await app.close();
    return res.json() as { xff: string | null; realIp: string | null };
  }

  it('without a trusted proxy, a client-supplied X-Forwarded-For is replaced by the socket address', async () => {
    const seen = await seenForwardedFor('false');
    expect(seen.xff).not.toBe('203.0.113.9');
    expect(seen.realIp).toBeNull();
  });

  it('behind a trusted proxy, the forwarded address is kept (as on Vercel)', async () => {
    expect((await seenForwardedFor(undefined)).xff).toBe('203.0.113.9');
  });
});
