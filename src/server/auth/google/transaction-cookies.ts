import 'server-only';
import { cookies } from 'next/headers';

/**
 * The short-lived cookies that carry one OAuth attempt from the redirect to
 * the callback: `state` (CSRF), `nonce` (replay) and the PKCE verifier.
 *
 * Cookies rather than a database row or server memory, because serverless
 * functions share neither: the callback can land on a different instance
 * from the one that started the flow. They are HttpOnly, so the page cannot
 * read them; `secure` in production; and they expire in ten minutes, which
 * is far longer than a sign-in takes and far shorter than a useful attack
 * window.
 *
 * SameSite is `lax`, not `strict`. The callback arrives as a top-level
 * redirect from accounts.google.com, and `strict` would withhold the cookies
 * on exactly that request — the flow would fail every time with a state
 * mismatch. `lax` sends them on a top-level GET, which is precisely this
 * case and no more.
 */

const STATE = 'tdms_oauth_state';
const NONCE = 'tdms_oauth_nonce';
const VERIFIER = 'tdms_oauth_verifier';
const RETURN_TO = 'tdms_oauth_return_to';

const TEN_MINUTES = 10 * 60;

function options(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export interface OAuthTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string | null;
}

/** Called from the route handler that starts the flow. */
export async function storeTransaction(t: {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo?: string | null;
}): Promise<void> {
  const jar = await cookies();
  jar.set(STATE, t.state, options(TEN_MINUTES));
  jar.set(NONCE, t.nonce, options(TEN_MINUTES));
  jar.set(VERIFIER, t.codeVerifier, options(TEN_MINUTES));

  if (t.returnTo) jar.set(RETURN_TO, t.returnTo, options(TEN_MINUTES));
  else jar.delete(RETURN_TO);
}

export async function readTransaction(): Promise<OAuthTransaction | null> {
  const jar = await cookies();
  const state = jar.get(STATE)?.value;
  const nonce = jar.get(NONCE)?.value;
  const codeVerifier = jar.get(VERIFIER)?.value;

  if (!state || !nonce || !codeVerifier) return null;

  return { state, nonce, codeVerifier, returnTo: jar.get(RETURN_TO)?.value ?? null };
}

/**
 * Always called once the callback has read them, success or failure, so a
 * verifier cannot be reused for a second exchange.
 */
export async function clearTransaction(): Promise<void> {
  const jar = await cookies();
  for (const name of [STATE, NONCE, VERIFIER, RETURN_TO]) jar.delete(name);
}
