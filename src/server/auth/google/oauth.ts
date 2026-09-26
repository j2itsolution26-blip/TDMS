import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from '@/lib/http';

/**
 * Google OAuth 2.0 / OpenID Connect.
 *
 * Authorization Code flow with PKCE. The browser never sees the client
 * secret, and the identity that comes back is verified here rather than
 * taken on trust:
 *
 *   1. /api/auth/google mints `state`, `nonce` and a PKCE verifier, stores
 *      them in short-lived HttpOnly cookies, and redirects to Google.
 *   2. Google authenticates the person — we never see a Google password and
 *      never ask for one.
 *   3. The callback checks `state` against the cookie (CSRF), exchanges the
 *      code for tokens using the secret plus the PKCE verifier, then
 *      VERIFIES the ID token's signature against Google's published keys and
 *      checks every claim that matters.
 *
 * Scopes are `openid email profile` and nothing else. Signing somebody in
 * needs their identity, not access to their mailbox — no Gmail scope is
 * requested, and none would be granted.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Minimum needed to identify a person. Deliberately no Gmail scope. */
const SCOPES = ['openid', 'email', 'profile'];

/**
 * Google's signing keys, fetched once and cached by `jose` with the
 * cache headers Google sends. Keys rotate, so they must not be pinned.
 */
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  );
}

function requireConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    // Deliberately vague to the caller; the detail goes to the server log.
    console.error(
      '[TDMS] Google sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.',
    );
    throw new AppError('Google sign-in is not available. Please contact the administrator.', 503);
  }

  return { clientId, clientSecret, redirectUri };
}

// --- Step 1: the redirect --------------------------------------------------

export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export function buildAuthorizationRequest(): AuthorizationRequest {
  const { clientId, redirectUri } = requireConfig();

  const state = base64Url(randomBytes(32));
  const nonce = base64Url(randomBytes(32));
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    /*
     * `select_account` rather than `consent`: re-consenting on every sign-in
     * is noise, but letting somebody pick which Google account to use is
     * important when a person has a personal and an institutional one open.
     */
    prompt: 'select_account',
    /*
     * A hint, not a control. Google will still return other domains, which
     * is why the domain is re-checked server-side after verification. It
     * just saves the user from picking an account that cannot work.
     */
    hd: (process.env.INSTITUTIONAL_EMAIL_DOMAIN ?? 'asiancollege.edu.ph').toLowerCase(),
    // No refresh token is wanted: TDMS acts on nobody's behalf offline.
    access_type: 'online',
    include_granted_scopes: 'true',
  });

  return { url: `${AUTH_ENDPOINT}?${params.toString()}`, state, nonce, codeVerifier };
}

// --- Step 3: exchange and verify ------------------------------------------

/** The subset of the verified ID token this application uses. */
export interface GoogleIdentity {
  /** Google's stable subject identifier. The join key. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  picture: string | null;
  /** Workspace hosted domain, present for managed accounts. */
  hostedDomain: string | null;
}

async function exchangeCode(code: string, codeVerifier: string): Promise<string> {
  const { clientId, clientSecret, redirectUri } = requireConfig();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    /*
     * Google's error body can echo request parameters, so only the status is
     * logged — never the body, which could carry the code or the secret.
     */
    console.error('[TDMS] Google token exchange failed.', { status: response.status });
    throw new AppError('Google sign-in failed. Please try again.', 502);
  }

  const payload = (await response.json()) as { id_token?: string };
  if (!payload.id_token) {
    console.error('[TDMS] Google token response contained no id_token.');
    throw new AppError('Google sign-in failed. Please try again.', 502);
  }

  return payload.id_token;
}

/**
 * Verify the ID token properly rather than decoding it.
 *
 * The token arrives over TLS from Google's token endpoint, authenticated
 * with our client secret, so tampering is already implausible — but
 * verifying the signature and claims costs one cached key fetch and removes
 * the need to reason about that at all. `jose` checks the signature, `iss`,
 * `aud` and expiry; the nonce is checked here because only this request
 * knows what it should be.
 */
export async function verifyIdToken(idToken: string, expectedNonce: string): Promise<GoogleIdentity> {
  const { clientId } = requireConfig();

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(idToken, jwks, {
      issuer: ISSUERS,
      audience: clientId,
      // Google's clocks and ours are not identical; allow a little slack.
      clockTolerance: '60s',
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (error) {
    console.error('[TDMS] Google ID token failed verification.', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    throw new AppError('Google sign-in could not be verified. Please try again.', 401);
  }

  /*
   * Replay protection. Without this, an ID token captured from one sign-in
   * could be presented again at the callback.
   */
  if (typeof payload.nonce !== 'string' || payload.nonce !== expectedNonce) {
    console.error('[TDMS] Google ID token nonce did not match the request.');
    throw new AppError('Google sign-in could not be verified. Please try again.', 401);
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload.email === 'string' ? payload.email : '';

  if (!sub || !email) {
    console.error('[TDMS] Google ID token was missing sub or email.');
    throw new AppError('Google did not return the information TDMS needs.', 401);
  }

  return {
    sub,
    email,
    // Google sends this as a boolean or the string "true" depending on age.
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: typeof payload.name === 'string' ? payload.name : null,
    givenName: typeof payload.given_name === 'string' ? payload.given_name : null,
    familyName: typeof payload.family_name === 'string' ? payload.family_name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    hostedDomain: typeof payload.hd === 'string' ? payload.hd : null,
  };
}

/** Exchange then verify — the whole of step 3. */
export async function completeAuthorization(
  code: string,
  codeVerifier: string,
  expectedNonce: string,
): Promise<GoogleIdentity> {
  const idToken = await exchangeCode(code, codeVerifier);
  return verifyIdToken(idToken, expectedNonce);
}
