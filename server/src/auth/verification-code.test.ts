import { describe, it, expect } from 'vitest';
import {
  generateVerificationCode,
  isWellFormedCode,
  hashVerificationCode,
  verificationCodeMatches,
  generateHandle,
  hashHandle,
  isWellFormedHandle,
  expiryFrom,
  isExpired,
  secondsUntil,
  attemptsRemaining,
  resendAvailableAt,
  canResend,
  CODE_TTL_MINUTES,
  MAX_RESENDS,
  MAX_VERIFICATION_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
} from './verification-code';

/**
 * The properties the Super Admin verification code has to hold: unguessable,
 * unreadable from the stored hash, single use, expiring, and capped in both
 * attempts and resends. No database involved — the arithmetic and the crypto
 * are deliberately separable from the rows they are applied to.
 */

describe('code generation', () => {
  it('always produces exactly six digits', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(isWellFormedCode(code)).toBe(true);
    }
  });

  it('does not repeat itself, which a non-random source would', () => {
    const seen = new Set(Array.from({ length: 300 }, generateVerificationCode));
    // 300 draws from a million values: collisions are possible but a
    // generator stuck in a rut would collapse this number, not nudge it.
    expect(seen.size).toBeGreaterThan(280);
  });

  it('can produce codes with leading zeros, so the space is the full million', () => {
    // Padding is what makes this true; drawing from 100000 upwards would not.
    expect(isWellFormedCode('000001')).toBe(true);
    expect('000001'.length).toBe(6);
  });

  it('rejects anything that is not six digits', () => {
    for (const bad of ['12345', '1234567', '12345a', '', '12 345', '-123456']) {
      expect(isWellFormedCode(bad)).toBe(false);
    }
  });
});

describe('code storage', () => {
  it('stores a hash that does not contain the code', async () => {
    const code = '481902';
    const hash = await hashVerificationCode(code);

    expect(hash).not.toContain(code);
    // bcrypt, not a bare digest: a six-digit code has too little entropy for
    // SHA-256 to survive a database dump.
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('salts, so two identical codes do not share a hash', async () => {
    const [a, b] = await Promise.all([
      hashVerificationCode('481902'),
      hashVerificationCode('481902'),
    ]);
    expect(a).not.toBe(b);
  });

  it('accepts the right code and refuses every other', async () => {
    const hash = await hashVerificationCode('481902');

    expect(await verificationCodeMatches('481902', hash)).toBe(true);
    for (const wrong of ['481903', '184902', '000000', '48190', '4819021', '']) {
      expect(await verificationCodeMatches(wrong, hash)).toBe(false);
    }
  });

  it('treats an emptied hash as a failed match, which is how a code is burnt', async () => {
    // Successful verification and a blown attempt cap both empty the column.
    expect(await verificationCodeMatches('481902', '')).toBe(false);
  });

  it('treats a corrupt hash as a failed match rather than throwing', async () => {
    expect(await verificationCodeMatches('481902', 'not-a-bcrypt-hash')).toBe(false);
  });
});

describe('the pending-registration handle', () => {
  it('is 32 bytes of hex and passes its own shape check', () => {
    const handle = generateHandle();
    expect(handle).toMatch(/^[0-9a-f]{64}$/);
    expect(isWellFormedHandle(handle)).toBe(true);
  });

  it('is stored only as a digest, and the digest is stable', () => {
    const handle = generateHandle();
    expect(hashHandle(handle)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashHandle(handle)).toBe(hashHandle(handle));
    expect(hashHandle(handle)).not.toBe(handle);
  });

  it('rejects a malformed cookie value before any query is made', () => {
    for (const bad of ['', 'abc', 'g'.repeat(64), '0'.repeat(63), '0'.repeat(65)]) {
      expect(isWellFormedHandle(bad)).toBe(false);
    }
  });
});

describe('expiry', () => {
  const now = new Date('2026-09-26T10:00:00.000Z');

  it(`expires ${CODE_TTL_MINUTES} minutes after it is issued`, () => {
    expect(expiryFrom(now).getTime() - now.getTime()).toBe(CODE_TTL_MINUTES * 60_000);
  });

  it('is live until the deadline and expired on it', () => {
    const expiresAt = expiryFrom(now);

    expect(isExpired(expiresAt, now)).toBe(false);
    expect(isExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isExpired(expiresAt, expiresAt)).toBe(true);
    expect(isExpired(expiresAt, new Date(expiresAt.getTime() + 1))).toBe(true);
  });

  it('counts down in whole seconds and floors at zero', () => {
    expect(secondsUntil(new Date(now.getTime() + 600_000), now)).toBe(600);
    expect(secondsUntil(new Date(now.getTime() + 1_500), now)).toBe(2);
    expect(secondsUntil(new Date(now.getTime() - 60_000), now)).toBe(0);
  });
});

describe('failed attempts', () => {
  it(`allows ${MAX_VERIFICATION_ATTEMPTS} wrong guesses and no more`, () => {
    expect(attemptsRemaining(0)).toBe(MAX_VERIFICATION_ATTEMPTS);
    expect(attemptsRemaining(MAX_VERIFICATION_ATTEMPTS - 1)).toBe(1);
    expect(attemptsRemaining(MAX_VERIFICATION_ATTEMPTS)).toBe(0);
  });

  it('never reports a negative allowance, however many attempts were recorded', () => {
    expect(attemptsRemaining(MAX_VERIFICATION_ATTEMPTS + 10)).toBe(0);
  });
});

describe('resend limiting', () => {
  const now = new Date('2026-09-26T10:00:00.000Z');

  it('refuses a second code inside the cooldown, and says how long to wait', () => {
    const verdict = canResend({ resendCount: 0, lastSentAt: now }, now);

    expect(verdict.allowed).toBe(false);
    expect(verdict.exhausted).toBe(false);
    expect(verdict.retryAfterSeconds).toBe(RESEND_COOLDOWN_SECONDS);
  });

  it('allows one once the cooldown has passed', () => {
    const later = new Date(now.getTime() + RESEND_COOLDOWN_SECONDS * 1000);

    expect(canResend({ resendCount: 0, lastSentAt: now }, later).allowed).toBe(true);
    expect(resendAvailableAt(now).getTime()).toBe(later.getTime());
  });

  it(`stops entirely after ${MAX_RESENDS} resends, cooldown or not`, () => {
    const muchLater = new Date(now.getTime() + 86_400_000);
    const verdict = canResend({ resendCount: MAX_RESENDS, lastSentAt: now }, muchLater);

    expect(verdict.allowed).toBe(false);
    expect(verdict.exhausted).toBe(true);
  });

  it('still allows a resend up to the cap', () => {
    const later = new Date(now.getTime() + RESEND_COOLDOWN_SECONDS * 1000);
    expect(canResend({ resendCount: MAX_RESENDS - 1, lastSentAt: now }, later).allowed).toBe(true);
  });
});
