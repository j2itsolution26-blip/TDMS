import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isInstitutionalEmail,
  isWellFormedEmail,
  isOnAllowedDomain,
  checkInstitutionalEmail,
  domainRestrictionEnabled,
  allowedDomain,
  describeDomainPolicy,
} from './institutional-email';

/**
 * The domain restriction is a switch. These tests exercise BOTH positions,
 * because the whole point of making it configurable is that turning it back
 * on later must still work — a switch that is only ever tested in one
 * position is a switch nobody can trust.
 */

const KEYS = [
  'GOOGLE_DOMAIN_RESTRICTION_ENABLED',
  'GOOGLE_ALLOWED_DOMAIN',
  'INSTITUTIONAL_EMAIL_DOMAIN',
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

function enable(domain = 'asiancollege.edu.ph') {
  process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = 'true';
  process.env.GOOGLE_ALLOWED_DOMAIN = domain;
}

describe('the switch itself', () => {
  it('is OFF when unset — the development default', () => {
    expect(domainRestrictionEnabled()).toBe(false);
  });

  it('accepts the usual affirmatives', () => {
    for (const value of ['true', 'TRUE', '1', 'yes', 'on', ' True ']) {
      process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = value;
      expect(domainRestrictionEnabled()).toBe(true);
    }
  });

  it('treats anything else as off, including typos', () => {
    // A misspelling must not half-enable it, and must not enable it either.
    for (const value of ['false', 'no', 'off', '0', '', 'ture', 'enabled', 'yes please']) {
      process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = value;
      expect(domainRestrictionEnabled()).toBe(false);
    }
  });

  it('is read per call, so a deployment can change it without a rebuild', () => {
    expect(domainRestrictionEnabled()).toBe(false);
    process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = 'true';
    expect(domainRestrictionEnabled()).toBe(true);
  });
});

describe('which domain is enforced', () => {
  it('prefers GOOGLE_ALLOWED_DOMAIN', () => {
    process.env.GOOGLE_ALLOWED_DOMAIN = 'example.edu';
    process.env.INSTITUTIONAL_EMAIL_DOMAIN = 'other.edu';
    expect(allowedDomain()).toBe('example.edu');
  });

  it('falls back to the variable that was already in use', () => {
    process.env.INSTITUTIONAL_EMAIL_DOMAIN = 'other.edu';
    expect(allowedDomain()).toBe('other.edu');
  });

  it('defaults to the college domain', () => {
    expect(allowedDomain()).toBe('asiancollege.edu.ph');
  });

  it('normalises case and whitespace', () => {
    process.env.GOOGLE_ALLOWED_DOMAIN = '  AsianCollege.EDU.ph ';
    expect(allowedDomain()).toBe('asiancollege.edu.ph');
  });
});

describe('RESTRICTION OFF — any real Google account (development)', () => {
  const shouldPass = [
    'user@gmail.com',
    'developer@gmail.com',
    'user@asiancollege.edu.ph',
    'someone@yahoo.com',
    'dev.tester@outlook.com',
    'first.last+tag@some-company.co.uk',
  ];

  for (const email of shouldPass) {
    it(`accepts ${email}`, () => {
      expect(isInstitutionalEmail(email)).toBe(true);
      expect(checkInstitutionalEmail(email).ok).toBe(true);
    });
  }

  it('still rejects malformed addresses — a different question entirely', () => {
    const malformed = [
      '',
      'not-an-email',
      '@gmail.com',
      'user@',
      'user name@gmail.com',
      'a@b@c.com',
      '.user@gmail.com',
      'us..er@gmail.com',
      'user@nodot',
      'user@-bad.com',
    ];
    for (const email of malformed) {
      expect(isInstitutionalEmail(email)).toBe(false);
    }
  });

  it('normalises for storage just the same', () => {
    const check = checkInstitutionalEmail('  Dev.Tester@GMAIL.com ');
    expect(check.ok).toBe(true);
    expect(check.email).toBe('dev.tester@gmail.com');
  });

  it('does not mention a domain in its refusal message', () => {
    const check = checkInstitutionalEmail('not-an-email');
    expect(check.ok).toBe(false);
    expect(check.message).not.toContain('asiancollege');
  });

  it('reports itself as open', () => {
    const policy = describeDomainPolicy();
    expect(policy.enabled).toBe(false);
    expect(policy.summary).toMatch(/OPEN/);
  });
});

describe('RESTRICTION ON — institutional only (launch)', () => {
  beforeEach(() => enable());

  it('allows the institutional domain', () => {
    expect(isInstitutionalEmail('user@asiancollege.edu.ph')).toBe(true);
  });

  it('rejects other providers', () => {
    for (const email of ['user@gmail.com', 'developer@gmail.com', 'user@yahoo.com']) {
      expect(isInstitutionalEmail(email)).toBe(false);
      expect(checkInstitutionalEmail(email).message).toBe(
        'Only an @asiancollege.edu.ph account can access TDMS.',
      );
    }
  });

  it('still rejects every lookalike', () => {
    const lookalikes = [
      'user@asiancollege.edu.ph.example.com',
      'user@notasiancollege.edu.ph',
      'user@fakeasiancollege.edu.ph',
      'user@asiancollege-edu.ph',
      'user@sub.asiancollege.edu.ph',
      'user@asiancollege.com',
      'user@asiancollege.edu',
      'user@asiancollege.edu.ph@evil.com',
    ];
    for (const email of lookalikes) {
      expect(isInstitutionalEmail(email)).toBe(false);
    }
  });

  it('honours a different configured domain', () => {
    enable('example.edu');
    expect(isInstitutionalEmail('user@example.edu')).toBe(true);
    expect(isInstitutionalEmail('user@asiancollege.edu.ph')).toBe(false);
    expect(checkInstitutionalEmail('user@gmail.com').message).toBe(
      'Only an @example.edu account can access TDMS.',
    );
  });

  it('reports itself as restricted', () => {
    const policy = describeDomainPolicy();
    expect(policy.enabled).toBe(true);
    expect(policy.allowedDomain).toBe('asiancollege.edu.ph');
    expect(policy.summary).toContain('asiancollege.edu.ph');
  });
});

describe('the two questions stay separate', () => {
  it('isWellFormedEmail ignores the domain policy entirely', () => {
    expect(isWellFormedEmail('user@gmail.com')).toBe(true);
    enable();
    expect(isWellFormedEmail('user@gmail.com')).toBe(true);
  });

  it('isOnAllowedDomain ignores whether the restriction is switched on', () => {
    // Off, but the comparison still answers truthfully — which is what lets
    // the restriction be turned back on with confidence.
    expect(isOnAllowedDomain('user@asiancollege.edu.ph')).toBe(true);
    expect(isOnAllowedDomain('user@gmail.com')).toBe(false);
  });

  it('flipping the switch changes the verdict with no other change', () => {
    expect(isInstitutionalEmail('user@gmail.com')).toBe(true);
    enable();
    expect(isInstitutionalEmail('user@gmail.com')).toBe(false);
    delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
    expect(isInstitutionalEmail('user@gmail.com')).toBe(true);
  });
});
