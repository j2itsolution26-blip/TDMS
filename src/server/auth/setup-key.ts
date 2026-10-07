import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * SETUP_KEY: the server-side secret that first-run setup requires.
 *
 * Being the first visitor to /setup proves nothing on a public deployment.
 * Knowing a value that exists only in the server's environment proves you
 * operate the server. No database access here, so /api/health can report on
 * it even when the database is unreachable.
 */

const VARIABLE = 'SETUP_KEY';
const MIN_LENGTH = 16;

/**
 * Why setup cannot be completed on this server, or null if it can. Names the
 * variable, never its value.
 */
export function setupKeyProblem(): string | null {
  const key = process.env[VARIABLE]?.trim();
  if (!key) {
    return `Setup is locked: no ${VARIABLE} is configured on the server. Add ${VARIABLE} to the server environment (.env locally, or Vercel → Project Settings → Environment Variables), restart or redeploy, then reload this page.`;
  }
  if (key.length < MIN_LENGTH) {
    return `Setup is locked: ${VARIABLE} must be at least ${MIN_LENGTH} characters. Choose a longer random value, restart or redeploy, then reload this page.`;
  }
  return null;
}

/** Constant-time comparison, so response timing says nothing about the key. */
export function setupKeyMatches(submitted: string): boolean {
  if (setupKeyProblem() !== null) return false;
  if (typeof submitted !== 'string' || submitted.length === 0) return false;
  const expected = process.env[VARIABLE]!.trim();
  const a = createHash('sha256').update(submitted.trim(), 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
