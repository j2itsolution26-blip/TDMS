import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`https://tdms.example.com${path}`, {
    method: init.method ?? 'GET',
    headers: { host: 'tdms.example.com', ...init.headers },
  });
}

describe('middleware: cross-site API writes', () => {
  it('blocks a POST whose Origin is another site, even to a public auth endpoint', async () => {
    const res = middleware(request('/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
  });

  it('blocks an authenticated DELETE from another site', () => {
    const res = middleware(
      request('/api/students/1', {
        method: 'DELETE',
        headers: { origin: 'https://evil.example', cookie: 'tdms_session=abc' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('blocks an opaque "null" Origin', () => {
    const res = middleware(request('/api/auth/login', { method: 'POST', headers: { origin: 'null' } }));
    expect(res.status).toBe(403);
  });

  it('blocks a write with no Origin when the browser marks it cross-site', () => {
    const res = middleware(request('/api/auth/login', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }));
    expect(res.status).toBe(403);
  });

  it('allows a same-origin POST', () => {
    const res = middleware(request('/api/auth/login', { method: 'POST', headers: { origin: 'https://tdms.example.com' } }));
    expect(res.status).toBe(200);
  });

  it('allows a same-origin POST behind a proxy that rewrites Host', () => {
    const res = middleware(
      request('/api/auth/login', {
        method: 'POST',
        headers: { host: 'internal:3000', 'x-forwarded-host': 'tdms.example.com', origin: 'https://tdms.example.com' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('never blocks a GET, whatever its Origin', () => {
    const res = middleware(request('/api/health', { headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(200);
  });

  it('still answers 401, not 403, for a same-site write without a session', () => {
    const res = middleware(request('/api/students', { method: 'POST', headers: { origin: 'https://tdms.example.com' } }));
    expect(res.status).toBe(401);
  });
});
