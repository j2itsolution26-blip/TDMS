import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The access-code primitives: generation, storage and the lifecycle rules.
 *
 * These are the properties that make a six-digit code a second factor rather
 * than a formality, so each is asserted rather than assumed:
 *
 *   * the code is drawn from a CSPRNG, uniformly, INCLUDING the codes with
 *     leading zeros — silently shrinking the space to 900,000 would remove a
 *     tenth of it;
 *   * the stored form does not contain the code and is salted, so a database
 *     dump does not yield a million-candidate sweep that buys every row;
 *   * a code that is used, cancelled, expired or out of attempts is refused,
 *     and the refusal says which.
 */

// Hashing cost dominates the runtime here and is irrelevant to correctness.
vi.hoisted(() => {
  process.env.BCRYPT_ROUNDS = '4';
  return {};
});

const {
  generateAccessCode,
  isWellFormedAccessCode,
  hashAccessCode,
  accessCodeMatches,
  accessCodeRefusal,
  isAccessCodeLive,
  attemptsRemaining,
  accessCodeTtlMinutes,
  accessCodeMaxAttempts,
  loginChallengeTtlMinutes,
  accessCodeExpiryFrom,
  accessCodeStatus,
  accessCodeExpiryOptions,
  resolveAccessCodeMinutes,
  MAX_ACCESS_CODE_MINUTES,
  secondsUntil,
  ACCESS_CODE_LENGTH,
} = await import('./admin-access-code');

const KEYS = [
  'ADMIN_ACCESS_CODE_EXPIRATION_MINUTES',
  'ADMIN_ACCESS_CODE_MAX_ATTEMPTS',
  'ADMIN_LOGIN_CHALLENGE_TTL_MINUTES',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** A live code, for the lifecycle tests to spoil one field at a time. */
function live(overrides: Partial<Parameters<typeof accessCodeRefusal>[0]> = {}) {
  return {
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    revokedAt: null,
    attemptCount: 0,
    maxAttempts: 5,
    ...overrides,
  };
}

describe('generation', () => {
  it('is always exactly six digits', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(code).toHaveLength(ACCESS_CODE_LENGTH);
      expect(isWellFormedAccessCode(code)).toBe(true);
    }
  });

  it('draws from the whole space, leading zeros included', () => {
    /*
     * The bug this guards against is generating from 100000 upwards, which
     * looks fine and quietly removes a tenth of the keyspace. Over 3000 draws
     * roughly 300 should start with a zero; seeing none would be conclusive.
     */
    const codes = Array.from({ length: 3000 }, () => generateAccessCode());
    expect(codes.filter((c) => c.startsWith('0')).length).toBeGreaterThan(100);
  });

  it('does not repeat itself in any run of a few hundred', () => {
    const codes = new Set(Array.from({ length: 300 }, () => generateAccessCode()));
    // A handful of collisions is expected at this sample size against 10^6;
    // a generator stuck on one value would produce exactly one entry.
    expect(codes.size).toBeGreaterThan(280);
  });

  it('refuses anything that is not six digits', () => {
    for (const bad of ['', '1', '12345', '1234567', 'abcdef', '12 34 5', '12345a', ' 123456']) {
      expect(isWellFormedAccessCode(bad)).toBe(false);
    }
  });
});

describe('storage', () => {
  it('stores a hash that does not contain the code', async () => {
    const code = generateAccessCode();
    const hash = await hashAccessCode(code);

    expect(hash).not.toContain(code);
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('salts, so two identical codes do not share a hash', async () => {
    const [a, b] = await Promise.all([hashAccessCode('123456'), hashAccessCode('123456')]);
    expect(a).not.toBe(b);
    // Both still verify: the salt is in the digest, not a second secret.
    expect(await accessCodeMatches('123456', a)).toBe(true);
    expect(await accessCodeMatches('123456', b)).toBe(true);
  });

  it('accepts the right code and refuses every near miss', async () => {
    const hash = await hashAccessCode('402913');

    expect(await accessCodeMatches('402913', hash)).toBe(true);
    for (const wrong of ['402914', '402912', '412913', '', '40291', '4029130']) {
      expect(await accessCodeMatches(wrong, hash)).toBe(false);
    }
  });

  it('reads an emptied hash as a wrong code rather than throwing', async () => {
    /*
     * A cancelled code has its hash emptied, and that has to be a clean
     * failure. bcryptjs throws on a malformed hash, so without the guard this
     * path would be a 500 on every attempt against a superseded code.
     */
    await expect(accessCodeMatches('123456', '')).resolves.toBe(false);
    await expect(accessCodeMatches('123456', 'not-a-hash')).resolves.toBe(false);
  });
});

describe('lifecycle', () => {
  it('calls a fresh code live', () => {
    expect(accessCodeRefusal(live())).toBeNull();
    expect(isAccessCodeLive(live())).toBe(true);
  });

  it('refuses a used code', () => {
    expect(accessCodeRefusal(live({ usedAt: new Date() }))).toBe('used');
  });

  it('refuses a cancelled code', () => {
    expect(accessCodeRefusal(live({ revokedAt: new Date() }))).toBe('revoked');
  });

  it('refuses an expired code, on the boundary as well as past it', () => {
    const now = new Date();
    expect(accessCodeRefusal(live({ expiresAt: new Date(now.getTime() - 1) }), now)).toBe('expired');
    // Exactly at the expiry is expired, not the last valid instant.
    expect(accessCodeRefusal(live({ expiresAt: now }), now)).toBe('expired');
    expect(accessCodeRefusal(live({ expiresAt: new Date(now.getTime() + 1) }), now)).toBeNull();
  });

  it('refuses a code whose attempts are spent', () => {
    expect(accessCodeRefusal(live({ attemptCount: 5, maxAttempts: 5 }))).toBe('exhausted');
    // And one over, in case a concurrent increment overshot.
    expect(accessCodeRefusal(live({ attemptCount: 6, maxAttempts: 5 }))).toBe('exhausted');
    expect(accessCodeRefusal(live({ attemptCount: 4, maxAttempts: 5 }))).toBeNull();
  });

  it('reports "used" ahead of "expired" for a code that is both', () => {
    /*
     * Order matters for what the person is told. "You already used this" is
     * actionable; "it expired" would send them looking for a new code they do
     * not need, having already signed in.
     */
    const both = live({ usedAt: new Date(), expiresAt: new Date(Date.now() - 60_000) });
    expect(accessCodeRefusal(both)).toBe('used');
  });

  it('counts down the attempts left, never below zero', () => {
    expect(attemptsRemaining(live({ attemptCount: 0, maxAttempts: 5 }))).toBe(5);
    expect(attemptsRemaining(live({ attemptCount: 3, maxAttempts: 5 }))).toBe(2);
    expect(attemptsRemaining(live({ attemptCount: 9, maxAttempts: 5 }))).toBe(0);
  });
});

describe('configuration', () => {
  it('defaults to ten minutes, five attempts, a fifteen-minute sign-in window', () => {
    expect(accessCodeTtlMinutes()).toBe(10);
    expect(accessCodeMaxAttempts()).toBe(5);
    expect(loginChallengeTtlMinutes()).toBe(15);
  });

  it('honours the environment', () => {
    process.env.ADMIN_ACCESS_CODE_EXPIRATION_MINUTES = '3';
    process.env.ADMIN_ACCESS_CODE_MAX_ATTEMPTS = '2';
    process.env.ADMIN_LOGIN_CHALLENGE_TTL_MINUTES = '30';

    expect(accessCodeTtlMinutes()).toBe(3);
    expect(accessCodeMaxAttempts()).toBe(2);
    expect(loginChallengeTtlMinutes()).toBe(30);
  });

  it('falls back to the default on a value that would disable the limit', () => {
    /*
     * A zero or negative expiry would mean every code is born expired; a
     * non-numeric one would mean NaN, and every comparison against NaN is
     * false — which reads as "never expires". Both fall back rather than being
     * honoured.
     */
    for (const bad of ['0', '-5', '', 'ten', 'NaN']) {
      process.env.ADMIN_ACCESS_CODE_EXPIRATION_MINUTES = bad;
      expect(accessCodeTtlMinutes()).toBe(10);

      process.env.ADMIN_ACCESS_CODE_MAX_ATTEMPTS = bad;
      expect(accessCodeMaxAttempts()).toBe(5);
    }
  });

  it('puts the expiry the configured distance into the future', () => {
    process.env.ADMIN_ACCESS_CODE_EXPIRATION_MINUTES = '10';
    const now = new Date('2026-09-27T10:00:00.000Z');
    expect(accessCodeExpiryFrom(now).toISOString()).toBe('2026-09-27T10:10:00.000Z');
    expect(secondsUntil(accessCodeExpiryFrom(now), now)).toBe(600);
  });

  it('floors a countdown at zero rather than going negative', () => {
    const now = new Date();
    expect(secondsUntil(new Date(now.getTime() - 60_000), now)).toBe(0);
  });
});

describe('dashboard status', () => {
  it('shows the four states the dashboard uses, and only those', () => {
    const now = new Date();
    expect(accessCodeStatus(live(), now)).toBe('ACTIVE');
    expect(accessCodeStatus(live({ usedAt: now }), now)).toBe('USED');
    expect(accessCodeStatus(live({ expiresAt: new Date(now.getTime() - 1) }), now)).toBe('EXPIRED');
    expect(accessCodeStatus(live({ revokedAt: now }), now)).toBe('REVOKED');
  });

  it('shows a code burnt by wrong guesses as REVOKED, not EXPIRED', () => {
    expect(accessCodeStatus(live({ attemptCount: 5, maxAttempts: 5 }))).toBe('REVOKED');
  });
});

describe('choosing an expiry', () => {
  it('offers the configured default among the options', () => {
    process.env.ADMIN_ACCESS_CODE_EXPIRATION_MINUTES = '7';
    expect(accessCodeExpiryOptions()).toContain(7);
    expect(resolveAccessCodeMinutes(undefined)).toBe(7);
  });

  it('honours an offered option and ignores anything else', () => {
    expect(resolveAccessCodeMinutes(30)).toBe(30);
    // Not offered, so it falls back rather than being trusted.
    expect(resolveAccessCodeMinutes(10_080)).toBe(10);
    expect(resolveAccessCodeMinutes(-5)).toBe(10);
  });

  it('never exceeds an hour, even if the default is configured higher', () => {
    process.env.ADMIN_ACCESS_CODE_EXPIRATION_MINUTES = '600';
    expect(resolveAccessCodeMinutes(undefined)).toBe(MAX_ACCESS_CODE_MINUTES);
    expect(Math.max(...accessCodeExpiryOptions())).toBe(MAX_ACCESS_CODE_MINUTES);
  });
});
