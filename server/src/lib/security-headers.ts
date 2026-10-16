/**
 * HTTP security headers, in one place.
 *
 * Applied by Fastify (src/app.ts) to every response it sends — the API, and
 * the React app when self-hosted. On Vercel the HTML and assets are served by
 * its CDN, not Fastify, so vercel.json carries the same CSP and HSTS for
 * those; security-headers.test.ts fails if the two drift apart.
 *
 * The Content-Security-Policy is REPORT-ONLY for now: browsers report what it
 * would block without blocking anything, so it cannot break a page while its
 * allow-list is proven against real use. Switch the header name to
 * `Content-Security-Policy` once a week of normal use shows no violations.
 *
 * What the app actually loads (checked when this was written):
 *   scripts .... only its own bundle (no inline script, no third-party JS)
 *   styles ..... its own CSS, React `style={…}` attributes ('unsafe-inline'
 *                covers those), and Bunny Fonts' stylesheet
 *   fonts ...... Bunny Fonts
 *   images ..... its own, data: and blob: (QR codes, previews), and https:
 *                (e.g. a Google profile picture)
 *   camera ..... getUserMedia for QR attendance (Permissions-Policy below)
 *   Google sign-in is a full-page redirect, which CSP does not restrict.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.bunny.net",
  "font-src 'self' data: https://fonts.bunny.net",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Two years, the preload-list minimum; subdomains included. */
export const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains';

export function securityHeaders(production: boolean): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-DNS-Prefetch-Control': 'off',
    // The camera is allowed for this site only: QR attendance scans with it.
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    // Only in production: development runs over plain http, and Vite's dev
    // server injects inline scripts this policy would (rightly) report.
    ...(production
      ? {
          'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY,
          'Content-Security-Policy-Report-Only': CONTENT_SECURITY_POLICY,
        }
      : {}),
  };
}
