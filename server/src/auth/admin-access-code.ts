import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * The one-time access code a Super Admin issues for one Admin account.
 *
 * This module holds the policy — generation, storage, lifetime, budgets —
 * and nothing that touches the database. Keeping it pure is what lets the
 * arithmetic be tested without a Postgres, and it means the service layer
 * and the route handlers cannot disagree about when a code is still alive.
 *
 * The design is the same as the Super Admin setup code in
 * verification-code.ts, for the same reasons, and the reasoning is repeated
 * here rather than cross-referenced because getting any one of these wrong
 * is what turns a second factor into a formality:
 *
 *   * GENERATION — `randomInt` from node:crypto. Math.random is a
 *     non-cryptographic PRNG whose output is predictable from a handful of
 *     prior values, which for a login code means guessable. randomInt also
 *     avoids the modulo bias of `randomBytes(4) % 1_000_000`.
 *
 *   * STORAGE — bcrypt, not SHA-256. Six digits is under 20 bits of entropy.
 *     A plain SHA-256 of that is reversible from a database dump by hashing
 *     a million candidates, which is well under a second of work. bcrypt at
 *     the application's cost makes the same sweep cost weeks per row, and
 *     the per-row salt means one sweep buys exactly one row.
 *
 *   * LIFETIME — ten minutes by default, because the code is handed over and
 *     typed immediately. A code that lives for hours is a code that lives in
 *     somebody's chat history.
 *
 *   * ATTEMPTS — capped per code. At this entropy the attempt limit, not the
 *     length, is what actually protects the code: 5 guesses against 10^6
 *     candidates is the security, and lifting the cap would undo it however
 *     long the code were.
 *
 * The plaintext exists in exactly two non-durable places: the response that
 * shows it to the Super Admin once, and the optional email to the Admin. It
 * is never persisted, never logged, never put in an audit record and never
 * returned a second time.
 */

const CODE_DIGITS = 6;

/** Same knob as passwords, same reasoning. */
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

/**
 * How long an issued code is good for. Configurable per the brief; ten
 * minutes is the shipped default.
 */
export function accessCodeTtlMinutes(): number {
  const raw = Number(process.env.ADMIN_ACCESS_CODE_EXPIRATION_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
}

/** Wrong guesses allowed against ONE issued code before it is burnt. */
export function accessCodeMaxAttempts(): number {
  const raw = Number(process.env.ADMIN_ACCESS_CODE_MAX_ATTEMPTS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

/**
 * How long the half-finished sign-in itself survives.
 *
 * Longer than one code's life on purpose: the Admin may have to wait for a
 * Super Admin to issue a replacement, and being thrown back to the password
 * screen while doing so would be pure friction. Still bounded, because a
 * half-finished sign-in left open overnight is an open door in a browser
 * somebody has walked away from.
 */
export function loginChallengeTtlMinutes(): number {
  const raw = Number(process.env.ADMIN_LOGIN_CHALLENGE_TTL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15;
}

/**
 * A six-digit code, zero-padded, from the CSPRNG.
 *
 * Drawn uniformly over the whole range including the codes with leading
 * zeros, which is why the padding happens here rather than by drawing from
 * 100_000 upwards and quietly shrinking the space by a tenth.
 */
export function generateAccessCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
}

/** Exactly six ASCII digits — the shape the input can produce. */
export function isWellFormedAccessCode(code: string): boolean {
  return new RegExp(`^[0-9]{${CODE_DIGITS}}$`).test(code);
}

export const ACCESS_CODE_LENGTH = CODE_DIGITS;

export async function hashAccessCode(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_ROUNDS);
}

/**
 * Compare a submitted code against the stored hash.
 *
 * bcrypt's comparison is constant-time with respect to the digest, and a
 * malformed or emptied hash must read as "wrong code" rather than throw — an
 * invalidated row can hold an empty hash, and that has to be a clean
 * failure, not a 500.
 */
export async function accessCodeMatches(code: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(code, hash);
  } catch {
    return false;
  }
}

// --- Pure lifecycle policy -------------------------------------------------

/** The columns this module needs to judge a code. */
export interface AccessCodeState {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
}

/**
 * Why a code is not usable, or null when it is.
 *
 * One function, so every caller agrees. The order matters for the message
 * the Admin sees: "already used" is more useful than "expired" for a code
 * that is both, because it tells them the code worked and something else is
 * wrong.
 */
export type AccessCodeRefusal = 'used' | 'revoked' | 'expired' | 'exhausted';

export function accessCodeRefusal(
  state: AccessCodeState,
  now: Date = new Date(),
): AccessCodeRefusal | null {
  if (state.usedAt) return 'used';
  if (state.revokedAt) return 'revoked';
  if (state.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (state.attemptCount >= state.maxAttempts) return 'exhausted';
  return null;
}

export function isAccessCodeLive(state: AccessCodeState, now: Date = new Date()): boolean {
  return accessCodeRefusal(state, now) === null;
}

export function accessCodeExpiryFrom(
  now: Date = new Date(),
  minutes: number = accessCodeTtlMinutes(),
): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

// --- Status, as the Super Admin Dashboard shows it -------------------------

/**
 * The four states a code is shown in. Exactly these, per the dashboard spec.
 *
 * A code burnt by too many wrong guesses is REVOKED rather than EXPIRED: it was
 * withdrawn, not left to run out, and the dashboard shows the reason next to it.
 */
export const ACCESS_CODE_STATUSES = ['ACTIVE', 'USED', 'EXPIRED', 'REVOKED'] as const;
export type AccessCodeStatus = (typeof ACCESS_CODE_STATUSES)[number];

export function accessCodeStatus(state: AccessCodeState, now: Date = new Date()): AccessCodeStatus {
  switch (accessCodeRefusal(state, now)) {
    case null:
      return 'ACTIVE';
    case 'used':
      return 'USED';
    case 'expired':
      return 'EXPIRED';
    case 'revoked':
    case 'exhausted':
      return 'REVOKED';
  }
}

// --- Choosing an expiry when issuing a code ---------------------------------

/**
 * The upper bound on a code's life, whatever the Super Admin picks.
 *
 * A code is handed over and typed straight away. Beyond an hour it stops being
 * a one-time code and starts being a password that lives in a chat log.
 */
export const MAX_ACCESS_CODE_MINUTES = 60;

/**
 * The durations the Generate dialog offers, always including the configured
 * default so ADMIN_ACCESS_CODE_EXPIRATION_MINUTES shows up as a choice.
 */
export function accessCodeExpiryOptions(): number[] {
  const base = [5, 10, 15, 30, 60];
  const fallback = Math.min(accessCodeTtlMinutes(), MAX_ACCESS_CODE_MINUTES);
  return [...new Set([...base, fallback])].sort((a, b) => a - b);
}

/**
 * The expiry actually used for a request: one of the offered options, or the
 * configured default when none (or something else) was asked for. Anything
 * outside the list is refused by validation before it gets here; this is the
 * second line, so a hand-made request cannot mint a week-long code.
 */
export function resolveAccessCodeMinutes(requested?: number | null): number {
  if (requested && accessCodeExpiryOptions().includes(requested)) return requested;
  return Math.min(accessCodeTtlMinutes(), MAX_ACCESS_CODE_MINUTES);
}

export function loginChallengeExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + loginChallengeTtlMinutes() * 60_000);
}

/** Whole seconds left, floored at zero. */
export function secondsUntil(when: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((when.getTime() - now.getTime()) / 1000));
}

export function attemptsRemaining(state: AccessCodeState): number {
  return Math.max(0, state.maxAttempts - state.attemptCount);
}
