import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * First-run setup, driven through the real POST /api/setup handler.
 *
 * Everything between the request and the database is production code: the
 * schema, the setup-key check, the rate limit, Argon2id hashing and the
 * transaction. Only the database is in memory (src/test/fake-prisma.ts, with
 * real rollback and a real primary-key collision on system_installation).
 *
 * The race against real PostgreSQL is exercised end to end as well; here the
 * point is that every refusal leaves nothing behind.
 */

const fake = vi.hoisted(async () => {
  const { createFakePrisma } = await import('./../../test/fake-prisma');
  return createFakePrisma();
});

vi.mock('@/lib/prisma', async () => ({ prisma: (await fake).prisma }));

const { NextRequest } = await import('next/server');
const { POST } = await import('@/app/api/setup/route');
const { isSystemInitialized } = await import('./setup-service');
const { setupKeyProblem } = await import('@/server/auth/setup-key');
const { verifyPassword } = await import('@/server/auth/password');

const { prisma, store, reset } = await fake;

const KEY = 'test-setup-key-0123456789';
const PASSWORD = 'Institution#2026';

const valid = {
  name: 'James C. Tan',
  email: 'jctan@asiancollege.edu.ph',
  password: PASSWORD,
  passwordConfirmation: PASSWORD,
  setupKey: KEY,
};

let ipCounter = 0;

/** The audit log as text, for asserting what never appears in it. */
const auditText = () =>
  JSON.stringify(store.auditLogs, (_, v) => (typeof v === 'bigint' ? v.toString() : v));

async function post(body: Record<string, unknown>, ip = `203.0.113.${++ipCounter % 250}`) {
  const request = new NextRequest('http://localhost/api/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  reset();
  process.env.SETUP_KEY = KEY;
  process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = 'false';
  await prisma.role.create({ data: { name: 'super_admin', guardName: 'web' } });
});

describe('a fresh installation', () => {
  it('is uninitialized while there are no users and no installation row', async () => {
    expect(await isSystemInitialized()).toBe(false);
  });

  it('counts as initialized if any user exists, even without the row', async () => {
    await prisma.user.create({ data: { name: 'Old', email: 'old@example.test', password: 'x' } });
    expect(await isSystemInitialized()).toBe(true);
    expect((await post(valid)).status).toBe(409);
    expect(store.users).toHaveLength(1);
  });
});

describe('creating the first Super Admin', () => {
  it('creates exactly one active Super Admin and marks the system initialized', async () => {
    const { status, body } = await post(valid);

    expect(status).toBe(201);
    expect(body.data).toEqual({ email: 'jctan@asiancollege.edu.ph', redirectTo: '/login?setup=complete' });

    expect(store.users).toHaveLength(1);
    const user = store.users[0]!;
    expect(user).toMatchObject({
      name: 'James C. Tan',
      email: 'jctan@asiancollege.edu.ph',
      status: 'ACTIVE',
      isActive: true,
      mustChangePassword: false,
    });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);

    // The chosen password is the real one, stored only as Argon2id.
    expect(user.password).not.toContain(PASSWORD);
    expect(String(user.password).startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(PASSWORD, String(user.password))).toBe(true);

    expect(store.modelHasRoles).toHaveLength(1);
    expect(String(store.modelHasRoles[0]!.modelId)).toBe(String(user.id));
    expect(store.installations).toEqual([expect.objectContaining({ id: 1, method: 'setup' })]);
    expect(await isSystemInitialized()).toBe(true);

    expect(store.auditLogs.map((a) => a.action)).toContain('INITIAL_SUPER_ADMIN_CREATED');
    // Neither the password nor its hash reaches the audit log.
    expect(auditText()).not.toContain(PASSWORD);
    expect(auditText()).not.toContain(String(user.password));
  });

  it('issues no session — the new Super Admin signs in at /login', async () => {
    await post(valid);
    expect(store.sessions).toHaveLength(0);
  });

  it('refuses a second setup once initialized', async () => {
    expect((await post(valid)).status).toBe(201);

    const again = await post({ ...valid, email: 'someone.else@asiancollege.edu.ph' });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('TDMS has already been initialized.');
    expect(store.users).toHaveLength(1);
  });

  it('lets only one of two simultaneous setups win', async () => {
    const results = await Promise.all([
      post(valid),
      post({ ...valid, email: 'rival@asiancollege.edu.ph' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(store.users).toHaveLength(1);
    expect(store.modelHasRoles).toHaveLength(1);
    expect(store.installations).toHaveLength(1);
  });

  it('stays closed if users are deleted but the installation row remains', async () => {
    expect((await post(valid)).status).toBe(201);
    await prisma.modelHasRole.deleteMany({});
    await prisma.user.deleteMany({});

    expect(await isSystemInitialized()).toBe(true);
    expect((await post(valid)).status).toBe(409);
    expect(store.users).toHaveLength(0);
  });
});

describe('the setup key', () => {
  it('is required to be configured on the server', async () => {
    delete process.env.SETUP_KEY;
    const { status, body } = await post(valid);
    expect(status).toBe(503);
    expect(body.code).toBe('SETUP_KEY_NOT_CONFIGURED');
    expect(store.users).toHaveLength(0);
  });

  it('must be long enough to be worth guessing', () => {
    process.env.SETUP_KEY = 'short';
    expect(setupKeyProblem()).toMatch(/at least 16 characters/);
    process.env.SETUP_KEY = KEY;
    expect(setupKeyProblem()).toBeNull();
  });

  it('never appears in a refusal', () => {
    delete process.env.SETUP_KEY;
    expect(setupKeyProblem()).not.toContain(KEY);
  });

  it('refuses a wrong key, creating nothing', async () => {
    const { status, body } = await post({ ...valid, setupKey: 'not-the-key-at-all' });
    expect(status).toBe(403);
    expect(body.errors.setupKey).toEqual(['That setup key is not correct.']);
    expect(store.users).toHaveLength(0);
    expect(store.installations).toHaveLength(0);
    expect(store.auditLogs.map((a) => a.action)).toContain('INITIAL_SETUP_KEY_REJECTED');
  });

  it('stops guessing after ten attempts from one address', async () => {
    const ip = '198.51.100.77';
    for (let i = 0; i < 10; i += 1) {
      expect((await post({ ...valid, setupKey: `wrong-${i}` }, ip)).status).toBe(403);
    }
    // Even the right key is refused once the budget is spent.
    expect((await post(valid, ip)).status).toBe(429);
    expect(store.users).toHaveLength(0);
  });
});

describe('the details', () => {
  it('applies the full password policy on the server', async () => {
    const { status, body } = await post({ ...valid, password: 'weakpass', passwordConfirmation: 'weakpass' });
    expect(status).toBe(422);
    expect(body.errors.password.length).toBeGreaterThan(1);
    expect(store.users).toHaveLength(0);
  });

  it('requires the confirmation to match', async () => {
    const { status } = await post({ ...valid, passwordConfirmation: 'Institution#2027' });
    expect(status).toBe(422);
    expect(store.users).toHaveLength(0);
  });
});
