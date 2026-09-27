import { describe, it, expect } from 'vitest';
import { generateTemporaryPassword, TEMPORARY_PASSWORD_LENGTH } from './temporary-password';
import { PASSWORD_REQUIREMENTS, meetsPasswordPolicy, evaluatePassword } from './password-policy';

/**
 * The generated temporary password.
 *
 * The property that matters most is the least obvious: EVERY generated
 * password satisfies the application's own policy. A generator that usually
 * produces an acceptable password is a support ticket on the day it does not,
 * and the fix somebody reaches for under pressure is to weaken the policy.
 *
 * So this runs the generator a few hundred times rather than once, and checks
 * against the real PASSWORD_REQUIREMENTS list rather than a restatement of it.
 */

const SAMPLE = Array.from({ length: 400 }, () => generateTemporaryPassword());

describe('every generated password satisfies the policy', () => {
  it('passes meetsPasswordPolicy without exception', () => {
    for (const password of SAMPLE) {
      expect(meetsPasswordPolicy(password), password).toBe(true);
    }
  });

  it('satisfies each requirement individually', () => {
    for (const requirement of PASSWORD_REQUIREMENTS) {
      const failures = SAMPLE.filter((p) => !evaluatePassword(p)[requirement.id]);
      expect(failures, `${requirement.id} failed for: ${failures.slice(0, 3).join(', ')}`).toEqual(
        [],
      );
    }
  });
});

describe('shape', () => {
  it('is the configured length every time', () => {
    for (const password of SAMPLE) {
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    }
  });

  it('is at least sixteen characters, whatever the policy minimum is', () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBeGreaterThanOrEqual(16);
  });

  it('leaves out the characters that get misread aloud', () => {
    /*
     * O/0 and I/l/1. This password is read out or copied by hand at least
     * once, and `l` versus `1` in that setting is not a security property, it
     * is a wasted phone call.
     */
    for (const password of SAMPLE) {
      expect(password).not.toMatch(/[O0Il1]/);
    }
  });

  it('contains no whitespace, which would not survive being copied', () => {
    for (const password of SAMPLE) {
      expect(password).not.toMatch(/\s/);
    }
  });
});

describe('randomness', () => {
  it('does not repeat', () => {
    // 400 draws from an alphabet of 68 over 16 places. A repeat would mean the
    // generator is not drawing randomly at all.
    expect(new Set(SAMPLE).size).toBe(SAMPLE.length);
  });

  it('does not put the required classes in a fixed position', () => {
    /*
     * The classes are drawn first and then shuffled. Without the shuffle every
     * password would begin with an uppercase letter, which hands an attacker
     * the first character and the layout of the next three.
     */
    const firstChars = new Set(SAMPLE.map((p) => p[0]!));
    expect(firstChars.size).toBeGreaterThan(10);

    const startsUpper = SAMPLE.filter((p) => /^[A-Z]/.test(p)).length;
    expect(startsUpper).toBeLessThan(SAMPLE.length * 0.6);
  });

  it('spreads characters across the alphabet rather than favouring its start', () => {
    /*
     * The `bytes[i] % alphabet.length` idiom biases towards the first
     * characters of the alphabet. Rejection sampling does not. Over 6400
     * characters, a uniform draw from 68 gives about 94 of each; a badly
     * skewed generator shows up as a much wider spread than this bound.
     */
    const counts = new Map<string, number>();
    for (const password of SAMPLE) {
      for (const char of password) counts.set(char, (counts.get(char) ?? 0) + 1);
    }

    const observed = [...counts.values()];
    expect(counts.size).toBeGreaterThan(50);
    expect(Math.max(...observed)).toBeLessThan(Math.min(...observed) * 6);
  });
});
