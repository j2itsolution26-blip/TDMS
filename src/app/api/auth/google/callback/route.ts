import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { completeAuthorization } from '@/server/auth/google/oauth';
import { readTransaction, clearTransaction } from '@/server/auth/google/transaction-cookies';
import { signInWithGoogle } from '@/server/services/google-auth-service';
import { clientIp } from '@/server/api-handler';

/**
 * GET /api/auth/google/callback — where Google sends the person back.
 *
 * Every failure ends as a redirect to /login with a short, non-technical
 * `?error=` code that the login page turns into a sentence. No stack trace,
 * no token, no Google error body and no database detail ever reaches the
 * browser; the detail goes to the server log.
 *
 * The transaction cookies are cleared on every path, success or failure, so
 * a PKCE verifier can never be presented twice.
 */
export const dynamic = 'force-dynamic';

function backToLogin(request: NextRequest, error: string) {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

/** Constant-time comparison, so `state` cannot be probed byte by byte. */
function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const transaction = await readTransaction();

  try {
    /*
     * The person pressed "Cancel" on Google's screen, or Google refused.
     * `access_denied` is ordinary, not an error to shout about.
     */
    const googleError = params.get('error');
    if (googleError) {
      console.warn('[TDMS] Google returned an error at the callback.', { error: googleError });
      return backToLogin(request, googleError === 'access_denied' ? 'cancelled' : 'google_failed');
    }

    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) return backToLogin(request, 'google_failed');

    /*
     * CSRF. Without this check, an attacker could feed their own
     * authorization code to a victim's browser and have the victim's session
     * bound to the attacker's Google account.
     */
    if (!transaction) return backToLogin(request, 'expired');
    if (!statesMatch(state, transaction.state)) {
      console.error('[TDMS] Google callback state did not match the stored value.');
      return backToLogin(request, 'invalid_state');
    }

    // Exchanges the code and verifies the ID token's signature and claims.
    const identity = await completeAuthorization(code, transaction.codeVerifier, transaction.nonce);

    const outcome = await signInWithGoogle(identity, {
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    switch (outcome.kind) {
      case 'signed_in': {
        const target =
          transaction.returnTo && transaction.returnTo.startsWith('/')
            ? transaction.returnTo
            : outcome.redirectTo;
        return NextResponse.redirect(new URL(target, request.url));
      }
      case 'wrong_domain':
        return backToLogin(request, 'wrong_domain');
      case 'email_unverified':
        return backToLogin(request, 'google_email_unverified');
      case 'pending':
        return backToLogin(request, outcome.created ? 'account_created_pending' : 'account_pending');
      case 'inactive':
        return backToLogin(request, 'account_inactive');
      case 'suspended':
        return backToLogin(request, 'account_suspended');
      default:
        return backToLogin(request, 'google_failed');
    }
  } catch (error) {
    /*
     * Anything unexpected — a network failure to Google, a database outage.
     * Logged in full server-side, reported generically.
     */
    console.error('[TDMS] Google callback failed.', error);
    return backToLogin(request, 'google_failed');
  } finally {
    await clearTransaction();
  }
}
