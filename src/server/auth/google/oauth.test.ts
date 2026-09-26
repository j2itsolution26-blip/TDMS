import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAuthorizationRequest, googleConfigured } from './oauth';

/**
 * The authorization request is where PKCE, state and nonce are established.
 * If any of them is weak or missing, the callback's protections are hollow,
 * so each is pinned here.
 */

const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_REDIRECT_URI = 'https://tdms.example/api/auth/google/callback';
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('configuration detection', () => {
  it('reports configured when all three values are present', () => {
    expect(googleConfigured()).toBe(true);
  });

  it('reports unconfigured when any is missing', () => {
    for (const key of KEYS) {
      const keep = process.env[key];
      delete process.env[key];
      expect(googleConfigured()).toBe(false);
      process.env[key] = keep;
    }
  });

  it('throws a user-safe error rather than building a broken URL', () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(() => buildAuthorizationRequest()).toThrowError(/not available/i);
  });
});

describe('authorization request', () => {
  it('targets Google and carries the client and redirect', () => {
    const { url } = buildAuthorizationRequest();
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('client_id')).toBe(process.env.GOOGLE_CLIENT_ID);
    expect(parsed.searchParams.get('redirect_uri')).toBe(process.env.GOOGLE_REDIRECT_URI);
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('requests ONLY identity scopes — never Gmail', () => {
    const { url } = buildAuthorizationRequest();
    const scope = new URL(url).searchParams.get('scope') ?? '';
    expect(scope.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
    // Signing somebody in does not require reading their mail.
    expect(scope).not.toMatch(/gmail|mail\.google|drive|calendar/i);
  });

  it('does not ask for offline access', () => {
    // TDMS never acts on anyone's behalf while they are away, so a refresh
    // token would be a credential held for no reason.
    const { url } = buildAuthorizationRequest();
    expect(new URL(url).searchParams.get('access_type')).toBe('online');
  });

  it('uses PKCE with S256, not plain', () => {
    const { url, codeVerifier } = buildAuthorizationRequest();
    const params = new URL(url).searchParams;
    expect(params.get('code_challenge_method')).toBe('S256');
    const challenge = params.get('code_challenge') ?? '';
    expect(challenge.length).toBeGreaterThan(20);
    // The challenge must be a digest, never the verifier itself.
    expect(challenge).not.toBe(codeVerifier);
  });

  it('derives the challenge as base64url(sha256(verifier))', async () => {
    const { createHash } = await import('node:crypto');
    const { url, codeVerifier } = buildAuthorizationRequest();
    const expected = createHash('sha256').update(codeVerifier).digest('base64url');
    expect(new URL(url).searchParams.get('code_challenge')).toBe(expected);
  });

  it('sends state and nonce, and echoes the nonce to Google', () => {
    const { url, state, nonce } = buildAuthorizationRequest();
    const params = new URL(url).searchParams;
    expect(params.get('state')).toBe(state);
    expect(params.get('nonce')).toBe(nonce);
  });

  it('generates high-entropy, non-repeating state, nonce and verifier', () => {
    const requests = Array.from({ length: 40 }, () => buildAuthorizationRequest());

    for (const field of ['state', 'nonce', 'codeVerifier'] as const) {
      const values = requests.map((r) => r[field]);
      // 32 bytes base64url -> 43 characters.
      expect(values.every((v) => v.length >= 43)).toBe(true);
      expect(new Set(values).size).toBe(requests.length);
    }
  });

  it('never puts the client secret in the redirect URL', () => {
    const { url } = buildAuthorizationRequest();
    expect(url).not.toContain(process.env.GOOGLE_CLIENT_SECRET!);
    expect(url).not.toContain('client_secret');
  });

  it('hints the institutional domain without relying on it', () => {
    // `hd` improves the account chooser; it is not a security control,
    // which is why the domain is re-checked after verification.
    const { url } = buildAuthorizationRequest();
    expect(new URL(url).searchParams.get('hd')).toBe('asiancollege.edu.ph');
  });
});
