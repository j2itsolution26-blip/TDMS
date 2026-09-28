import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AuthUser } from '@/types/domain';

/**
 * Staff accounts created directly by the Admin, with a temporary password —
 * no invitation email anywhere in the flow.
 *
 * The properties: an account is usable at once (ACTIVE) but forced to change
 * its password; nothing stores the temporary password in plaintext; no email is
 * sent; the Admin cannot hand out privileged roles; and a reset replaces the
 * password, ends sessions, and never quietly undoes a suspension.
 */

vi.hoisted(() => {
  process.env.BCRYPT_ROUNDS = '4';
  delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  return {};
});

const fake = vi.hoisted(async () => {
  const { createFakePrisma } = await import('./../../test/fake-prisma');
  return createFakePrisma();
});

const mail = vi.hoisted(() => ({ sent: 0 }));

vi.mock('@/lib/prisma', async () => ({ prisma: (await fake).prisma }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock('@/server/mail/mailer', () => ({ canSendMail: () => true, appUrl: () => 'http://localhost:3000' }));
vi.mock('@/server/mail/messages', () => ({
  sendVerificationEmail: async () => { mail.sent += 1; return { delivered: true }; },
  sendPasswordResetEmail: async () => { mail.sent += 1; return { delivered: true }; },
  sendAdminAccessCodeEmail: async () => { mail.sent += 1; return { delivered: true }; },
  sendAccessCodeRequestEmail: async () => { mail.sent += 1; return { delivered: true }; },
}));

const {
  createStaffAccount,
  resetStaffTemporaryPassword,
  updateAccount,
  setAccountStatus,
} = await import('./account-service');
const { verifyPassword } = await import('@/server/auth/password');

const { prisma, store, reset } = await fake;

const CONTEXT = { ip: '203.0.113.10', userAgent: 'vitest' };
const TEMP = 'Staff#Temporary2026x';
const USER_MODEL = 'App\\Models\\User';

function dump(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function row(email: string) {
  return store.users.find((u) => u.email === email)!;
}

const admin: AuthUser = {
  id: '1',
  name: 'Operations Admin',
  username: null,
  email: 'ops@example.test',
  status: 'ACTIVE',
  emailVerifiedAt: new Date(),
  mustChangePassword: false,
  roles: ['admin'],
  permissions: ['accounts.manage'],
};

beforeEach(async () => {
  reset();
  mail.sent = 0;
  for (const name of ['super_admin', 'admin', 'director', 'coordinator', 'secretary', 'teacher', 'student']) {
    await prisma.role.create({ data: { name, guardName: 'web' } });
  }
});

async function addTeacher(email = 'teacher@gmail.com') {
  return createStaffAccount(admin, { name: 'Ana Teacher', email, role: 'teacher', temporaryPassword: TEMP }, CONTEXT);
}

describe('adding staff', () => {
  it('creates an ACTIVE account that must change its password, with no invitation', async () => {
    const created = await addTeacher();
    const u = row('teacher@gmail.com');

    expect(u.status).toBe('ACTIVE');
    expect(u.isActive).toBe(true);
    expect(u.mustChangePassword).toBe(true);
    expect(u.emailVerifiedAt).toBeInstanceOf(Date);
    expect(created.temporaryPassword).toBe(TEMP);
    // No email in the flow at all.
    expect(mail.sent).toBe(0);
  });

  it('signs in with the temporary password: its hash is what is stored', async () => {
    await addTeacher();
    expect(await verifyPassword(TEMP, String(row('teacher@gmail.com').password))).toBe(true);
    expect(dump(store)).not.toContain(TEMP);
  });

  it('assigns the chosen role', async () => {
    await addTeacher();
    const u = row('teacher@gmail.com');
    const assignment = store.modelHasRoles.find((m) => String(m.modelId) === String(u.id))!;
    const role = store.roles.find((r) => String(r.id) === String(assignment.roleId))!;
    expect(role.name).toBe('teacher');
    expect(assignment.modelType).toBe(USER_MODEL);
  });

  it('records the creation without the password', async () => {
    await addTeacher();
    const entry = store.auditLogs.find((a) => a.action === 'STAFF_CREATED')!;
    expect(entry).toBeDefined();
    expect(dump(store.auditLogs)).not.toContain(TEMP);
  });

  it('will not create an Admin or a Super Admin', async () => {
    for (const role of ['admin', 'super_admin', 'student']) {
      await expect(
        createStaffAccount(admin, { name: 'X', email: `${role}@gmail.com`, role, temporaryPassword: TEMP }, CONTEXT),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(store.users).toHaveLength(0);
  });

  it('accepts any valid email domain during development', async () => {
    await addTeacher('someone@yahoo.com');
    expect(row('someone@yahoo.com').status).toBe('ACTIVE');
  });

  it('refuses a second account on the same address', async () => {
    await addTeacher();
    await expect(addTeacher()).rejects.toMatchObject({ status: 422 });
  });
});

describe('resetting a staff password', () => {
  it('issues a new temporary password, ends sessions, and forces a change', async () => {
    await addTeacher();
    const u = row('teacher@gmail.com');
    u.mustChangePassword = false; // they had already chosen their own
    await prisma.session.create({ data: { id: 'sess', userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });

    const reissued = await resetStaffTemporaryPassword(admin, BigInt(String(u.id)), CONTEXT);

    expect(reissued.temporaryPassword).not.toBe(TEMP);
    expect(await verifyPassword(reissued.temporaryPassword, String(row('teacher@gmail.com').password))).toBe(true);
    expect(await verifyPassword(TEMP, String(row('teacher@gmail.com').password))).toBe(false);
    expect(row('teacher@gmail.com').mustChangePassword).toBe(true);
    expect(store.sessions).toHaveLength(0);
    expect(mail.sent).toBe(0);
    expect(dump(store)).not.toContain(reissued.temporaryPassword);
    expect(store.auditLogs.some((a) => a.action === 'STAFF_PASSWORD_RESET')).toBe(true);
  });

  it('sets up an account left over from the old invitation flow', async () => {
    const pending = await prisma.user.create({
      data: { name: 'Old Invite', email: 'old@gmail.com', password: 'x', status: 'PENDING', isActive: false, emailVerifiedAt: null },
    });
    const teacher = store.roles.find((r) => r.name === 'teacher')!;
    await prisma.modelHasRole.create({ data: { roleId: teacher.id, modelType: USER_MODEL, modelId: pending.id } });

    const reissued = await resetStaffTemporaryPassword(admin, pending.id, CONTEXT);

    expect(reissued.activated).toBe(true);
    expect(row('old@gmail.com').status).toBe('ACTIVE');
    expect(row('old@gmail.com').emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('does not reactivate a suspended account', async () => {
    await addTeacher();
    const id = BigInt(String(row('teacher@gmail.com').id));
    await setAccountStatus(admin, id, 'SUSPENDED', CONTEXT);

    const reissued = await resetStaffTemporaryPassword(admin, id, CONTEXT);
    expect(reissued.activated).toBe(false);
    expect(row('teacher@gmail.com').status).toBe('SUSPENDED');
  });
});

describe('editing staff', () => {
  it('changing the email keeps the account active and sends nothing', async () => {
    await addTeacher();
    const id = BigInt(String(row('teacher@gmail.com').id));

    const result = await updateAccount(admin, id, { name: 'Ana Teacher', email: 'ana.new@gmail.com', role: 'teacher' }, CONTEXT);

    expect(result.emailChanged).toBe(true);
    expect(row('ana.new@gmail.com').status).toBe('ACTIVE');
    expect(row('ana.new@gmail.com').emailVerifiedAt).toBeInstanceOf(Date);
    expect(mail.sent).toBe(0);
  });
});
