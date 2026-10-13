import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkInstitutionalEmail, isInstitutionalEmail } from './institutional-email';
import {
  initialSetupSchema,
  inviteAccountSchema,
  forgotPasswordSchema,
  updateProfileSchema,
} from '@/server/schemas/schemas';

/**
 * A guard against the domain restriction creeping back in as a hard-coded
 * rule somewhere.
 *
 * Every schema and validator that accepts an address is exercised here with
 * ordinary consumer domains while the restriction is OFF. If anyone later
 * adds an `endsWith('asiancollege.edu.ph')` to a form schema, an API route or
 * a service, one of these fails — which is the point: the switch is only
 * meaningful if nothing bypasses it.
 */

const KEYS = ['GOOGLE_DOMAIN_RESTRICTION_ENABLED', 'GOOGLE_ALLOWED_DOMAIN'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  // The development setting: restriction off.
  delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  process.env.GOOGLE_ALLOWED_DOMAIN = 'asiancollege.edu.ph';
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** The addresses the brief requires to work during development. */
const DEVELOPMENT_ADDRESSES = [
  'developer@gmail.com',
  'test@gmail.com',
  'user@gmail.com',
  'user@asiancollege.edu.ph',
  'developer@outlook.com',
  'user@yahoo.com',
];

const STRONG_PASSWORD = 'Institution#2026x';

describe('the core validator accepts any well-formed address', () => {
  for (const email of DEVELOPMENT_ADDRESSES) {
    it(`accepts ${email}`, () => {
      expect(isInstitutionalEmail(email)).toBe(true);
      expect(checkInstitutionalEmail(email).ok).toBe(true);
    });
  }
});

describe('first administrator setup', () => {
  for (const email of DEVELOPMENT_ADDRESSES) {
    it(`accepts ${email}`, () => {
      const result = initialSetupSchema.safeParse({
        name: 'Dev Tester',
        email,
        password: STRONG_PASSWORD,
        passwordConfirmation: STRONG_PASSWORD,
      });
      expect(result.success).toBe(true);
    });
  }

  it('still enforces the password policy', () => {
    const result = initialSetupSchema.safeParse({
      name: 'Dev Tester',
      email: 'developer@gmail.com',
      password: 'weak',
      passwordConfirmation: 'weak',
    });
    expect(result.success).toBe(false);
  });
});

describe('staff invitation', () => {
  for (const email of DEVELOPMENT_ADDRESSES) {
    it(`accepts ${email}`, () => {
      const result = inviteAccountSchema.safeParse({
        name: 'Dev Tester',
        email,
        role: 'secretary',
      });
      expect(result.success).toBe(true);
    });
  }

  it('still refuses to hand out a student role from the Staff screen', () => {
    const result = inviteAccountSchema.safeParse({
      name: 'Dev Tester',
      email: 'developer@gmail.com',
      role: 'student',
    });
    expect(result.success).toBe(false);
  });
});

describe('password reset request', () => {
  for (const email of DEVELOPMENT_ADDRESSES) {
    it(`accepts ${email}`, () => {
      expect(forgotPasswordSchema.safeParse({ email }).success).toBe(true);
    });
  }
});

describe('profile update', () => {
  for (const email of DEVELOPMENT_ADDRESSES) {
    it(`accepts ${email}`, () => {
      const result = updateProfileSchema.safeParse({ name: 'Dev Tester', email });
      expect(result.success).toBe(true);
    });
  }
});

describe('email FORMAT is still enforced — a separate rule entirely', () => {
  const malformed = ['hello', 'test', 'hello@', '@example.com', '', '   ', 'a b@c.com', 'a@b'];

  for (const email of malformed) {
    it(`rejects ${JSON.stringify(email)} everywhere`, () => {
      expect(isInstitutionalEmail(email)).toBe(false);
      expect(forgotPasswordSchema.safeParse({ email }).success).toBe(false);
      expect(
        inviteAccountSchema.safeParse({ name: 'N', email, role: 'secretary' }).success,
      ).toBe(false);
      expect(updateProfileSchema.safeParse({ name: 'N', email }).success).toBe(false);
    });
  }
});

describe('the restriction still works when switched back on', () => {
  beforeEach(() => {
    process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = 'true';
  });

  it('rejects consumer domains again, across every schema', () => {
    const email = 'developer@gmail.com';

    expect(isInstitutionalEmail(email)).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email }).success).toBe(false);
    expect(inviteAccountSchema.safeParse({ name: 'N', email, role: 'secretary' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: 'N', email }).success).toBe(false);
    expect(
      initialSetupSchema.safeParse({
        name: 'N',
        email,
        password: STRONG_PASSWORD,
        passwordConfirmation: STRONG_PASSWORD,
      }).success,
    ).toBe(false);
  });

  it('still accepts the institutional domain', () => {
    const email = 'someone@asiancollege.edu.ph';
    expect(isInstitutionalEmail(email)).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email }).success).toBe(true);
    expect(inviteAccountSchema.safeParse({ name: 'N', email, role: 'secretary' }).success).toBe(true);
  });
});
