import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AuthUser } from '@/types/domain';

/**
 * The Super Admin-controlled administrator workflow, end to end, against an
 * in-memory database (src/test/fake-prisma.ts).
 *
 *   Admin Accounts   create an Admin (temporary password, no code)
 *   Access Codes     generate a one-time code for them; list, view, revoke
 *   Admin            email + password → code → new password → in
 *
 * THE INVARIANTS
 *
 *   1. A CORRECT PASSWORD ALONE NEVER PRODUCES A SESSION for an Admin. Every
 *      failure path is checked for "and no session was created" as well as
 *      for its own behaviour.
 *   2. A CODE WORKS EXACTLY ONCE, FOR EXACTLY ONE ADMIN. Used, expired,
 *      revoked, superseded, out of attempts, or issued to somebody else — all
 *      refused.
 *   3. NO CREDENTIAL IS STORED IN PLAINTEXT. The whole store, audit log
 *      included, is searched for every password and code issued.
 *   4. NOTHING HERE ASKS FOR THE STATIC SUPER ADMIN SECURITY CODE. The signed-in
 *      dashboard is the trust boundary.
 */

const env = vi.hoisted(() => {
  process.env.BCRYPT_ROUNDS = '4';
  process.env.ADMIN_ACCESS_CODE_EXPIRATION_MINUTES = '10';
  process.env.ADMIN_ACCESS_CODE_MAX_ATTEMPTS = '5';
  process.env.ADMIN_LOGIN_CHALLENGE_TTL_MINUTES = '15';
  delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  // Deliberately NOT set: nothing in this workflow may depend on it.
  delete process.env.SUPER_ADMIN_STATIC_CODE;
  // The reveal key: 32 random-looking bytes, base64. Test-only.
  process.env.TEMP_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString('base64');
  delete process.env.TEMP_CREDENTIAL_REVEAL_HOURS;
  return {};
});
void env;

const fake = vi.hoisted(async () => {
  const { createFakePrisma } = await import('./../../test/fake-prisma');
  return createFakePrisma();
});

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
  revokeAdminAccessCode,
  resetAdminTemporaryPassword,
  setAdminAccountStatus,
  listAdminAccounts,
  listAccessCodes,
  getAccessCode,
  listIssuableAdmins,
  adminAccessOverview,
  getAdminCredentials,
  revealTemporaryPassword,
} = await import('./admin-account-service');

const { updatePassword } = await import('./profile-service');

const {
  beginAdminVerification,
  verifyAdminAccessCode,
  describeAdminChallenge,
  requestNewAccessCode,
  abandonAdminChallenge,
} = await import('./admin-login-service');

const { prisma, store, reset } = await fake;

const CONTEXT = { ip: '203.0.113.10', userAgent: 'vitest' };
const TEMP_PASSWORD = 'Institution#2026x';
const USER_MODEL = 'App\\Models\\User';

const JAMES = { name: 'James Tan', email: 'jctan.student@gmail.com', temporaryPassword: TEMP_PASSWORD };
const MARIA = { name: 'Maria Santos', email: 'maria@gmail.com', temporaryPassword: 'Another#Pass2026x' };

function dump(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

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
    data: { roleId: superRole.id, modelType: USER_MODEL, modelId: owner.id },
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

// --- helpers ---------------------------------------------------------------

function rowFor(email: string) {
  return store.users.find((u) => u.email === email)!;
}

function idOf(email: string): bigint {
  return BigInt(String(rowFor(email).id));
}

async function createAdmin(details = JAMES) {
  return createAdminAccount(actor, details, CONTEXT);
}

async function issueCode(email = JAMES.email, options: { expiresInMinutes?: number; emailAccessCode?: boolean } = {}) {
  return generateAdminAccessCode(
    actor,
    idOf(email),
    { expiresInMinutes: options.expiresInMinutes, emailAccessCode: options.emailAccessCode ?? false },
    CONTEXT,
  );
}

/** Step one of a sign-in: what a correct password does for an Admin. */
async function passwordStep(email = JAMES.email, remember = false) {
  await beginAdminVerification(idOf(email), { remember, ip: CONTEXT.ip, userAgent: 'vitest' });
}

function codeRow(codeId: string) {
  return store.adminAccessCodes.find((c) => String(c.id) === codeId)!;
}

/** A leftover invitation: admin role, unconfirmed address, placeholder password. */
async function strandedAdmin(status = 'PENDING') {
  const row = await prisma.user.create({
    data: {
      name: 'Invited Admin',
      email: 'invited@example.test',
      password: 'placeholder-hash',
      status,
      isActive: status === 'ACTIVE',
      emailVerifiedAt: null,
      mustChangePassword: false,
    },
  });
  const adminRole = await prisma.role.findFirst({ where: { name: 'admin' } });
  await prisma.modelHasRole.create({
    data: { roleId: adminRole.id, modelType: USER_MODEL, modelId: row.id },
  });
  return row;
}

// ---------------------------------------------------------------------------

describe('no step asks for the static Super Admin security code', () => {
  it('creates, issues, resets, revokes and suspends with the variable unset', async () => {
    expect(process.env.SUPER_ADMIN_STATIC_CODE).toBeUndefined();

    await createAdmin();
    const issued = await issueCode();
    await revokeAdminAccessCode(actor, BigInt(issued.codeId), CONTEXT);
    await resetAdminTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);
    await setAdminAccountStatus(actor, idOf(JAMES.email), 'SUSPENDED', CONTEXT);
    await setAdminAccountStatus(actor, idOf(JAMES.email), 'ACTIVE', CONTEXT);

    expect(store.auditLogs.some((a) => a.action === 'SUPER_ADMIN_SECURITY_CODE_REJECTED')).toBe(false);
  });

  it('reports only whether the static code is configured, never a value', async () => {
    process.env.SUPER_ADMIN_STATIC_CODE = 'root-secret-value-xyz';
    try {
      const overview = await adminAccessOverview();
      expect(overview.securityCodeConfigured).toBe(true);
      expect(dump(overview)).not.toContain('root-secret-value-xyz');
    } finally {
      delete process.env.SUPER_ADMIN_STATIC_CODE;
    }
    expect((await adminAccessOverview()).securityCodeConfigured).toBe(false);
  });
});

describe('creating an Admin', () => {
  it('creates an ACTIVE account — never PENDING — on a temporary password', async () => {
    await createAdmin();
    const row = rowFor(JAMES.email);

    expect(row.status).toBe('ACTIVE');
    expect(row.isActive).toBe(true);
    expect(row.mustChangePassword).toBe(true);
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('assigns the admin role and nothing else', async () => {
    await createAdmin();
    const assignments = store.modelHasRoles.filter((m) => String(m.modelId) === String(rowFor(JAMES.email).id));
    expect(assignments).toHaveLength(1);
    const adminRole = store.roles.find((r) => r.name === 'admin')!;
    expect(String(assignments[0]!.roleId)).toBe(String(adminRole.id));
  });

  it('issues NO access code — that is its own step on Access Codes', async () => {
    const created = await createAdmin();
    expect(store.adminAccessCodes).toHaveLength(0);
    expect(created).not.toHaveProperty('accessCode');
  });

  it('returns the temporary password once and stores only its hash', async () => {
    const created = await createAdmin();
    expect(created.temporaryPassword).toBe(TEMP_PASSWORD);
    expectNotStored(TEMP_PASSWORD);
    expect(String(rowFor(JAMES.email).password).startsWith('$2')).toBe(true);
  });

  it('records the creation without the password', async () => {
    await createAdmin();
    const entry = store.auditLogs.find((a) => a.action === 'ADMIN_CREATED')!;
    expect((entry.details as Record<string, unknown>).email_confirmation).toBe('administrative');
    expect(dump(store.auditLogs)).not.toContain(TEMP_PASSWORD);
  });

  it('accepts ordinary email domains during development', async () => {
    await createAdmin({ ...JAMES, email: 'someone@yahoo.com' });
    expect(rowFor('someone@yahoo.com').status).toBe('ACTIVE');
  });

  it('refuses a second account on the same address', async () => {
    await createAdmin();
    await expect(createAdmin()).rejects.toMatchObject({ status: 422 });
  });
});

describe('generating an access code', () => {
  it('issues a six-digit code bound to one Admin, stored only as a hash', async () => {
    await createAdmin();
    const issued = await issueCode();

    expect(issued.accessCode).toMatch(/^[0-9]{6}$/);
    expect(issued.status).toBe('ACTIVE');
    expect(issued.name).toBe(JAMES.name);

    const row = codeRow(issued.codeId);
    expect(String(row.adminUserId)).toBe(String(rowFor(JAMES.email).id));
    expect(String(row.codeHash).startsWith('$2')).toBe(true);
    expectNotStored(issued.accessCode);
  });

  it('defaults to ten minutes and honours a chosen expiry', async () => {
    await createAdmin();
    const byDefault = await issueCode();
    expect(byDefault.expiresInMinutes).toBe(10);
    expect(byDefault.accessCodeExpiresInSeconds).toBeGreaterThan(590);

    const chosen = await issueCode(JAMES.email, { expiresInMinutes: 30 });
    expect(chosen.expiresInMinutes).toBe(30);
    expect(chosen.accessCodeExpiresInSeconds).toBeGreaterThan(1790);
  });

  it('will not mint a code longer than the offered options', async () => {
    await createAdmin();
    const sneaky = await issueCode(JAMES.email, { expiresInMinutes: 59 });
    // 59 is not an option, so it falls back to the default rather than being trusted.
    expect(sneaky.expiresInMinutes).toBe(10);
  });

  it('revokes the previous unused code so only the newest works', async () => {
    await createAdmin();
    const first = await issueCode();
    const second = await issueCode();

    expect(second.previousCodesRevoked).toBe(1);
    const old = codeRow(first.codeId);
    expect(old.revokedAt).toBeInstanceOf(Date);
    expect(old.revokedReason).toBe('superseded');
    expect(old.codeHash).toBe('');

    const live = store.adminAccessCodes.filter((c) => c.usedAt === null && c.revokedAt === null);
    expect(live).toHaveLength(1);
    expect(String(live[0]!.id)).toBe(second.codeId);
  });

  it('records the generation without the code', async () => {
    await createAdmin();
    const issued = await issueCode();
    const entry = store.auditLogs.find((a) => a.action === 'ACCESS_CODE_GENERATED')!;
    expect((entry.details as Record<string, unknown>).code_id).toBe(issued.codeId);
    expect(dump(store.auditLogs)).not.toContain(issued.accessCode);
  });

  it('emails only the code, and only when asked', async () => {
    await createAdmin();
    await issueCode();
    expect(mail.codes).toHaveLength(0);

    const emailed = await issueCode(JAMES.email, { emailAccessCode: true });
    expect(mail.codes).toHaveLength(1);
    expect(mail.codes[0]!.code).toBe(emailed.accessCode);
    expect(dump(mail.codes)).not.toContain(TEMP_PASSWORD);
  });

  it('refuses a suspended Admin', async () => {
    await createAdmin();
    await setAdminAccountStatus(actor, idOf(JAMES.email), 'SUSPENDED', CONTEXT);
    await expect(issueCode()).rejects.toMatchObject({ code: 'ADMIN_SUSPENDED' });
  });

  it('refuses an account that has never been set up', async () => {
    const stranded = await strandedAdmin();
    await expect(
      generateAdminAccessCode(actor, stranded.id, { emailAccessCode: false }, CONTEXT),
    ).rejects.toMatchObject({ code: 'ADMIN_NOT_SET_UP' });
    expect(store.adminAccessCodes).toHaveLength(0);
  });

  it('refuses an account that is not an Admin', async () => {
    const ownerId = BigInt(actor.id);
    await expect(
      generateAdminAccessCode(actor, ownerId, { emailAccessCode: false }, CONTEXT),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('offers only Admins who can actually be issued a code', async () => {
    await createAdmin();
    await strandedAdmin();
    const admins = await listIssuableAdmins();

    expect(admins.find((a) => a.email === JAMES.email)!.blockedReason).toBeNull();
    expect(admins.find((a) => a.email === 'invited@example.test')!.blockedReason).toMatch(/not set up/i);
    // The Super Admin is never offered.
    expect(admins.some((a) => a.email === 'owner@example.test')).toBe(false);
  });
});

describe('listing, viewing and revoking codes', () => {
  it('lists every code with its Admin and status — never the code', async () => {
    await createAdmin();
    const issued = await issueCode();
    const listed = await listAccessCodes(1);

    expect(listed.rows).toHaveLength(1);
    const row = listed.rows[0]!;
    expect(row.adminName).toBe(JAMES.name);
    expect(row.adminEmail).toBe(JAMES.email);
    expect(row.status).toBe('ACTIVE');
    expect(row.expiresInSeconds).toBeGreaterThan(0);
    expect(row.createdBy).toBe('Owner');

    expect(dump(listed)).not.toContain(issued.accessCode);
    expect(dump(listed)).not.toContain(String(codeRow(issued.codeId).codeHash));
  });

  it('shows ACTIVE, USED, EXPIRED and REVOKED', async () => {
    await createAdmin();
    await createAdmin(MARIA);

    const used = await issueCode();
    await passwordStep();
    await verifyAdminAccessCode(used.accessCode, CONTEXT);

    const expired = await issueCode(MARIA.email);
    codeRow(expired.codeId).expiresAt = new Date(Date.now() - 1000);

    const revoked = await issueCode(JAMES.email);
    await revokeAdminAccessCode(actor, BigInt(revoked.codeId), CONTEXT);

    // A new code for Maria must not rewrite her expired one's history.
    const active = await issueCode(MARIA.email);

    const statuses = Object.fromEntries(
      (await listAccessCodes(1)).rows.map((r) => [r.id, r.status]),
    );
    expect(statuses[used.codeId]).toBe('USED');
    expect(statuses[expired.codeId]).toBe('EXPIRED');
    expect(statuses[revoked.codeId]).toBe('REVOKED');
    expect(statuses[active.codeId]).toBe('ACTIVE');
    expect(active.previousCodesRevoked).toBe(0);
  });

  it('shows an unrevoked, expired code as EXPIRED', async () => {
    await createAdmin();
    const issued = await issueCode();
    codeRow(issued.codeId).expiresAt = new Date(Date.now() - 1000);
    expect((await getAccessCode(BigInt(issued.codeId)))!.status).toBe('EXPIRED');
  });

  it('views one code with its history', async () => {
    await createAdmin();
    const issued = await issueCode();
    await revokeAdminAccessCode(actor, BigInt(issued.codeId), CONTEXT);

    const viewed = (await getAccessCode(BigInt(issued.codeId)))!;
    expect(viewed.status).toBe('REVOKED');
    expect(viewed.revokedReason).toBe('revoked');
    expect(viewed.revokedBy).toBe('Owner');
    expect(dump(viewed)).not.toContain(issued.accessCode);
  });

  it('revokes an active code so it no longer signs anybody in', async () => {
    await createAdmin();
    const issued = await issueCode();
    await revokeAdminAccessCode(actor, BigInt(issued.codeId), CONTEXT);

    expect(store.auditLogs.some((a) => a.action === 'ACCESS_CODE_REVOKED')).toBe(true);

    await passwordStep();
    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_UNUSABLE',
    });
    expect(store.sessions).toHaveLength(0);
  });

  it('will not "revoke" a code that is already used', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep();
    await verifyAdminAccessCode(issued.accessCode, CONTEXT);

    await expect(revokeAdminAccessCode(actor, BigInt(issued.codeId), CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_NOT_ACTIVE',
    });
    // Its history stays true: it was used.
    expect((await getAccessCode(BigInt(issued.codeId)))!.status).toBe('USED');
  });

  it('counts codes for the dashboard card', async () => {
    await createAdmin();
    await createAdmin(MARIA);
    await issueCode();
    const expiring = await issueCode(MARIA.email);
    codeRow(expiring.codeId).expiresAt = new Date(Date.now() - 1000);

    const overview = await adminAccessOverview();
    expect(overview.activeAdmins).toBe(2);
    expect(overview.activeCodes).toBe(1);
    expect(overview.expiredCodes).toBe(1);
  });
});

describe('the Admin sign-in', () => {
  it('creates no session when only the password has been accepted', async () => {
    await createAdmin();
    await issueCode();
    await passwordStep();

    expect(store.sessions).toHaveLength(0);
    expect(store.adminLoginChallenges).toHaveLength(1);
    const handle = jar.cookies.get('tdms_admin_login')!;
    expect(handle).toMatch(/^[0-9a-f]{64}$/);
    expectNotStored(handle);
  });

  it('shows the screen a countdown, and nothing secret', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep();
    const state = (await describeAdminChallenge())!;

    expect(state.email).toBe(JAMES.email);
    expect(state.codeExpiresInSeconds).toBeGreaterThan(0);
    expect(dump(state)).not.toContain(issued.accessCode);
  });

  it('accepts the code, marks it USED, and signs the Admin in', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep();

    const result = await verifyAdminAccessCode(issued.accessCode, CONTEXT);

    expect(result.redirectTo).toBe('/change-password');
    expect(store.sessions).toHaveLength(1);
    expect(codeRow(issued.codeId).usedAt).toBeInstanceOf(Date);
    expect((await getAccessCode(BigInt(issued.codeId)))!.status).toBe('USED');
    expect(store.auditLogs.some((a) => a.action === 'ACCESS_CODE_USED')).toBe(true);
    expect(store.auditLogs.some((a) => a.action === 'ADMIN_LOGIN_SUCCESS')).toBe(true);
  });

  it('never accepts the same code twice', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep();
    await verifyAdminAccessCode(issued.accessCode, CONTEXT);

    await passwordStep();
    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_UNUSABLE',
    });
    expect(store.sessions).toHaveLength(1);
  });

  it("will not let one Admin's code sign in another Admin", async () => {
    /*
     * The code is looked up by the id of the account that passed the password
     * step, never by the digits. James's code, typed by Maria, is measured
     * against Maria's code — and she has none.
     */
    await createAdmin();
    await createAdmin(MARIA);
    const jamesCode = await issueCode(JAMES.email);

    await passwordStep(MARIA.email);
    await expect(verifyAdminAccessCode(jamesCode.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'NO_ACCESS_CODE',
    });

    // Even when Maria has a code of her own, James's does not match it.
    const mariaCode = await issueCode(MARIA.email);
    if (mariaCode.accessCode !== jamesCode.accessCode) {
      await expect(verifyAdminAccessCode(jamesCode.accessCode, CONTEXT)).rejects.toMatchObject({
        code: 'ACCESS_CODE_INCORRECT',
      });
    }
    expect(store.sessions).toHaveLength(0);

    // And James's code is untouched, still good for James.
    expect(codeRow(jamesCode.codeId).usedAt).toBeNull();
    await passwordStep(JAMES.email);
    await expect(verifyAdminAccessCode(jamesCode.accessCode, CONTEXT)).resolves.toBeDefined();
  });

  it('refuses an expired code', async () => {
    await createAdmin();
    const issued = await issueCode();
    codeRow(issued.codeId).expiresAt = new Date(Date.now() - 1000);
    await passwordStep();

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_UNUSABLE',
    });
    expect(store.sessions).toHaveLength(0);
    expect(store.auditLogs.some((a) => a.action === 'ACCESS_CODE_EXPIRED')).toBe(true);
  });

  it('refuses a superseded code as simply wrong, costing an attempt', async () => {
    await createAdmin();
    const first = await issueCode();
    await issueCode();
    await passwordStep();

    // Its hash was emptied, so it cannot even be recognised — let alone accepted.
    await expect(verifyAdminAccessCode(first.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_INCORRECT',
    });
    expect(store.sessions).toHaveLength(0);
  });

  it('revokes the code after five wrong guesses, and then the right one fails too', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep();
    const wrong = issued.accessCode === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      await expect(verifyAdminAccessCode(wrong, CONTEXT)).rejects.toThrow();
    }

    const row = codeRow(issued.codeId);
    expect(row.revokedAt).toBeInstanceOf(Date);
    expect(row.revokedReason).toBe('attempts_exhausted');
    expect((await getAccessCode(BigInt(issued.codeId)))!.status).toBe('REVOKED');

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_UNUSABLE',
    });
    expect(store.sessions).toHaveLength(0);
  });

  it('does not spend an attempt on a malformed submission', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep();

    for (const malformed of ['', '12345', '1234567', 'abcdef']) {
      await expect(verifyAdminAccessCode(malformed, CONTEXT)).rejects.toMatchObject({
        code: 'ACCESS_CODE_MALFORMED',
      });
    }
    expect(codeRow(issued.codeId).attemptCount).toBe(0);
  });

  it('refuses without the challenge cookie', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep();
    jar.cookies.clear();

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_LOGIN_EXPIRED',
    });
    expect(codeRow(issued.codeId).attemptCount).toBe(0);
  });

  it('refuses a suspended Admin even with the right password and code', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep();

    // Suspended by some other route, so the challenge survives and the check
    // inside verification is the only thing in the way.
    rowFor(JAMES.email).status = 'SUSPENDED';

    await expect(verifyAdminAccessCode(issued.accessCode, CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_NOT_ELIGIBLE',
    });
    expect(store.sessions).toHaveLength(0);
  });

  it('carries Remember me across the two steps', async () => {
    await createAdmin();
    const issued = await issueCode();
    await passwordStep(JAMES.email, true);
    await verifyAdminAccessCode(issued.accessCode, CONTEXT);

    const expires = store.sessions[0]!.expiresAt as Date;
    expect(expires.getTime() - Date.now()).toBeGreaterThan(365 * 24 * 3600 * 1000);
  });

  it('goes to the dashboard once the password is permanent', async () => {
    await createAdmin();
    const issued = await issueCode();
    rowFor(JAMES.email).mustChangePassword = false;
    await passwordStep();
    expect((await verifyAdminAccessCode(issued.accessCode, CONTEXT)).redirectTo).toBe('/dashboard');
  });

  it('clears everything when abandoned', async () => {
    await createAdmin();
    await passwordStep();
    await abandonAdminChallenge();
    expect(store.adminLoginChallenges).toHaveLength(0);
    expect(jar.cookies.get('tdms_admin_login')).toBeUndefined();
  });
});

describe('asking for a new code', () => {
  it('notifies the Super Admin and issues nothing', async () => {
    await createAdmin();
    await passwordStep();
    const result = await requestNewAccessCode(CONTEXT);

    expect(result.notified).toBe(true);
    expect(store.adminAccessCodes).toHaveLength(0);
    expect(mail.requests[0]!.to).toBe('owner@example.test');
  });

  it('is throttled', async () => {
    await createAdmin();
    await passwordStep();
    for (let i = 0; i < 3; i += 1) await requestNewAccessCode(CONTEXT);
    await expect(requestNewAccessCode(CONTEXT)).rejects.toMatchObject({
      code: 'ACCESS_CODE_REQUEST_THROTTLED',
    });
  });
});

describe('resetting a temporary password', () => {
  it('asks for no security code and returns the new password once', async () => {
    await createAdmin();
    const reissued = await resetAdminTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);

    expect(reissued.temporaryPassword).not.toBe(TEMP_PASSWORD);
    expect(rowFor(JAMES.email).mustChangePassword).toBe(true);
    expectNotStored(reissued.temporaryPassword);
    expect(store.auditLogs.some((a) => a.action === 'TEMP_PASSWORD_RESET')).toBe(true);
    expect(dump(store.auditLogs)).not.toContain(reissued.temporaryPassword);
  });

  it('ends sessions, drops half-finished sign-ins and revokes unused codes', async () => {
    await createAdmin();
    const used = await issueCode();
    await passwordStep();
    await verifyAdminAccessCode(used.accessCode, CONTEXT);
    const pending = await issueCode();
    await passwordStep();

    const reissued = await resetAdminTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);

    expect(store.sessions).toHaveLength(0);
    expect(store.adminLoginChallenges).toHaveLength(0);
    expect(reissued.codesRevoked).toBe(1);
    expect(codeRow(pending.codeId).revokedReason).toBe('password_reset');
    // The used code keeps its history.
    expect(codeRow(used.codeId).revokedAt).toBeNull();
  });

  it('sets up an account left over from the old invitation flow', async () => {
    const stranded = await strandedAdmin('ACTIVE');
    const reissued = await resetAdminTemporaryPassword(actor, stranded.id, CONTEXT);

    const row = rowFor('invited@example.test');
    expect(reissued.activated).toBe(true);
    expect(row.status).toBe('ACTIVE');
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);

    // Now a code can be issued, completing the set-up.
    await expect(
      generateAdminAccessCode(actor, stranded.id, { emailAccessCode: false }, CONTEXT),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('does not quietly reactivate a SUSPENDED account', async () => {
    await createAdmin();
    await setAdminAccountStatus(actor, idOf(JAMES.email), 'SUSPENDED', CONTEXT);
    const reissued = await resetAdminTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);
    expect(reissued.activated).toBe(false);
    expect(rowFor(JAMES.email).status).toBe('SUSPENDED');
  });
});

describe('suspending and reactivating', () => {
  it('suspending ends sessions and revokes unused codes', async () => {
    await createAdmin();
    const used = await issueCode();
    await passwordStep();
    await verifyAdminAccessCode(used.accessCode, CONTEXT);
    const pending = await issueCode();

    await setAdminAccountStatus(actor, idOf(JAMES.email), 'SUSPENDED', CONTEXT);

    expect(rowFor(JAMES.email).status).toBe('SUSPENDED');
    expect(store.sessions).toHaveLength(0);
    expect(codeRow(pending.codeId).revokedReason).toBe('account_suspended');
  });

  it('refuses to "reactivate" an account that has never been set up', async () => {
    const stranded = await strandedAdmin('PENDING');
    await expect(setAdminAccountStatus(actor, stranded.id, 'ACTIVE', CONTEXT)).rejects.toMatchObject({
      code: 'ADMIN_NOT_SET_UP',
    });
  });

  it('lists a never-set-up account as such', async () => {
    await strandedAdmin('ACTIVE');
    const listed = await listAdminAccounts(1);
    expect(listed.rows.find((r) => r.email === 'invited@example.test')!.setUp).toBe(false);
  });

  it('refuses to act on the Super Admin themselves', async () => {
    await expect(
      setAdminAccountStatus(actor, BigInt(actor.id), 'SUSPENDED', CONTEXT),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('revealing a temporary password', () => {
  const NEW_OWN_PASSWORD = 'MyOwn#Password2026z';

  it('shows the temporary password again, from a sealed copy, never plaintext', async () => {
    const created = await createAdmin();
    expect(created.revealable).toBe(true);

    // Stored: a ciphertext, not the password.
    expect(store.temporaryCredentials).toHaveLength(1);
    expect(String(store.temporaryCredentials[0]!.sealed).startsWith('v1.')).toBe(true);
    expectNotStored(TEMP_PASSWORD);

    const revealed = await revealTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);
    expect(revealed.temporaryPassword).toBe(TEMP_PASSWORD);
  });

  it('audits every reveal, without the password', async () => {
    await createAdmin();
    await revealTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);
    await revealTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);

    expect(store.auditLogs.filter((a) => a.action === 'TEMP_PASSWORD_REVEALED')).toHaveLength(2);
    expect(store.auditLogs.some((a) => a.action === 'TEMP_PASSWORD_GENERATED')).toBe(true);
    expect(dump(store.auditLogs)).not.toContain(TEMP_PASSWORD);
    expect(dump(store.auditLogs)).not.toContain(String(store.temporaryCredentials[0]!.sealed));
  });

  it('reports the state without the password', async () => {
    await createAdmin();
    const creds = await getAdminCredentials(idOf(JAMES.email));

    expect(creds.temporaryPassword.state).toBe('available');
    expect(dump(creds)).not.toContain(TEMP_PASSWORD);
    expect(dump(creds)).not.toContain(String(store.temporaryCredentials[0]!.sealed));
  });

  it('is gone for good once the Admin chooses their own password', async () => {
    await createAdmin();
    await updatePassword(idOf(JAMES.email), {
      currentPassword: TEMP_PASSWORD,
      password: NEW_OWN_PASSWORD,
    });

    const row = store.temporaryCredentials[0]!;
    expect(row.usedAt).toBeInstanceOf(Date);
    expect(row.sealed).toBe('');

    const creds = await getAdminCredentials(idOf(JAMES.email));
    expect(creds.temporaryPassword.state).toBe('none');
    await expect(revealTemporaryPassword(actor, idOf(JAMES.email), CONTEXT)).rejects.toMatchObject({
      code: 'NO_TEMPORARY_PASSWORD',
    });

    // The permanent password is not recoverable from anything stored.
    expectNotStored(NEW_OWN_PASSWORD);
  });

  it('a reset replaces it: the old one can never be shown again, the new one can', async () => {
    await createAdmin();
    const reissued = await resetAdminTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);

    expect(reissued.revealable).toBe(true);
    const [old, current] = store.temporaryCredentials;
    expect(old!.revokedReason).toBe('reset');
    expect(old!.sealed).toBe('');
    expect(current!.sealed).not.toBe('');

    const revealed = await revealTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);
    expect(revealed.temporaryPassword).toBe(reissued.temporaryPassword);
    expect(revealed.temporaryPassword).not.toBe(TEMP_PASSWORD);
    expectNotStored(TEMP_PASSWORD);
    expectNotStored(reissued.temporaryPassword);
  });

  it('can reveal again after a password was replaced by a reset of a set-up admin', async () => {
    await createAdmin();
    await updatePassword(idOf(JAMES.email), { currentPassword: TEMP_PASSWORD, password: NEW_OWN_PASSWORD });
    expect((await getAdminCredentials(idOf(JAMES.email))).temporaryPassword.state).toBe('none');

    const reissued = await resetAdminTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);
    const revealed = await revealTemporaryPassword(actor, idOf(JAMES.email), CONTEXT);
    expect(revealed.temporaryPassword).toBe(reissued.temporaryPassword);
  });

  it('stops revealing once the window passes, while the password keeps working', async () => {
    await createAdmin();
    store.temporaryCredentials[0]!.expiresAt = new Date(Date.now() - 1000);

    const creds = await getAdminCredentials(idOf(JAMES.email));
    expect(creds.temporaryPassword).toMatchObject({ state: 'unavailable', reason: 'expired' });
    await expect(revealTemporaryPassword(actor, idOf(JAMES.email), CONTEXT)).rejects.toMatchObject({
      code: 'TEMPORARY_PASSWORD_UNAVAILABLE',
    });
    // Still temporary, still required to change.
    expect(rowFor(JAMES.email).mustChangePassword).toBe(true);
  });

  it('says so honestly when revealing is not configured', async () => {
    const key = process.env.TEMP_CREDENTIAL_KEY;
    delete process.env.TEMP_CREDENTIAL_KEY;
    try {
      const created = await createAdmin();
      // The account is still created; only the revealable copy is skipped.
      expect(created.revealable).toBe(false);
      expect(store.temporaryCredentials).toHaveLength(0);

      const creds = await getAdminCredentials(idOf(JAMES.email));
      expect(creds.temporaryPassword).toMatchObject({ state: 'unavailable', reason: 'not_recorded' });
    } finally {
      process.env.TEMP_CREDENTIAL_KEY = key;
    }
  });

  it('treats an account created before revealing existed as not revealable', async () => {
    const stranded = await strandedAdmin('ACTIVE');
    // A temporary password is in force but no sealed copy was ever kept.
    rowFor('invited@example.test').mustChangePassword = true;
    const creds = await getAdminCredentials(stranded.id);
    expect(creds.temporaryPassword).toMatchObject({ state: 'unavailable', reason: 'not_recorded' });
  });

  it('never reveals after the encryption key is rotated, and cleans up', async () => {
    await createAdmin();
    const key = process.env.TEMP_CREDENTIAL_KEY;
    process.env.TEMP_CREDENTIAL_KEY = Buffer.alloc(32, 9).toString('base64');
    try {
      await expect(revealTemporaryPassword(actor, idOf(JAMES.email), CONTEXT)).rejects.toMatchObject({
        code: 'TEMPORARY_PASSWORD_UNAVAILABLE',
      });
      expect(store.temporaryCredentials[0]!.sealed).toBe('');
    } finally {
      process.env.TEMP_CREDENTIAL_KEY = key;
    }
  });

  it('shows the current access code state alongside, never the code', async () => {
    await createAdmin();
    const issued = await issueCode();
    const creds = await getAdminCredentials(idOf(JAMES.email));

    expect(creds.currentCode?.id).toBe(issued.codeId);
    expect(creds.currentCode?.status).toBe('ACTIVE');
    expect(dump(creds)).not.toContain(issued.accessCode);
  });
});
