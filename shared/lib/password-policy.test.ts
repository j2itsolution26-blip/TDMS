import { describe, it, expect } from 'vitest';
import {
  PASSWORD_REQUIREMENTS,
  PASSWORD_MIN_LENGTH,
  evaluatePassword,
  passwordProblems,
  meetsPasswordPolicy,
} from './password-policy';

/**
 * The checklist the setup form draws and the rule the server enforces read
 * from this one list, so these cases cover both at once. Each case below is
 * one of the failures the Super Admin registration flow has to catch before a
 * verification code is ever sent.
 */

const VALID = 'Institution#2026';

describe('a password that satisfies every requirement', () => {
  it('passes', () => {
    expect(meetsPasswordPolicy(VALID)).toBe(true);
    expect(passwordProblems(VALID)).toEqual([]);
    expect(Object.values(evaluatePassword(VALID)).every(Boolean)).toBe(true);
  });
});

describe('each requirement, failed on its own', () => {
  const cases: [string, string, string][] = [
    ['shorter than 12 characters', 'Short#1aA', 'length'],
    ['missing an uppercase letter', 'institution#2026', 'uppercase'],
    ['missing a lowercase letter', 'INSTITUTION#2026', 'lowercase'],
    ['missing a number', 'Institutional#Pw', 'number'],
    ['missing a special character', 'Institution20268', 'symbol'],
  ];

  for (const [label, password, failing] of cases) {
    it(`rejects a password ${label}`, () => {
      const met = evaluatePassword(password);

      expect(met[failing as keyof typeof met]).toBe(false);
      expect(meetsPasswordPolicy(password)).toBe(false);

      // Only the one requirement fails: the case isolates it.
      const failed = PASSWORD_REQUIREMENTS.filter((r) => !met[r.id]).map((r) => r.id);
      expect(failed).toEqual([failing]);
    });
  }
});

describe('boundaries', () => {
  it(`accepts exactly ${PASSWORD_MIN_LENGTH} characters and rejects one fewer`, () => {
    // 12 characters, with all four classes present.
    expect(meetsPasswordPolicy('Abcdefgh1#zZ')).toBe(true);
    expect(meetsPasswordPolicy('Abcdefg1#zZ')).toBe(false);
  });

  it('rejects an empty password with every requirement listed', () => {
    expect(passwordProblems('')).toHaveLength(PASSWORD_REQUIREMENTS.length);
  });

  it('refuses an absurdly long password rather than feeding it to bcrypt', () => {
    expect(meetsPasswordPolicy(`${VALID}${'a'.repeat(400)}`)).toBe(false);
  });

  it('counts any non-alphanumeric character as a symbol, not only the listed ones', () => {
    expect(evaluatePassword('Institution£2026').symbol).toBe(true);
    expect(evaluatePassword('Institution 2026').symbol).toBe(true);
  });

  it('reports every failure at once, so a form need not be submitted five times', () => {
    expect(passwordProblems('short')).toHaveLength(4);
  });
});
