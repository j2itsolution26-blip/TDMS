import { NextResponse, type NextRequest } from 'next/server';
import { buildAuthorizationRequest } from '@/server/auth/google/oauth';
import { storeTransaction } from '@/server/auth/google/transaction-cookies';

/**
 * GET /api/auth/google — start Google sign-in.
 *
 * A GET because it is reached by a plain link or a button that navigates:
 * the whole point is a top-level redirect to accounts.google.com. Nothing is
 * mutated on our side beyond three short-lived cookies carrying this one
 * attempt, so there is nothing for CSRF to abuse — and the `state` in those
 * cookies is what protects the callback, which is the request that matters.
 */
export const dynamic = 'force-dynamic';

/** Only local paths, so ?next= cannot become an open redirect. */
function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export async function GET(request: NextRequest) {
  try {
    const { url, state, nonce, codeVerifier } = buildAuthorizationRequest();

    await storeTransaction({
      state,
      nonce,
      codeVerifier,
      returnTo: safeReturnTo(request.nextUrl.searchParams.get('next')),
    });

    return NextResponse.redirect(url);
  } catch (error) {
    // Misconfiguration is the likely cause; detail is already logged.
    console.error('[TDMS] Could not start Google sign-in.', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.redirect(new URL('/login?error=google_unavailable', request.url));
  }
}
