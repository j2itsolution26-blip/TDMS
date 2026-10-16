import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, STRICT_TRANSPORT_SECURITY, securityHeaders } from './security-headers';

// On Vercel the CDN serves the HTML, so vercel.json carries its own copy of
// these headers. This keeps the two from drifting apart.
const vercel = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const cdn = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]));

describe('security headers', () => {
  it('vercel.json serves the same CSP and HSTS as the server', () => {
    expect(cdn['Content-Security-Policy-Report-Only']).toBe(CONTENT_SECURITY_POLICY);
    expect(cdn['Strict-Transport-Security']).toBe(STRICT_TRANSPORT_SECURITY);
  });

  it('vercel.json carries every header the server sends in production', () => {
    for (const [key, value] of Object.entries(securityHeaders(true))) {
      if (key === 'X-DNS-Prefetch-Control') continue; // API-only nicety
      expect(cdn[key], key).toBe(value);
    }
  });

  it('development gets neither HSTS (plain http) nor the CSP (Vite injects inline scripts)', () => {
    const dev = securityHeaders(false);
    expect(dev['Strict-Transport-Security']).toBeUndefined();
    expect(dev['Content-Security-Policy-Report-Only']).toBeUndefined();
  });

  it('the CSP allows no third-party or inline script and no framing', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe/);
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });
});
