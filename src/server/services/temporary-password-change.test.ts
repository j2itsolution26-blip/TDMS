import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * POST /api/auth/change-password, driven through the real route handler.
 *
 * Everything between the request and the database is the production code: the
 * session is resolved from the cookie, the user is read from that session, the
 * body is parsed by the real schema, the password is verified and hashed by the
 * real password module, and the session is really rotated. Only the database
 * (src/test/fake-prisma.ts, with real transaction rollback) and the cookie jar
 * are in memory — plus role lookup, whose nested relation query the fake does
 * not model and which this endpoint does not depend on.
 *
 * The cases follow the brief's TEST 1–8, then the ones a Set Password button
 * invites in practice: a double click, a second tab, a forged user id.
 */

vi.hoisted(() => {
  process.env.BCRYPT_ROUNDS = '4';
});

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

vi.mock('@/lib/prisma', async () => ({ prisma: (await fake).prisma }));
vi.mock('next/headers', () => ({ cookies: async () => jar.api }));
/*
 * Roles as the in-memory database actually holds them, so a test that makes a
 * teacher gets a teacher. (The real function's permission join is more than
 * the fake models; the roles are what these tests need.)
 */
vi.mock('@/server/auth/rbac', async (original) => ({
  ...(await original<typeof import('@/server/auth/rbac')>()),
  loadRolesAndPermissions: async (userId: bigint) => {
    const { store } = await fake;
    const roles = store.modelHasRoles
      .filter((m) => String(m.modelId) === String(userId))
      .map((m) => store.roles.find((r) => String(r.id) === String(m.roleId))?.name)
      .filter((name): name is string => typeof name === 'string');
    return { roles, permissions: [] };
  },
}));

const { NextRequest } = await import('next/server');
const { POST } = await import('@/app/api/auth/change-password/route');
const { createSession, SESSION_COOKIE_NAME } = await import('@/server/auth/session');
const { replaceTemporaryPassword, updatePassword } = await import('./profile-service');
const { POST: VERIFY } = await import('@/app/api/auth/change-password/verify/route');
// Legacy rows are seeded as bcrypt (what Laravel wrote); new hashes are
// Argon2id, so every check goes through the same verifier the app uses.
const bcrypt = (await import('bcryptjs')).default;
const { verifyPassword } = await import('@/server/auth/password');

const { prisma, store, reset } = await fake;

const TEMP = 'TempPass#2026ab';
const NEW = 'MyNewPassword#2026';
const OTHER = 'SomebodyElse#2026';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Give a user a role, creating the role row the first time. */
async function grant(userId: bigint, roleName: string) {
  const role =
    (await prisma.role.findFirst({ where: { name: roleName } })) ??
    (await prisma.role.create({ data: { name: roleName, guardName: 'web' } }));
  await prisma.modelHasRole.create({
    data: { roleId: role.id, modelType: 'App\\Models\\User', modelId: userId },
  });
}

async function makeAdmin(overrides: Partial<Row> = {}, roleName = 'admin'): Promise<Row> {
  const user = await prisma.user.create({
    data: {
      name: 'James Tan',
      email: `james${store.users.length}@example.test`,
      password: await bcrypt.hash(TEMP, 4),
      emailVerifiedAt: new Date(),
      mustChangePassword: true,
      status: 'ACTIVE',
      isActive: true,
      ...overrides,
    },
  });
  await prisma.temporaryCredential.create({
    data: {
      userId: user.id,
      sealed: 'sealed-copy',
      createdBy: 1n,
      expiresAt: new Date(Date.now() + 86_400_000),
      usedAt: null,
      revokedAt: null,
    },
  });
  await grant(user.id, roleName);
  return user;
}

function userRow(id: bigint): Row {
  return store.users.find((u) => u.id === id)!;
}

function credentialOf(id: bigint): Row {
  return store.temporaryCredentials.find((c) => c.userId === id)!;
}

/** Sign this "browser" in as the user. */
async function signIn(userId: bigint) {
  jar.cookies.clear();
  await createSession(userId);
}

async function post(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost/api/auth/change-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'vitest',
      'x-forwarded-for': '203.0.113.9',
    },
    body: JSON.stringify(body),
  });
  const response = await POST(request);
  return { status: response.status, json: (await response.json()) as Row };
}

const valid = { currentPassword: TEMP, password: NEW, passwordConfirmation: NEW };

beforeEach(() => {
  reset();
  jar.cookies.clear();
});

// --- TEST 1 / TEST 7 ---------------------------------------------------------

describe('TEST 1 & 7 — a correct change', () => {
  it('changes the password, clears the flag, consumes the credential, and says so', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    const { status, json } = await post(valid);

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Password updated successfully.');
    expect(json.data.detail).toBe('Your permanent password has been set.');
    expect(json.data.redirectTo).toBe('/dashboard');

    const row = userRow(admin.id);
    expect(await verifyPassword(NEW, row.password)).toBe(true);
    // The old temporary password no longer works.
    expect(await verifyPassword(TEMP, row.password)).toBe(false);
    expect(row.mustChangePassword).toBe(false);

    const credential = credentialOf(admin.id);
    expect(credential.usedAt).toBeInstanceOf(Date);
    expect(credential.sealed).toBe('');
  });

  it('records password_changed_at, which was empty while the password was temporary', async () => {
    const admin = await makeAdmin();
    expect(userRow(admin.id).passwordChangedAt ?? null).toBeNull();

    await signIn(admin.id);
    const before = Date.now();
    await post(valid);

    const stamped = userRow(admin.id).passwordChangedAt as Date;
    expect(stamped).toBeInstanceOf(Date);
    expect(stamped.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('never returns a password or a hash', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    const { json } = await post(valid);

    const text = JSON.stringify(json);
    expect(text).not.toContain(TEMP);
    expect(text).not.toContain(NEW);
    expect(text).not.toContain(userRow(admin.id).password);
    expect(text).not.toMatch(/\$2[aby]\$/);
  });

  it('records a staff member\'s change as TEMP_PASSWORD_CHANGED, not as an Admin event', async () => {
    const teacher = await makeAdmin({ name: 'Ana Teacher' }, 'teacher');
    await signIn(teacher.id);
    const res = await post(valid);
    expect(res.status, JSON.stringify(res.json)).toBe(200);

    expect(store.auditLogs.map((a) => a.action)).toContain("TEMP_PASSWORD_CHANGED");
    expect(store.auditLogs.some((a) => a.action === 'ADMIN_TEMP_PASSWORD_CHANGED')).toBe(false);
  });

  it('records ADMIN_TEMP_PASSWORD_CHANGED, with no password in it', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    await post(valid);

    const event = store.auditLogs.find((a) => a.action === 'ADMIN_TEMP_PASSWORD_CHANGED');
    expect(event).toBeDefined();
    expect(event!.target).toContain(admin.email);
    expect(event!.createdAt ?? new Date()).toBeTruthy();

    const everything = JSON.stringify(store.auditLogs, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
    expect(everything).not.toContain(TEMP);
    expect(everything).not.toContain(NEW);
    expect(everything).not.toMatch(/\$2[aby]\$/);
  });
});

// --- Session handling ----------------------------------------------------------

describe('the session after a change', () => {
  it('keeps this browser signed in on a brand-new token', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    const before = jar.cookies.get(SESSION_COOKIE_NAME);

    await post(valid);

    const after = jar.cookies.get(SESSION_COOKIE_NAME);
    expect(after).toBeDefined();
    expect(after).not.toBe(before);

    const sessions = store.sessions.filter((s) => s.userId === admin.id);
    expect(sessions).toHaveLength(1);
  });

  it('ends a session somebody else opened with the temporary password', async () => {
    const admin = await makeAdmin();

    // Somebody else signs in with the temporary password in another browser…
    await signIn(admin.id);
    const intruderCookie = jar.cookies.get(SESSION_COOKIE_NAME)!;

    // …and then the real holder signs in and changes it.
    await signIn(admin.id);
    const { status } = await post(valid);
    expect(status).toBe(200);

    // The intruder's session is gone.
    jar.cookies.clear();
    jar.cookies.set(SESSION_COOKIE_NAME, intruderCookie);
    const replay = await post({ ...valid, currentPassword: NEW });
    expect(replay.status).toBe(401);
  });

  it("leaves other people's sessions alone", async () => {
    const admin = await makeAdmin();
    const colleague = await makeAdmin();

    await signIn(colleague.id);
    const colleagueSessions = store.sessions.filter((s) => s.userId === colleague.id).length;

    await signIn(admin.id);
    await post(valid);

    expect(store.sessions.filter((s) => s.userId === colleague.id)).toHaveLength(colleagueSessions);
  });

  it('TEST 8 — a repeat after success is told it is already done, not changed again', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    await post(valid);

    // Same browser, new cookie, e.g. after a refresh.
    const again = await post({ currentPassword: NEW, password: OTHER, passwordConfirmation: OTHER });

    expect(again.status).toBe(409);
    expect(again.json.code).toBe('TEMP_PASSWORD_ALREADY_CHANGED');
    expect(await verifyPassword(NEW, userRow(admin.id).password)).toBe(true);
  });
});

// --- TEST 2 ------------------------------------------------------------------

describe('TEST 2 — the wrong temporary password', () => {
  it('is refused with the exact message, and changes nothing', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    const { status, json } = await post({ ...valid, currentPassword: 'NotTheRightOne#1' });

    expect(status).toBe(422);
    expect(json.code).toBe('TEMP_PASSWORD_INCORRECT');
    expect(json.message).toBe('Incorrect temporary password.');
    expect(json.errors.currentPassword).toEqual(['Incorrect temporary password.']);

    const row = userRow(admin.id);
    expect(await verifyPassword(TEMP, row.password)).toBe(true);
    expect(row.mustChangePassword).toBe(true);
    expect(credentialOf(admin.id).usedAt).toBeNull();
  });

  it('is throttled after repeated wrong guesses, even if the next guess is right', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    for (let i = 0; i < 5; i += 1) {
      expect((await post({ ...valid, currentPassword: `Wrong#Guess${i}xx` })).status).toBe(422);
    }

    const { status, json } = await post(valid);
    expect(status).toBe(429);
    expect(json.code).toBe('TEMP_PASSWORD_THROTTLED');
    expect(userRow(admin.id).mustChangePassword).toBe(true);
  });
});

// --- TEST 3 & 4 --------------------------------------------------------------

describe('TEST 3 — a new password that misses the rules', () => {
  const weak: [string, string][] = [
    ['too short', 'Short#1a'],
    ['no uppercase', 'mynewpassword#2026'],
    ['no lowercase', 'MYNEWPASSWORD#2026'],
    ['no number', 'MyNewPassword#Test'],
    ['no special character', 'MyNewPassword2026x'],
  ];

  for (const [label, password] of weak) {
    it(`refuses one with ${label}, naming the rule, and changes nothing`, async () => {
      const admin = await makeAdmin();
      await signIn(admin.id);

      const { status, json } = await post({ currentPassword: TEMP, password, passwordConfirmation: password });

      expect(status).toBe(422);
      expect(json.errors.password.length).toBeGreaterThan(0);
      expect(userRow(admin.id).mustChangePassword).toBe(true);
      expect(await verifyPassword(TEMP, userRow(admin.id).password)).toBe(true);
    });
  }

  it('refuses keeping the temporary password as the new one', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    const { status, json } = await post({ currentPassword: TEMP, password: TEMP, passwordConfirmation: TEMP });

    expect(status).toBe(422);
    expect(json.code).toBe('PASSWORD_UNCHANGED');
    expect(userRow(admin.id).mustChangePassword).toBe(true);
  });
});

describe('TEST 4 — a confirmation that does not match', () => {
  it('is refused as "Passwords do not match." and changes nothing', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    const { status, json } = await post({ ...valid, passwordConfirmation: `${NEW}x` });

    expect(status).toBe(422);
    expect(json.errors.passwordConfirmation).toEqual(['Passwords do not match.']);
    expect(userRow(admin.id).mustChangePassword).toBe(true);
  });

  it('requires the temporary password field', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    const { status, json } = await post({ ...valid, currentPassword: '' });
    expect(status).toBe(422);
    expect(json.errors.currentPassword).toEqual(['Temporary password is required.']);
  });
});

// --- TEST 5 & 6: the temporary password no longer valid -----------------------

describe('TEST 5 & 6 — a temporary password that has been superseded or used', () => {
  it('after a Super Admin reset, the old session is gone and the old password refused', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    const oldCookie = jar.cookies.get(SESSION_COOKIE_NAME)!;

    // What resetAdminTemporaryPassword does: new hash, sessions ended.
    userRow(admin.id).password = await bcrypt.hash('FreshTemp#2026zz', 4);
    store.sessions.splice(0, store.sessions.length);

    jar.cookies.set(SESSION_COOKIE_NAME, oldCookie);
    expect((await post(valid)).status).toBe(401);

    // Even with a new session, the superseded password is refused.
    await signIn(admin.id);
    const { json } = await post(valid);
    expect(json.message).toBe('Incorrect temporary password.');
  });

  it('a used temporary password cannot be used a second time', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    await post(valid);

    const second = await post(valid);
    expect(second.status).toBe(409);
    expect(second.json.code).toBe('TEMP_PASSWORD_ALREADY_CHANGED');
  });
});

// --- Account state ------------------------------------------------------------

describe('account state', () => {
  it('a suspended account has no session at all', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    userRow(admin.id).status = 'SUSPENDED';

    const { status } = await post(valid);
    expect(status).toBe(401);
    expect(await verifyPassword(TEMP, userRow(admin.id).password)).toBe(true);
  });

  it('is re-checked inside the operation, in case the session check raced a suspension', async () => {
    const admin = await makeAdmin({ status: 'SUSPENDED', isActive: false });

    await expect(replaceTemporaryPassword(admin.id, { currentPassword: TEMP, password: NEW })).rejects.toThrow(
      'Your account is suspended. Please contact the system administrator.',
    );
    expect(await verifyPassword(TEMP, userRow(admin.id).password)).toBe(true);
  });
});

// --- The things a real button invites -----------------------------------------

describe('what a real browser does', () => {
  it('a double click changes the password once', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    const [a, b] = await Promise.all([post(valid), post(valid)]);
    const statuses = [a.status, b.status].sort();

    // One succeeds. The other finds nothing left to change.
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    expect(await verifyPassword(NEW, userRow(admin.id).password)).toBe(true);
    expect(store.auditLogs.filter((e) => e.action === 'ADMIN_TEMP_PASSWORD_CHANGED')).toHaveLength(1);
  });

  it('ignores a user id in the body: only the session decides whose password changes', async () => {
    const admin = await makeAdmin();
    const victim = await makeAdmin();
    await signIn(admin.id);

    const { status } = await post({ ...valid, userId: victim.id.toString(), id: victim.id.toString() });

    expect(status).toBe(200);
    expect(await verifyPassword(NEW, userRow(admin.id).password)).toBe(true);
    // The other account is exactly as it was.
    expect(await verifyPassword(TEMP, userRow(victim.id).password)).toBe(true);
    expect(userRow(victim.id).mustChangePassword).toBe(true);
  });

  it('refuses an anonymous caller', async () => {
    await makeAdmin();
    jar.cookies.clear();
    expect((await post(valid)).status).toBe(401);
  });
});

// --- A reset in the middle of a change ------------------------------------------

describe('a Super Admin reset landing mid-change', () => {
  /**
   * The race behind the reported bug, pinned down. The service reads the
   * account and verifies the temporary password; before its write lands, the
   * Super Admin issues a fresh temporary password. A write conditional on the
   * flag alone would still match — the flag stays set after a reset — and the
   * new password would silently overwrite the credential the administrator had
   * just issued. The write is conditional on the verified hash instead.
   */
  it('refuses cleanly and leaves the freshly issued temporary password in place', async () => {
    const admin = await makeAdmin();
    const staleRow = { ...userRow(admin.id) };

    // The reset: a new temporary hash, flag still set.
    const freshTemp = 'FreshTemp#2026zz';
    userRow(admin.id).password = await bcrypt.hash(freshTemp, 4);

    // The service's first read happened BEFORE the reset, so it saw the old hash.
    const spy = vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(staleRow);

    await expect(
      replaceTemporaryPassword(admin.id, { currentPassword: TEMP, password: NEW }),
    ).rejects.toMatchObject({ code: 'TEMP_PASSWORD_SUPERSEDED' });
    spy.mockRestore();

    const row = userRow(admin.id);
    expect(await verifyPassword(freshTemp, row.password)).toBe(true);
    expect(await verifyPassword(NEW, row.password)).toBe(false);
    expect(row.mustChangePassword).toBe(true);
    expect(credentialOf(admin.id).usedAt).toBeNull();
  });

  it('says the password was NOT changed, in words', async () => {
    const admin = await makeAdmin();
    const staleRow = { ...userRow(admin.id) };
    userRow(admin.id).password = await bcrypt.hash('FreshTemp#2026zz', 4);
    const spy = vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(staleRow);

    await expect(
      replaceTemporaryPassword(admin.id, { currentPassword: TEMP, password: NEW }),
    ).rejects.toThrow(/NOT changed/);
    spy.mockRestore();
  });
});

// --- The live check behind "Temporary password verified." ---------------------

describe('POST /api/auth/change-password/verify', () => {
  async function verify(currentPassword: string) {
    const request = new NextRequest('http://localhost/api/auth/change-password/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ currentPassword }),
    });
    const response = await VERIFY(request);
    return { status: response.status, json: (await response.json()) as Row };
  }

  it('confirms the right temporary password', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    const { status, json } = await verify(TEMP);
    expect(status).toBe(200);
    expect(json.data).toEqual({ valid: true, message: 'Temporary password verified.' });
  });

  it('rejects a wrong one, without saying how close it was', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    const { status, json } = await verify('Wrong#Password1x');
    expect(status).toBe(200);
    expect(json.data).toEqual({ valid: false, message: 'Incorrect temporary password.' });
  });

  it('changes nothing, and never returns a hash', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    const hashBefore = userRow(admin.id).password;

    const { json } = await verify(TEMP);

    expect(userRow(admin.id).password).toBe(hashBefore);
    expect(userRow(admin.id).mustChangePassword).toBe(true);
    expect(JSON.stringify(json)).not.toMatch(/\$2[aby]\$/);
  });

  it('does not check anything once the password is permanent', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);
    await post(valid);

    // The temporary password is gone; "incorrect" would be misleading.
    const { status, json } = await verify(TEMP);
    expect(status).toBe(409);
    expect(json.code).toBe('TEMP_PASSWORD_ALREADY_CHANGED');
  });

  it('refuses an anonymous caller', async () => {
    await makeAdmin();
    jar.cookies.clear();
    expect((await verify(TEMP)).status).toBe(401);
  });

  it('is bounded, so it cannot be used as an unlimited oracle', async () => {
    const admin = await makeAdmin();
    await signIn(admin.id);

    for (let i = 0; i < 20; i += 1) await verify(`Wrong#Guess${i}xxxx`);
    const { status, json } = await verify(TEMP);
    expect(status).toBe(429);
    expect(json.code).toBe('TEMP_PASSWORD_THROTTLED');
  });
});

// --- The other ways a holder sets their own password ----------------------------

describe('password_changed_at on the profile change', () => {
  it('is recorded when a signed-in user changes their password from the profile', async () => {
    const user = await makeAdmin({ mustChangePassword: false });
    await updatePassword(user.id, { currentPassword: TEMP, password: NEW });
    expect(userRow(user.id).passwordChangedAt).toBeInstanceOf(Date);
  });
});
