import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AuthUser } from '@/types/domain';

/**
 * The Super Admin-controlled administrator workflow, exercised end to end
 * against an in-memory database (src/test/fake-prisma.ts).
 *
 * THE INVARIANTS THESE TESTS EXIST FOR
 *
 *   1. A CORRECT PASSWORD ALONE NEVER PRODUCES A SESSION for an Admin. Every
 *      failure path below is checked for "and no session was created" as well
 *      as for its own behaviour, because that is the part that matters.
 *
 *   2. AN ACCESS CODE WORKS EXACTLY ONCE. Used, superseded, expired or out of
 *      attempts — all four are refused, and the second submission of a code
 *      that just worked is refused too.
 *
 *   3. NO CREDENTIAL IS STORED IN PLAINTEXT. The whole store is searched for
 *      the temporary password and the access code after every flow that issues
 *      them, including the audit log.
 *
 *   4. NOTHING ISSUES A CREDENTIAL WITHOUT THE STATIC SECURITY CODE, and an
 *      unconfigured code is not "allow".
 */

const env = vi.hoisted(() => {
  // Hashing cost is irrelevant to correctness here and dominates the runtime.
  process.env.BCRYPT_ROUNDS = '4';
  process.env.ADMIN_ACCESS_CODE_EXPIRATION_MINUTES = '10';
  process.env.ADMIN_ACCESS_CODE_MAX_ATTEMPTS = '5';
  process.env.ADMIN_LOGIN_CHALLENGE_TTL_MINUTES = '15';
  // The domain restriction is off in development; addresses below reflect that.
  delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  return {};
});
void env;

const fake = vi.hoisted(async () => {
  const { createFakePrisma } = await import('./../../test/fake-prisma');
  return createFakePrisma();
});

/** A cookie jar, so the HttpOnly challenge handle behaves as it does live. */
const jar = vi.hoisted(() => {
  const cookies = new Map<string, string>();
  return {
    cookies,
    api: {
      get: (name: string) => {
        const value = cookies.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => void cookies.set(name, value),
      delete: (name: string) => void cookies.delete(name),
    },
  };
});

const mail = vi.hoisted(() => ({
  codes: [] as { to: string; code: string; expiresAt: Date }[],
  requests: [] as { to: string; adminEmail: string }[],
  delivered: true,
  configured: true,
}));

vi.mock('@/lib/prisma', async () => ({ prisma: (await fake).prisma }));

vi.mock('next/headers', () => ({ cookies: async () => jar.api }));

vi.mock('@/server/mail/mailer', () => ({
  canSendMail: () => mail.configured,
  appUrl: () => 'http://localhost:3000',
}));

vi.mock('@/server/mail/messages', () => ({
  sendAdminAccessCodeEmail: async (params: { to: string; code: string; expiresAt: Date }) => {
    mail.codes.push(params);
    return mail.delivered
      ? { delivered: true, transport: 'resend' }
      : { delivered: false, transport: 'resend', detail: 'The provider refused.' };
  },
  sendAccessCodeRequestEmail: async (params: { to: string; adminEmail: string }) => {
    mail.requests.push(params);
    return { delivered: true, transport: 'resend' };
  },
}));

const {
  createAdminAccount,
  generateAdminAccessCode,
  resetAdminTemporaryPassword,
  setAdminAccountStatus,
  listAdminAccounts,
} = await import('./admin-account-service');

const {
  beginAdminVerification,
  verifyAdminAccessCode,
  describeAdminChallenge,
  requestNewAccessCode,
  abandonAdminChallenge,
} = await import('./admin-login-service');

const { prisma, store, reset } = await fake;

const CONTEXT = { ip: '203.0.113.10', userAgent: 'vitest' };
const SECURITY_CODE = 'w8Qm-4rTx_9Lb2Ke';
const TEMP_PASSWORD = 'Institution#2026x';

const DETAILS = {
  name: 'James Tan',
  email: 'jctan.student@gmail.com',
  temporaryPassword: TEMP_PASSWORD,
  securityCode: SECURITY_CODE,
  emailAccessCode: false,
};

/** JSON, tolerating the BigInt ids the fake hands out. */
function dump(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/** Nothing anywhere in the database contains this string. */
function expectNotStored(secret: string) {
  expect(dump(store)).not.toContain(secret);
}

let actor: AuthUser;

beforeEach(async () => {
  reset();
  jar.cookies.clear();
  mail.codes.length = 0;
  mail.requests.length = 0;
  mail.delivered = true;
  mail.configured = true;
  process.env.SUPER_ADMIN_STATIC_CODE = SECURITY_CODE;

  await prisma.role.create({ data: { name: 'super_admin', guardName: 'web' } });
  await prisma.role.create({ data: { name: 'admin', guardName: 'web' } });

  const owner = await prisma.user.create({
    data: {
      name: 'Owner',
      email: 'owner@example.test',
      password: 'x',
      status: 'ACTIVE',
      isActive: true,
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
    },
  });
  const superRole = await prisma.role.findFirst({ where: { name: 'super_admin' } });
  await prisma.modelHasRole.create({
    data: { roleId: superRole.id, modelType: 'App\\Models\\User', modelId: owner.id },
  });

  actor = {
    id: owner.id.toString(),
    name: 'Owner',
    username: null,
    email: 'owner@example.test',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    mustChangePassword: false,
    roles: ['super_admin'],
    permissions: [],
  };
});

/** Create an admin and return what the Super Admin was shown once. */
async function createAdmin(overrides: Partial<typeof DETAILS> = {}) {
  return createAdminAccount(actor, { ...DETAILS, ...overrides }, CONTEXT);
}

function adminRow() {
  return store.users.find((u) => u.email === DETAILS.email)!;
}

function codeRows() {
  return store.adminAccessCodes;
}

// ---------------------------------------------------------------------------

describe('the static security code gate', () => {
  it('refuses to create an administrator when no code is configured', async () => {
    delete process.env.SUPER_ADMIN_STATIC_CODE;

    await expect(createAdmin()).rejects.toMatchObject({ code: 'SECURITY_CODE_NOT_CONFIGURED' });

    // Nothing was created. An unset variable is not "allow".
    expect(store.users.filter((u) => u.email === DETAILS.email)).toHaveLength(0);
    expect(codeRows()).toHaveLength(0);
  });

  it('refuses a wrong code and creates nothing', async () => {
    await expect(createAdmin({ securityCode: 'not-the-code' })).rejects.toMatchObject({
      code: 'SECURITY_CODE_REJECTED',
    });

    expect(store.users.filter((u) => u.email === DETAILS.email)).toHaveLength(0);
    expect(codeRows()).toHaveLength(0);
  });

  it('audits a wrong code without recording what was guessed', async () => {
    await expect(createAdmin({ securityCode: 'nearly-the-code' })).rejects.toThrow();

    const rejected = store.auditLogs.filter(
      (a) => a.action === 'SUPER_ADMIN_SECURITY_CODE_REJECTED',
    );
    expect(rejected).toHaveLength(1);

    /*
     * An audit table full of near-miss guesses is a wordlist for the real
     * code, so the attempt itself is never recorded.
     */
    expect(dump(rejected)).not.toContain('nearly-the-code');
    expect(dump(store.auditLogs)).not.toContain(SECURITY_CODE);
  });

  it('throttles repeated wrong codes', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(createAdmin({ securityCode: `wrong-${i}` })).rejects.toMatchObject({
        code: 'SECURITY_CODE_REJECTED',
      });
    }

    await expect(createAdmin({ securityCode: 'wrong-again' })).rejects.toMatchObject({
      code: 'SECURITY_CODE_THROTTLED',
    });

    // And the throttle holds even against the CORRECT code, because the
    // counter is spent before the comparison is reached.
    await expect(createAdmin()).rejects.toMatchObject({ code: 'SECURITY_CODE_THROTTLED' });
  });

  it('clears the budget once a correct code is given', async () => {
    await expect(createAdmin({ securityCode: 'wrong' })).rejects.toThrow();
    await createAdmin();

    // A second create would have tripped the limit had the counter persisted.
    await expect(createAdmin({ email: 'second@example.test', securityCode: 'wrong' })).rejects
      .toMatchObject({ code: 'SECURITY_CODE_REJECTED' });
  });
});

describe('creating an administrator', () => {
  it('creates an ACTIVE account — never PENDING, and never awaiting approval', async () => {
    await createAdmin();
    const row = adminRow();

    expect(row.status).toBe('ACTIVE');
    expect(row.isActive).toBe(true);
    // The whole point: there is no approval state to sit in.
    expect(row.status).not.toBe('PENDING');
  });

  it('marks the credential temporary rather than the account incomplete', async () => {
    await createAdmin();
    const row = adminRow();

    expect(row.mustChangePassword).toBe(true);
    // Status is a state of the ACCOUNT; setup progress lives on its own field.
    expect(row.status).toBe('ACTIVE');
  });

  it('confirms the address administratively, so the handed-over password works', async () => {
    await createAdmin();
    expect(adminRow().emailVerifiedAt).toBeInstanceOf(Date);

    const created = store.auditLogs.find((a) => a.action === 'ADMIN_CREATED')!;
    // The trail says the confirmation was administrative; it does not claim
    // the holder proved anything.
    expect((created.details as Record<string, unknown>).email_confirmation).toBe('administrative');
  });

  it('assigns the admin role and nothing else', async () => {
    await createAdmin();
    const row = adminRow();

    const assignments = store.modelHasRoles.filter((m) => String(m.modelId) === String(row.id));
    expect(assignments).toHaveLength(1);

    const adminRole = store.roles.find((r) => r.name === 'admin')!;
    expect(String(assignments[0]!.roleId)).toBe(String(adminRole.id));
  });

  it('issues a first access code with the configured budget', async () => {
    const issued = await createAdmin();

    expect(issued.accessCode).toMatch(/^[0-9]{6}$/);
    expect(issued.accessCodeExpiresInSeconds).toBeGreaterThan(500);
    expect(issued.accessCodeExpiresInSeconds).toBeLessThanOrEqual(600);

    expect(codeRows()).toHaveLength(1);
    expect(codeRows()[0]!.maxAttempts).toBe(5);
    expect(codeRows()[0]!.attemptCount).toBe(0);
    expect(codeRows()[0]!.usedAt).toBeNull();
  });

  it('stores neither the temporary password nor the access code in plaintext', async () => {
    const issued = await createAdmin();

    expectNotStored(issued.temporaryPassword);
    expectNotStored(issued.accessCode);

    // What IS stored is a bcrypt hash of each.
    expect(String(adminRow().password).startsWith('$2')).toBe(true);
    expect(String(codeRows()[0]!.codeHash).startsWith('$2')).toBe(true);
  });

  it('keeps both out of the audit trail', async () => {
    const issued = await createAdmin();

    expect(dump(store.auditLogs)).not.toContain(issued.temporaryPassword);
    expect(dump(store.auditLogs)).not.toContain(issued.accessCode);
    expect(dump(store.auditLogs)).not.toContain(SECURITY_CODE);

    // It records THAT they were issued, which is what an auditor needs.
    const created = store.auditLogs.find((a) => a.action === 'ADMIN_CREATED')!;
    expect((created.details as Record<string, unknown>).access_code_issued).toBe(true);
    expect(store.auditLogs.some((a) => a.action === 'ADMIN_ACCESS_CODE_GENERATED')).toBe(true);
  });

  it('refuses a second account on the same address', async () => {
    await createAdmin();
    await expect(createAdmin()).rejects.toMatchObject({ status: 422 });
    expect(store.users.filter((u) => u.email === DETAILS.email)).toHaveLength(1);
  });

  it('emails the code only when asked, and never the password', async () => {
    const quiet = await createAdmin();
    expect(mail.codes).toHaveLength(0);
    expect(quiet.mailDelivered).toBe(false);

    const loud = await createAdmin({ email: 'second@example.test', emailAccessCode: true });
    expect(mail.codes).toHaveLength(1);
    expect(mail.codes[0]!.to).toBe('second@example.test');
    expect(mail.codes[0]!.code).toBe(loud.accessCode);

    /*
     * One mailbox must never hold a complete set of credentials, so the
     * temporary password is not in anything that was sent.
     */
    expect(dump(mail.codes)).not.toContain(loud.temporaryPassword);
  });

  it('reports an undeliverable code rather than pretending it sent', async () => {
    mail.delivered = false;
    const issued = await createAdmin({ emailAccessCode: true });

    expect(issued.mailDelivered).toBe(false);
    expect(issued.mailDetail).toBe('The provider refused.');
    // The account and the code still exist; only the delivery failed.
    expect(adminRow()).toBeDefined();
    expect(codeRows()).toHaveLength(1);
  });

  it('lists the account without ever exposing its code', async () => {
    await createAdmin();
    const listed = await listAdminAccounts(1);

    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]!.email).toBe(DETAILS.email);
    expect(listed.rows[0]!.mustChangePassword).toBe(true);
    expect(listed.rows[0]!.accessCodeExpiresInSeconds).toBeGreaterThan(0);

    // Time remaining, never the code and never its hash.
    expect(dump(listed.rows)).not.toContain(String(codeRows()[0]!.codeHash));
  });
});

describe('re-issuing an access code', () => {
  it('cancels the previous unused code and empties its hash', async () => {
    const first = await createAdmin();
    const adminId = BigInt(String(adminRow().id));

    const second = await generateAdminAccessCode(
      actor,
      adminId,
      { securityCode: SECURITY_CODE, emailAccessCode: false },
      CONTEXT,
    );

    expect(second.accessCode).not.toBe(first.accessCode);
    expect(codeRows()).toHaveLength(2);

    const superseded = codeRows()[0]!;
    expect(superseded.invalidatedAt).toBeInstanceOf(Date);
    /*
     * Emptying the hash as well as stamping the row means a superseded code
     * cannot be matched even by a code path that forgot to check
     * invalidatedAt. Belt and braces, because "the old code still works" is
     * the failure nobody notices.
     */
    expect(superseded.codeHash).toBe('');

    expectNotStored(first.accessCode);
    expectNotStored(second.accessCode);
  });

  it('leaves exactly one live code behind', async () => {
    await createAdmin();
    const adminId = BigInt(String(adminRow().id));

    for (let i = 0; i < 3; i += 1) {
      await generateAdminAccessCode(
        actor,
        adminId,
        { securityCode: SECURITY_CODE, emailAccessCode: false },
        CONTEXT,
      );
    }

    const live = codeRows().filter((c) => c.usedAt === null && c.invalidatedAt === null);
    expect(live).toHaveLength(1);
  });

  it('needs the security code too', async () => {
    await createAdmin();
    const adminId = BigInt(String(adminRow().id));

    await expect(
      generateAdminAccessCode(
        actor,
        adminId,
        { securityCode: 'wrong', emailAccessCode: false },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ code: 'SECURITY_CODE_REJECTED' });

    // The original code is untouched — a failed re-issue must not cancel it.
    expect(codeRows()).toHaveLength(1);
    expect(codeRows()[0]!.invalidatedAt).toBeNull();
  });

  it('will not issue a code to a suspended administrator', async () => {
    await createAdmin();
    const adminId = BigInt(String(adminRow().id));

    await setAdminAccountStatus(actor, adminId, 'SUSPENDED', CONTEXT);

    await expect(
      generateAdminAccessCode(
        actor,
        adminId,
        { securityCode: SECURITY_CODE, emailAccessCode: false },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('the two-step sign-in', () => {
  /** Get to the point where a code is expected, as a real sign-in would. */
  async function halfWayIn(remember = false) {
    const issued = await createAdmin();
    const adminId = BigInt(String(adminRow().id));
    await beginAdminVerification(adminId, { remember, ip: CONTEXT.ip, userAgent: 'vitest' });
    return { issued, adminId };
  }

  it('creates no session when only the password has been accepted', async () => {
    await halfWayIn();

    expect(store.sessions).toHaveLength(0);
    expect(store.adminLoginChallenges).toHaveLength(1);
    expect(store.adminLoginChallenges[0]!.consumedAt).toBeNull();

    // The browser holds an opaque handle, and the row holds only its digest.
    const handle = jar.cookies.get('tdms_admin_login')!;
    expect(handle).toMatch(/^[0-9a-f]{64}$/);
    expectNotStored(handle);
  });

  it('tells the screen what it needs and nothing more', async () => {
    await halfWayIn();
    const state = (await describeAdminChallenge())!;

    expect(state.email).toBe(DETAILS.email);
    expect(state.codeExpiresInSeconds).toBeGreaterThan(0);
    expect(state.attemptsRemaining).toBe(5);
    expect(state.challengeExpiresInSeconds).toBeGreaterThan(0);

    // No code, no hash, no user id.
    expect(dump(state)).not.toContain(String(codeRows()[0]!.codeHash));
    expect(dump(state)).not.toContain(String(adminRow().id));
  });

  it('signs the administrator in on the correct code', async () => {
    const { issued } = await halfWayIn();

    const result = await verifyAdminAccessCode(issued.accessCode, CONTEXT);

    // A temporary password is still outstanding, so that is where they go.
    expect(result.redirectTo).toBe('/change-password');
    expect(store.sessions).toHaveLength(1);
    expect(codeRows()[0]!.usedAt).toBeInstanceOf(Date);
    expect(store.adminLoginChallenges[0]!.consumedAt).toBeInstanceOf(Date);
    expect(adminRow().lastLoginAt).toBeInstanceOf(Date);

    expect(store.auditLogs.some((a) => a.action === 'ADMIN_ACCESS_CODE_USED')).toBe(true);
    expect(store.auditLogs.some((a) => a.action === 'ADMIN_LOGIN_SUCCESS')).toBe(true);
  });

  it('carries the Remember me tick across the two steps', async () => {
    const { issued } = await halfWayIn(true);
    await verifyAdminAccessCode(issued.accessCode, CONTEXT);

    // A remembered session outlives the default 120-minute window by years.
    const expires = store.sessions[0]!.expiresAt as Date;
    expect(expires.getTime() - Date.now()).toBeGreaterThan(365 * 24 * 3600 * 1000);
  });

  it('refuses the same code a second time', async () => {
    const { issued, adminId } = await halfWayIn();
    await verifyAdminAccessCode(issued.accessCode, CONTEXT);
    expect(store.sessions).toHaveLength(1);

    // Start over with the same code: a fresh challenge, same spent code.
    await beginAdminVerification(adminId, { remember: false, ip: CONTEXT.ip, userAgent: 'vitest' });

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_UNUSABLE',
    });

    // No second session came out of it.
    expect(store.sessions).toHaveLength(1);
  });

  it('refuses a code that has been superseded', async () => {
    const { issued, adminId } = await halfWayIn();

    await generateAdminAccessCode(
      actor,
      adminId,
      { securityCode: SECURITY_CODE, emailAccessCode: false },
      CONTEXT,
    );

    /*
     * Reported as simply wrong rather than as "cancelled", and it costs an
     * attempt against the current code. That is not a rough edge, it is the
     * consequence of a decision worth keeping: re-issuing empties the old
     * row's hash, so a superseded code CANNOT be recognised — and a system
     * that could recognise it is one refactor away from accepting it. From
     * the server's side this submission is a wrong guess, and a wrong guess
     * spends a guess.
     */
    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_INCORRECT',
    });
    expect(store.sessions).toHaveLength(0);
  });

  it('measures a submission against the newest code, not the oldest', async () => {
    const { adminId } = await halfWayIn();

    const replacement = await generateAdminAccessCode(
      actor,
      adminId,
      { securityCode: SECURITY_CODE, emailAccessCode: false },
      CONTEXT,
    );

    // The replacement works; the ordering is by id, so two codes issued in the
    // same millisecond cannot make "newest" ambiguous.
    await expect(verifyAdminAccessCode(replacement.accessCode, CONTEXT)).resolves.toMatchObject({
      redirectTo: '/change-password',
    });
    expect(store.sessions).toHaveLength(1);
  });

  it('refuses an expired code', async () => {
    const { issued } = await halfWayIn();

    // Wind the expiry back rather than waiting ten minutes.
    codeRows()[0]!.expiresAt = new Date(Date.now() - 1000);

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_UNUSABLE',
    });
    expect(store.sessions).toHaveLength(0);
    expect(store.auditLogs.some((a) => a.action === 'ADMIN_ACCESS_CODE_EXPIRED')).toBe(true);
  });

  it('spends one attempt per wrong guess and says how many are left', async () => {
    const { issued } = await halfWayIn();
    const wrong = issued.accessCode === '000000' ? '111111' : '000000';

    await expect(verifyAdminAccessCode(wrong, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_INCORRECT',
    });

    expect(codeRows()[0]!.attemptCount).toBe(1);
    expect(codeRows()[0]!.invalidatedAt).toBeNull();
    expect((await describeAdminChallenge())!.attemptsRemaining).toBe(4);
    expect(store.sessions).toHaveLength(0);
  });

  it('burns the code at the attempt cap, and the right code no longer works', async () => {
    const { issued } = await halfWayIn();
    const wrong = issued.accessCode === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      await expect(verifyAdminAccessCode(wrong, CONTEXT)).rejects.toThrow();
    }

    expect(codeRows()[0]!.invalidatedAt).toBeInstanceOf(Date);
    expect(codeRows()[0]!.codeHash).toBe('');

    /*
     * The point of the cap: at six digits the attempt limit IS the security,
     * so once it is spent the correct code has to stop working too.
     */
    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_UNUSABLE',
    });
    expect(store.sessions).toHaveLength(0);
  });

  it('does not spend an attempt on a malformed submission', async () => {
    const { issued } = await halfWayIn();
    void issued;

    for (const malformed of ['', '12345', '1234567', 'abcdef']) {
      await expect(verifyAdminAccessCode(malformed, CONTEXT)).rejects.toMatchObject({
        code: 'ACCESS_CODE_MALFORMED',
      });
    }

    // A typo in the box is not an attempt against the code.
    expect(codeRows()[0]!.attemptCount).toBe(0);
  });

  it('refuses without the challenge cookie, whatever the code is', async () => {
    const { issued } = await halfWayIn();
    jar.cookies.clear();

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_LOGIN_EXPIRED',
    });
    expect(store.sessions).toHaveLength(0);
    // The code is untouched: an attempt nobody was authorised to make does not
    // cost the account one of its guesses.
    expect(codeRows()[0]!.attemptCount).toBe(0);
  });

  it('refuses an expired challenge', async () => {
    const { issued } = await halfWayIn();
    store.adminLoginChallenges[0]!.expiresAt = new Date(Date.now() - 1000);

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_LOGIN_EXPIRED',
    });
    expect(store.sessions).toHaveLength(0);
  });

  it('stops an administrator suspended between the two steps', async () => {
    const { issued, adminId } = await halfWayIn();

    // The Super Admin acts while the person is on the code screen.
    await setAdminAccountStatus(actor, adminId, 'SUSPENDED', CONTEXT);

    /*
     * Suspending drops the half-finished sign-in outright, so the code screen
     * reports the sign-in as over rather than the account as suspended. That
     * is the right order of events: they are sent back to /login, which is
     * where the suspension is explained by the ordinary sign-in path.
     */
    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_LOGIN_EXPIRED',
    });
    expect(store.sessions).toHaveLength(0);
    expect(store.adminLoginChallenges).toHaveLength(0);
  });

  it('re-reads eligibility rather than trusting the password step', async () => {
    const { issued } = await halfWayIn();

    /*
     * The status is changed WITHOUT going through setAdminAccountStatus —
     * standing in for any other route to it: the Staff screen, a direct
     * database edit, a future code path nobody has written yet. The challenge
     * therefore survives, and the check inside the verification is the only
     * thing standing in the way. This is the defence-in-depth half of the
     * previous test.
     */
    adminRow().status = 'SUSPENDED';

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_NOT_ELIGIBLE',
    });
    expect(store.sessions).toHaveLength(0);
    // And the now-unusable challenge is cleaned up rather than left dangling.
    expect(store.adminLoginChallenges).toHaveLength(0);
  });

  it('refuses an account whose admin role has been taken away', async () => {
    const { issued } = await halfWayIn();
    const row = adminRow();

    store.modelHasRoles = store.modelHasRoles.filter(
      (m) => String(m.modelId) !== String(row.id),
    );

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_NOT_ELIGIBLE',
    });
    expect(store.sessions).toHaveLength(0);
  });

  it('keeps only one challenge per account', async () => {
    const { adminId } = await halfWayIn();

    // A second sign-in from another browser supersedes the first, so a session
    // left open on a machine somebody walked away from cannot be finished with
    // a code issued for the one they are using now.
    await beginAdminVerification(adminId, { remember: false, ip: CONTEXT.ip, userAgent: 'other' });
    expect(store.adminLoginChallenges).toHaveLength(1);
  });

  it('goes to the dashboard once the password is no longer temporary', async () => {
    const { issued } = await halfWayIn();
    adminRow().mustChangePassword = false;

    const result = await verifyAdminAccessCode(issued.accessCode, CONTEXT);
    expect(result.redirectTo).toBe('/dashboard');
  });

  it('clears the cookie and the challenge when abandoned', async () => {
    await halfWayIn();
    await abandonAdminChallenge();

    expect(store.adminLoginChallenges).toHaveLength(0);
    expect(jar.cookies.get('tdms_admin_login')).toBeUndefined();
  });
});

describe('asking for a new code', () => {
  async function halfWayIn() {
    await createAdmin();
    const adminId = BigInt(String(adminRow().id));
    await beginAdminVerification(adminId, { remember: false, ip: CONTEXT.ip, userAgent: 'vitest' });
    return adminId;
  }

  it('issues no code — it only asks a human', async () => {
    await halfWayIn();
    const before = codeRows().length;

    const result = await requestNewAccessCode(CONTEXT);

    expect(result.notified).toBe(true);
    // THE property: an account that could mint its own second factor does not
    // have one.
    expect(codeRows()).toHaveLength(before);
    expect(store.auditLogs.some((a) => a.action === 'ADMIN_ACCESS_CODE_REQUESTED')).toBe(true);
  });

  it('notifies the Super Admin, with no code in the message', async () => {
    await halfWayIn();
    await requestNewAccessCode(CONTEXT);

    expect(mail.requests).toHaveLength(1);
    expect(mail.requests[0]!.to).toBe('owner@example.test');
    expect(mail.requests[0]!.adminEmail).toBe(DETAILS.email);
    expect(mail.codes).toHaveLength(0);
  });

  it('says so plainly when mail is not configured, rather than failing silently', async () => {
    mail.configured = false;
    await halfWayIn();

    const result = await requestNewAccessCode(CONTEXT);
    expect(result.notified).toBe(false);
    expect(result.detail).toContain('not configured');
  });

  it('is throttled', async () => {
    await halfWayIn();

    for (let i = 0; i < 3; i += 1) await requestNewAccessCode(CONTEXT);
    await expect(requestNewAccessCode(CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_REQUEST_THROTTLED',
    });
  });

  it('needs the challenge cookie', async () => {
    await halfWayIn();
    jar.cookies.clear();

    await expect(requestNewAccessCode(CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_LOGIN_EXPIRED',
    });
  });
});

describe('re-issuing a temporary password', () => {
  it('replaces the hash, re-arms the forced change, and revokes everything', async () => {
    const issued = await createAdmin();
    const adminId = BigInt(String(adminRow().id));
    const originalHash = adminRow().password;

    // A live session and a half-finished sign-in, both of which must go.
    await beginAdminVerification(adminId, { remember: false, ip: CONTEXT.ip, userAgent: 'vitest' });
    await verifyAdminAccessCode(issued.accessCode, CONTEXT);
    expect(store.sessions).toHaveLength(1);
    await beginAdminVerification(adminId, { remember: false, ip: CONTEXT.ip, userAgent: 'vitest' });

    const reissued = await resetAdminTemporaryPassword(
      actor,
      adminId,
      { securityCode: SECURITY_CODE },
      CONTEXT,
    );

    expect(reissued.temporaryPassword).not.toBe(issued.temporaryPassword);
    expect(adminRow().password).not.toBe(originalHash);
    expect(adminRow().mustChangePassword).toBe(true);
    expect(store.sessions).toHaveLength(0);
    expect(store.adminLoginChallenges).toHaveLength(0);

    expectNotStored(reissued.temporaryPassword);
    expect(dump(store.auditLogs)).not.toContain(reissued.temporaryPassword);
  });

  it('repairs an account left stranded by the old invitation flow', async () => {
    /*
     * An Admin invited under the previous scheme sits at PENDING with an
     * unusable placeholder password and an unconfirmed address. Handing it a
     * temporary password alone would not help — the sign-in check also requires
     * a confirmed address — so the person would have working credentials and
     * still be refused, with no button anywhere to fix it.
     */
    const stranded = await prisma.user.create({
      data: {
        name: 'Invited Admin',
        email: 'invited@example.test',
        password: 'placeholder-hash',
        status: 'PENDING',
        isActive: false,
        emailVerifiedAt: null,
        mustChangePassword: false,
      },
    });
    const adminRole = await prisma.role.findFirst({ where: { name: 'admin' } });
    await prisma.modelHasRole.create({
      data: { roleId: adminRole.id, modelType: 'App\\Models\\User', modelId: stranded.id },
    });

    const reissued = await resetAdminTemporaryPassword(
      actor,
      stranded.id,
      { securityCode: SECURITY_CODE },
      CONTEXT,
    );

    const row = store.users.find((u) => u.email === 'invited@example.test')!;
    expect(reissued.activated).toBe(true);
    expect(row.status).toBe('ACTIVE');
    expect(row.isActive).toBe(true);
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
    expect(row.mustChangePassword).toBe(true);

    const entry = store.auditLogs.find((a) => a.action === 'ADMIN_TEMP_PASSWORD_RESET')!;
    const details = entry.details as Record<string, unknown>;
    expect(details.from_status).toBe('PENDING');
    expect(details.promoted_from_pending).toBe(true);
    // The trail does not claim the holder proved anything.
    expect(details.email_confirmation).toBe('administrative');
  });

  /** A leftover invitation: admin role, unconfirmed address, placeholder password. */
  async function strandedAdmin(status = 'PENDING') {
    const row = await prisma.user.create({
      data: {
        name: 'Invited Admin',
        email: 'invited2@example.test',
        password: 'placeholder-hash',
        status,
        isActive: status === 'ACTIVE',
        emailVerifiedAt: null,
        mustChangePassword: false,
      },
    });
    const adminRole = await prisma.role.findFirst({ where: { name: 'admin' } });
    await prisma.modelHasRole.create({
      data: { roleId: adminRole.id, modelType: 'App\\Models\\User', modelId: row.id },
    });
    return row;
  }

  it('refuses to "reactivate" an account that has never been set up', async () => {
    /*
     * The bug this guards: Reactivate on a leftover invitation set it ACTIVE
     * while its address stayed unconfirmed and its password stayed a
     * placeholder. The badge said Active; nobody could sign in.
     */
    const stranded = await strandedAdmin('PENDING');

    await expect(
      setAdminAccountStatus(actor, stranded.id, 'ACTIVE', CONTEXT),
    ).rejects.toMatchObject({ code: 'ADMIN_NOT_SET_UP' });

    expect(store.users.find((u) => u.email === 'invited2@example.test')!.status).toBe('PENDING');
  });

  it('refuses a code for an account that has never been set up', async () => {
    const stranded = await strandedAdmin('PENDING');
    await expect(
      generateAdminAccessCode(
        actor,
        stranded.id,
        { securityCode: SECURITY_CODE, emailAccessCode: false },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_NOT_SET_UP' });
    expect(codeRows()).toHaveLength(0);
  });

  it('repairs an account already wrongly marked ACTIVE before the fix', async () => {
    // Exactly the state the live database was left in.
    const stranded = await strandedAdmin('ACTIVE');

    const reissued = await resetAdminTemporaryPassword(
      actor,
      stranded.id,
      { securityCode: SECURITY_CODE },
      CONTEXT,
    );

    const row = store.users.find((u) => u.email === 'invited2@example.test')!;
    expect(reissued.activated).toBe(true);
    expect(row.status).toBe('ACTIVE');
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
    expect(row.mustChangePassword).toBe(true);

    // And now a code can be issued, completing the set-up.
    await expect(
      generateAdminAccessCode(
        actor,
        stranded.id,
        { securityCode: SECURITY_CODE, emailAccessCode: false },
        CONTEXT,
      ),
    ).resolves.toMatchObject({ accessCode: expect.stringMatching(/^[0-9]{6}$/) });
  });

  it('reports a never-set-up account as such in the listing', async () => {
    await strandedAdmin('ACTIVE');
    const listed = await listAdminAccounts(1);
    const row = listed.rows.find((r) => r.email === 'invited2@example.test')!;
    expect(row.setUp).toBe(false);
  });

  it('does not quietly reactivate a SUSPENDED account', async () => {
    /*
     * Suspension is a deliberate administrative decision, and reissuing a
     * password must not undo one. Reactivating is its own action with its own
     * audit entry.
     */
    await createAdmin();
    const adminId = BigInt(String(adminRow().id));
    await setAdminAccountStatus(actor, adminId, 'SUSPENDED', CONTEXT);

    const reissued = await resetAdminTemporaryPassword(
      actor,
      adminId,
      { securityCode: SECURITY_CODE },
      CONTEXT,
    );

    expect(reissued.activated).toBe(false);
    expect(adminRow().status).toBe('SUSPENDED');
  });

  it('needs the security code', async () => {
    await createAdmin();
    const adminId = BigInt(String(adminRow().id));
    const before = adminRow().password;

    await expect(
      resetAdminTemporaryPassword(actor, adminId, { securityCode: 'wrong' }, CONTEXT),
    ).rejects.toMatchObject({ code: 'SECURITY_CODE_REJECTED' });

    expect(adminRow().password).toBe(before);
  });
});

describe('suspending and reactivating', () => {
  it('cancels unused codes and live sessions when suspending', async () => {
    const issued = await createAdmin();
    const adminId = BigInt(String(adminRow().id));

    await beginAdminVerification(adminId, { remember: false, ip: CONTEXT.ip, userAgent: 'vitest' });
    await verifyAdminAccessCode(issued.accessCode, CONTEXT);

    await generateAdminAccessCode(
      actor,
      adminId,
      { securityCode: SECURITY_CODE, emailAccessCode: false },
      CONTEXT,
    );

    await setAdminAccountStatus(actor, adminId, 'SUSPENDED', CONTEXT);

    expect(adminRow().status).toBe('SUSPENDED');
    expect(adminRow().isActive).toBe(false);
    expect(store.sessions).toHaveLength(0);
    // An unspent code would be a way back in.
    expect(codeRows().filter((c) => c.usedAt === null && c.invalidatedAt === null)).toHaveLength(0);
    expect(store.auditLogs.some((a) => a.action === 'ADMIN_SUSPENDED')).toBe(true);
  });

  it('reactivates without handing back a code', async () => {
    await createAdmin();
    const adminId = BigInt(String(adminRow().id));

    await setAdminAccountStatus(actor, adminId, 'SUSPENDED', CONTEXT);
    await setAdminAccountStatus(actor, adminId, 'ACTIVE', CONTEXT);

    expect(adminRow().status).toBe('ACTIVE');
    // Reactivating restores the account, not a credential.
    expect(codeRows().filter((c) => c.usedAt === null && c.invalidatedAt === null)).toHaveLength(0);
    expect(store.auditLogs.some((a) => a.action === 'ADMIN_REACTIVATED')).toBe(true);
  });

  it('refuses to let a Super Admin suspend their own account', async () => {
    /*
     * Re-asserted in the service as well as in the policy, because the
     * Gate::before Super Admin grant would otherwise let them lock the
     * institution out of its own system.
     */
    const ownerId = BigInt(actor.id);
    await expect(
      setAdminAccountStatus(actor, ownerId, 'SUSPENDED', CONTEXT),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('will not manage an account that is not an administrator', async () => {
    const outsider = await prisma.user.create({
      data: {
        name: 'Secretary',
        email: 'sec@example.test',
        password: 'x',
        status: 'ACTIVE',
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

    await expect(
      setAdminAccountStatus(actor, outsider.id, 'SUSPENDED', CONTEXT),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      generateAdminAccessCode(
        actor,
        outsider.id,
        { securityCode: SECURITY_CODE, emailAccessCode: false },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});
