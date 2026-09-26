import 'server-only';
import { randomInt, randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Short numeric verification codes, as used by the Super Admin registration
 * flow.
 *
 * These are a different animal from the 32-byte link tokens in tokens.ts, and
 * the differences are all consequences of the code being six digits so a
 * person can retype it:
 *
 *   * GENERATION — `randomInt` from node:crypto, not Math.random. It draws
 *     from the same CSPRNG as randomBytes and is free of the modulo bias you
 *     get from `randomBytes(4) % 1_000_000`.
 *
 *   * STORAGE — bcrypt, not SHA-256. A link token has 256 bits of entropy, so
 *     a fast digest is fine: there is nothing to brute force. A six-digit
 *     code has under 20 bits, and a plain SHA-256 of it could be reversed
 *     from a database dump by hashing a million candidates in well under a
 *     second. bcrypt at the application's configured cost makes that sweep
 *     cost weeks per row, and the per-row salt means one sweep buys one row.
 *
 *   * LIFETIME — ten minutes rather than hours, because the code is entered
 *     immediately, in the tab that requested it.
 *
 *   * ATTEMPTS — capped. Guessing beats brute force at this entropy, so the
 *     limit on attempts is what actually protects the code, not its length.
 *
 * The plaintext code is returned once, to be put in an email. It is never
 * persisted, never logged, never sent to the browser, and never included in
 * an API response or an error message.
 */

const CODE_DIGITS = 6;

/** Cost for hashing the code. The same knob as passwords, same reasoning. */
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

/** Short: the code is typed in the tab that asked for it. */
export const CODE_TTL_MINUTES = Number(process.env.SUPER_ADMIN_CODE_TTL_MINUTES ?? 10);

/** Wrong guesses allowed against one issued code before it is burnt. */
export const MAX_VERIFICATION_ATTEMPTS = Number(
  process.env.SUPER_ADMIN_CODE_MAX_ATTEMPTS ?? 5,
);

/** How many replacement codes one pending registration may ask for. */
export const MAX_RESENDS = Number(process.env.SUPER_ADMIN_CODE_MAX_RESENDS ?? 3);

/** Quiet period after a send, so "Resend" cannot be leant on. */
export const RESEND_COOLDOWN_SECONDS = Number(
  process.env.SUPER_ADMIN_CODE_RESEND_COOLDOWN_SECONDS ?? 60,
);

/**
 * How long after verification the browser has to finish account creation.
 *
 * Verifying proves the mailbox; it does not create anything. If the operator
 * walks away at that point the proof should not sit there indefinitely, so
 * the verified pending row is only good for this much longer.
 */
export const COMPLETION_WINDOW_MINUTES = Number(
  process.env.SUPER_ADMIN_COMPLETION_WINDOW_MINUTES ?? 30,
);

/**
 * A six-digit code, zero-padded, from the CSPRNG.
 *
 * `randomInt(0, 1_000_000)` is uniform over the whole range, including the
 * codes with leading zeros — which is why the padding happens here rather
 * than by drawing from 100_000 upwards and quietly shrinking the space.
 */
export function generateVerificationCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
}

/** True for exactly six ASCII digits — the shape the inputs can produce. */
export function isWellFormedCode(code: string): boolean {
  return new RegExp(`^[0-9]{${CODE_DIGITS}}$`).test(code);
}

export async function hashVerificationCode(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_ROUNDS);
}

/**
 * Compare a submitted code against the stored hash.
 *
 * bcrypt's own comparison is constant-time with respect to the digest, and a
 * malformed or emptied hash must read as "wrong code" rather than throw — an
 * invalidated row stores an empty hash, and that has to be a clean failure.
 */
export async function verificationCodeMatches(code: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(code, hash);
  } catch {
    return false;
  }
}

// --- The pending-registration handle ---------------------------------------

/**
 * The opaque handle that ties a browser to its pending registration.
 *
 * It lives in an HttpOnly cookie and only its SHA-256 is stored, exactly as
 * for session tokens: a database dump must not yield a usable handle. 32
 * bytes of entropy, so a fast digest is the right choice here.
 *
 * Identifying the pending row this way rather than by emailing back an id, or
 * by trusting an email address in the request body, means an attacker cannot
 * aim verification attempts at somebody else's pending registration.
 */
export function generateHandle(): string {
  return randomBytes(32).toString('hex');
}

export function hashHandle(handle: string): string {
  return createHash('sha256').update(handle).digest('hex');
}

export function isWellFormedHandle(handle: string): boolean {
  return /^[0-9a-f]{64}$/.test(handle);
}

// --- Pure policy helpers ---------------------------------------------------
//
// Separated from the database so they can be unit tested without one, and so
// the route handlers and the service agree on the arithmetic.

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Whole seconds left on a code, floored at zero. */
export function secondsUntil(when: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((when.getTime() - now.getTime()) / 1000));
}

export function attemptsRemaining(attempts: number): number {
  return Math.max(0, MAX_VERIFICATION_ATTEMPTS - attempts);
}

/** When the next resend becomes available, given the last send. */
export function resendAvailableAt(lastSentAt: Date): Date {
  return new Date(lastSentAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000);
}

export interface ResendVerdict {
  allowed: boolean;
  /** Seconds to wait, when the cooldown is what is blocking. */
  retryAfterSeconds: number;
  /** True when the per-registration resend budget is used up entirely. */
  exhausted: boolean;
}

/**
 * May this registration have another code?
 *
 * Two separate brakes: a short cooldown between sends, and a hard cap on the
 * total. The cap is what stops the endpoint being used to post mail to an
 * institutional address indefinitely.
 */
export function canResend(
  state: { resendCount: number; lastSentAt: Date },
  now: Date = new Date(),
): ResendVerdict {
  if (state.resendCount >= MAX_RESENDS) {
    return { allowed: false, retryAfterSeconds: 0, exhausted: true };
  }

  const wait = secondsUntil(resendAvailableAt(state.lastSentAt), now);
  if (wait > 0) return { allowed: false, retryAfterSeconds: wait, exhausted: false };

  return { allowed: true, retryAfterSeconds: 0, exhausted: false };
}
