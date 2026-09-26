import { describe, it, expect } from 'vitest';
import {
  isInstitutionalEmail,
  normalizeEmail,
  checkInstitutionalEmail,
  INSTITUTIONAL_DOMAIN,
  DOMAIN_REJECTION_MESSAGE,
} from './institutional-email';

/**
 * The domain rule is the gate on the whole system, so the lookalike cases
 * matter more than the happy path. Every string below that an `endsWith`
 * check would have waved through is called out.
 */

describe('accepts genuine institutional addresses', () => {
  const valid = [
    'juan.delacruz@asiancollege.edu.ph',
    'teacher.name@asiancollege.edu.ph',
    'admin.name@asiancollege.edu.ph',
    'a@asiancollege.edu.ph',
    'first.middle.last@asiancollege.edu.ph',
    'user+tag@asiancollege.edu.ph',
    "o'brien@asiancollege.edu.ph".replace("'", ''),
    'user_name@asiancollege.edu.ph',
    'user-name@asiancollege.edu.ph',
    'user123@asiancollege.edu.ph',
  ];

  for (const email of valid) {
    it(`accepts ${email}`, () => {
      expect(isInstitutionalEmail(email)).toBe(true);
      expect(checkInstitutionalEmail(email).ok).toBe(true);
    });
  }
});

describe('rejects other providers', () => {
  const invalid = [
    'user@gmail.com',
    'user@yahoo.com',
    'user@hotmail.com',
    'user@outlook.com',
    'user@example.com',
    'demo@gmail.com',
    'test@gmail.com',
    'superadmin@tdms.test',
    'j2itsolution26@gmail.com',
  ];

  for (const email of invalid) {
    it(`rejects ${email}`, () => {
      expect(isInstitutionalEmail(email)).toBe(false);
      const check = checkInstitutionalEmail(email);
      expect(check.ok).toBe(false);
      expect(check.message).toBe(DOMAIN_REJECTION_MESSAGE);
    });
  }
});

describe('rejects lookalike domains', () => {
  /*
   * Each of these is specifically chosen to defeat a naive implementation.
   * The comment says which shortcut it breaks.
   */
  const lookalikes: [string, string][] = [
    ['user@asiancollege.edu.ph.example.com', 'domain is a prefix, not the whole domain'],
    ['user@asiancollege.edu.ph.fake.com', 'domain buried in a longer name'],
    ['user@notasiancollege.edu.ph', 'endsWith() would accept this'],
    ['user@xasiancollege.edu.ph', 'endsWith() would accept this'],
    ['user@-asiancollege.edu.ph', 'endsWith() would accept this'],
    ['user@asiancollege-edu.ph', 'hyphen substituted for a dot'],
    ['user@asiancollege.edu.ph.', 'trailing dot makes it a different host'],
    ['user@sub.asiancollege.edu.ph', 'a subdomain is a different host'],
    ['user@asiancollege.edu', 'truncated domain'],
    ['user@asiancollege.ph', 'missing label'],
    ['user@evil.com?asiancollege.edu.ph', 'query-ish suffix'],
    ['user@evil.com#asiancollege.edu.ph', 'fragment-ish suffix'],
    ['user@asiancollege.edu.ph@evil.com', 'two @ — last wins, so this is evil.com'],
    ['user@evil.com@asiancollege.edu.ph', 'two @ — rejected outright'],
  ];

  for (const [email, why] of lookalikes) {
    it(`rejects ${email} (${why})`, () => {
      expect(isInstitutionalEmail(email)).toBe(false);
    });
  }
});

describe('rejects malformed input', () => {
  const malformed = [
    '',
    '   ',
    'not-an-email',
    '@asiancollege.edu.ph',
    'user@',
    '@',
    'user name@asiancollege.edu.ph',
    'user,name@asiancollege.edu.ph',
    '<user@asiancollege.edu.ph>',
    'user@asiancollege.edu.ph<script>',
    '.user@asiancollege.edu.ph',
    'user.@asiancollege.edu.ph',
    'us..er@asiancollege.edu.ph',
    `${'a'.repeat(65)}@asiancollege.edu.ph`,
  ];

  for (const email of malformed) {
    it(`rejects ${JSON.stringify(email)}`, () => {
      expect(isInstitutionalEmail(email)).toBe(false);
    });
  }

  it('rejects an over-long address', () => {
    const check = checkInstitutionalEmail(`${'a'.repeat(300)}@asiancollege.edu.ph`);
    expect(check.ok).toBe(false);
  });
});

describe('normalisation', () => {
  it('trims whitespace', () => {
    expect(normalizeEmail('  user@asiancollege.edu.ph  ')).toBe('user@asiancollege.edu.ph');
    expect(isInstitutionalEmail('  user@asiancollege.edu.ph  ')).toBe(true);
  });

  it('lower-cases the whole address', () => {
    expect(normalizeEmail('User.Name@AsianCollege.Edu.PH')).toBe('user.name@asiancollege.edu.ph');
  });

  it('accepts a mixed-case institutional address', () => {
    expect(isInstitutionalEmail('JUAN.DELACRUZ@ASIANCOLLEGE.EDU.PH')).toBe(true);
  });

  it('returns the normalised form for storage', () => {
    const check = checkInstitutionalEmail('  Juan.DelaCruz@AsianCollege.edu.ph ');
    expect(check.ok).toBe(true);
    expect(check.email).toBe('juan.delacruz@asiancollege.edu.ph');
  });

  it('collapses case so two spellings cannot become two accounts', () => {
    expect(normalizeEmail('J.Cruz@asiancollege.edu.ph')).toBe(
      normalizeEmail('j.cruz@ASIANCOLLEGE.EDU.PH'),
    );
  });
});

describe('configuration', () => {
  it('defaults to the college domain', () => {
    expect(INSTITUTIONAL_DOMAIN).toBe('asiancollege.edu.ph');
  });

  it('names the domain in the rejection message', () => {
    expect(DOMAIN_REJECTION_MESSAGE).toContain('asiancollege.edu.ph');
  });
});
