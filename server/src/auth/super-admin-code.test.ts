import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  staticCodeConfigured,
  verifyStaticCode,
  describeStaticCodePolicy,
  STATIC_CODE_NOT_CONFIGURED,
  STATIC_CODE_REJECTED,
} from './super-admin-code';

/**
 * The static Super Admin security code.
 *
 * Three properties, and the first is the one that would be easiest to get
 * wrong in a way nobody notices:
 *
 *   1. AN UNSET VARIABLE IS NOT "ALLOW". There is no default value and no
 *      fail-open path. A deployment that has not been given a code cannot
 *      issue administrator credentials at all, which is the safe direction for
 *      this particular failure.
 *   2. Comparison is by digest, so a wrong-length guess neither throws nor
 *      reveals the real length, and a near-miss does not return faster than a
 *      complete miss.
 *   3. Nothing that crosses a boundary contains the value, its length, or any
 *      part of it.
 */

const KEY = 'SUPER_ADMIN_STATIC_CODE';
let saved: string | undefined;

beforeEach(() => {
  saved = process.env[KEY];
  delete process.env[KEY];
});

afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe('when nothing is configured', () => {
  it('reports itself unconfigured', () => {
    expect(staticCodeConfigured()).toBe(false);
    expect(describeStaticCodePolicy().configured).toBe(false);
  });

  it('accepts nothing at all — there is no default and no fail-open path', () => {
    for (const attempt of ['', ' ', 'admin', '000000', 'SUPER_ADMIN_STATIC_CODE', 'undefined']) {
      expect(verifyStaticCode(attempt)).toBe(false);
    }
  });

  it('treats a whitespace-only value as unset, because that is a typo', () => {
    process.env[KEY] = '   ';
    expect(staticCodeConfigured()).toBe(false);
    expect(verifyStaticCode('   ')).toBe(false);
  });
});

describe('when configured', () => {
  const CODE = 'w8Qm-4rTx_9Lb2Ke';

  beforeEach(() => {
    process.env[KEY] = CODE;
  });

  it('reports itself configured', () => {
    expect(staticCodeConfigured()).toBe(true);
    expect(describeStaticCodePolicy().configured).toBe(true);
  });

  it('accepts the configured code', () => {
    expect(verifyStaticCode(CODE)).toBe(true);
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(verifyStaticCode(`  ${CODE}  `)).toBe(true);
    expect(verifyStaticCode(`\n${CODE}\t`)).toBe(true);
  });

  it('refuses a wrong code, including every near miss', () => {
    for (const wrong of [
      '',
      'w',
      CODE.slice(0, -1),
      `${CODE}x`,
      CODE.toUpperCase(),
      CODE.toLowerCase(),
      CODE.replace('-', '_'),
    ]) {
      expect(verifyStaticCode(wrong)).toBe(false);
    }
  });

  it('does not throw on a guess of a different length', () => {
    /*
     * timingSafeEqual throws on unequal lengths. Comparing the raw strings
     * would therefore either crash on most wrong guesses or need a length
     * check first — and that check is itself an oracle for the real length.
     * Digests are always 32 bytes, so every comparison takes the same path.
     */
    expect(() => verifyStaticCode('x')).not.toThrow();
    expect(() => verifyStaticCode('x'.repeat(10_000))).not.toThrow();
    expect(verifyStaticCode('x'.repeat(10_000))).toBe(false);
  });

  it('is read per call, so a deployment can change it without a restart', () => {
    expect(verifyStaticCode(CODE)).toBe(true);
    process.env[KEY] = 'something-else-entirely';
    expect(verifyStaticCode(CODE)).toBe(false);
    expect(verifyStaticCode('something-else-entirely')).toBe(true);
  });

  it('never puts the value in anything that leaves the server', () => {
    const described = JSON.stringify(describeStaticCodePolicy());

    expect(described).not.toContain(CODE);
    // Not a prefix, not a suffix, not the length.
    expect(described).not.toContain(CODE.slice(0, 4));
    expect(described).not.toContain(String(CODE.length));

    // The messages name the VARIABLE, which is not the secret, and nothing else.
    expect(STATIC_CODE_NOT_CONFIGURED).toContain(KEY);
    expect(STATIC_CODE_NOT_CONFIGURED).not.toContain(CODE);
    expect(STATIC_CODE_REJECTED).not.toContain(CODE);
  });
});
