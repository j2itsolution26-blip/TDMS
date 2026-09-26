import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The Super Admin bootstrap, exercised end to end against an in-memory
 * database (src/test/fake-prisma.ts) and a captured mailer.
 *
 * The invariant these tests exist for is the one in capitals in the service:
 * NO SUPER ADMIN ACCOUNT IS CREATED BEFORE THE EMAILED CODE HAS BEEN
 * VERIFIED. Every failure mode below — wrong code, expired code, exhausted
 * attempts, undeliverable mail, a double-submitted form, a refresh — is
 * checked for that as well as for its own behaviour, because "it also did not
 * create an administrator" is the part that matters.
 */

const env = vi.hoisted(() => {
  // Hashing cost is irrelevant to correctness here and dominates the runtime.
  process.env.BCRYPT_ROUNDS = '4';
  // A configured mail transport, so the flow is not blocked before it starts.
  process.env.MAIL_HOST = 'smtp.test';
  process.env.MAIL_PORT = '587';
  process.env.MAIL_FROM_ADDRESS = 'no-reply@asiancollege.edu.ph';
  process.env.MAIL_FROM_NAME = 'TDMS';
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

/** What the mailer was asked to send, and whether it should succeed. */
const mail = vi.hoisted(() => ({
  sent: [] as { to: string; code: string; expiresAt: Date }[],
  delivered: true,
}));

vi.mock('@/lib/prisma', async () => ({ prisma: (await fake).prisma }));

vi.mock('next/headers', () => ({ cookies: async () => jar.api }));

vi.mock('@/server/mail/messages', () => ({
  sendSuperAdminCodeEmail: async (params: { to: string; code: string; expiresAt: Date }) => {
    mail.sent.push(params);
    return mail.delivered
      ? { delivered: true, transport: 'smtp' }
      : { delivered: false, transport: 'smtp', detail: 'refused' };
  },
}));

const {
  startRegistration,
  verifyCode,
  completeRegistration,
  resendCode,
  pendingRegistrationState,
  abandonRegistration,
  isBootstrapAllowed,
  prunePendingRegistrations,
} = await import('./super-admin-service');

const { prisma, store, reset } = await fake;

const { MAX_VERIFICATION_ATTEMPTS, MAX_RESENDS, RESEND_COOLDOWN_SECONDS, CODE_TTL_MINUTES } =
  await import('@/server/auth/verification-code');

const CONTEXT = { ip: '203.0.113.10', userAgent: 'vitest' };

const DETAILS = {
  name: 'James C. Tan',
  email: 'jctan@asiancollege.edu.ph',
  password: 'Institution#2026',
};

/** JSON, tolerating the BigInt ids the fake hands out. */
function dump(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/** The code that was just emailed. Only the test may look at this. */
function lastCode(): string {
  return mail.sent[mail.sent.length - 1]!.code;
}

function pendingRow() {
  return store.pending[0] as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Wind the current registration's clocks back, to simulate waiting. */
function ageRegistration(seconds: number) {
  const row = pendingRow()!;
  row.lastSentAt = new Date(row.lastSentAt.getTime() - seconds * 1000);
  row.verificationExpiresAt = new Date(row.verificationExpiresAt.getTime() - seconds * 1000);
}

function superAdminCount(): number {
  return store.modelHasRoles.length;
}

beforeEach(() => {
  reset();
  jar.cookies.clear();
  mail.sent = [];
  mail.delivered = true;
});

// --- The happy path --------------------------------------------------------

describe('the complete flow', () => {
  it('creates the account only after the code is verified, and nothing before', async () => {
    expect(await isBootstrapAllowed()).toBe(true);

    // Step 1 — details in, code out.
    const started = await startRegistration(DETAILS, CONTEXT);

    expect(started.email).toBe(DETAILS.email);
    expect(started.verified).toBe(false);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe(DETAILS.email);

    // Nothing has been created. This is the whole point.
    expect(store.users).toHaveLength(0);
    expect(superAdminCount()).toBe(0);
    expect(store.sessions).toHaveLength(0);
    expect(store.pending).toHaveLength(1);

    // The password is stored only as a hash, and the code is not stored at all.
    const row = pendingRow()!;
    expect(row.passwordHash).not.toContain(DETAILS.password);
    expect(row.passwordHash.startsWith('$2')).toBe(true);
    expect(dump(row)).not.toContain(lastCode());

    // Step 2 — verify. Still creates nothing.
    const verified = await verifyCode(lastCode(), CONTEXT);

    expect(verified.verified).toBe(true);
    expect(store.users).toHaveLength(0);
    expect(superAdminCount()).toBe(0);
    expect(store.sessions).toHaveLength(0);

    // Step 3 — create.
    const created = await completeRegistration(CONTEXT);

    expect(created.email).toBe(DETAILS.email);
    expect(created.redirectTo).toBe('/dashboard');

    expect(store.users).toHaveLength(1);
    const user = store.users[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(user.email).toBe(DETAILS.email);
    expect(user.status).toBe('ACTIVE');
    expect(user.isActive).toBe(true);
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    // The hash written at registration is carried over, never re-hashed.
    expect(user.password).toBe(row.passwordHash);

    // The role was assigned, the session issued, the pending row consumed.
    expect(superAdminCount()).toBe(1);
    expect(store.sessions).toHaveLength(1);
    expect(store.pending).toHaveLength(0);

    // And the slot is now closed.
    expect(await isBootstrapAllowed()).toBe(false);
  });

  it('never lets the code reach the caller', async () => {
    const started = await startRegistration(DETAILS, CONTEXT);
    expect(dump(started)).not.toContain(lastCode());

    const state = (await pendingRegistrationState())!;
    expect(dump(state)).not.toContain(lastCode());
    // Nor anything else it could be reconstructed from.
    expect(Object.keys(state).sort()).toEqual([
      'attemptsRemaining',
      'completionInSeconds',
      'email',
      'expiresInSeconds',
      'resendInSeconds',
      'resendsRemaining',
      'verified',
    ]);
  });
});

// --- Refusals at step 1 ----------------------------------------------------

describe('registration details', () => {
  it('refuses an address that already holds an account, and sends no code', async () => {
    await prisma.user.create({ data: { name: 'Existing', email: DETAILS.email, password: 'x' } });

    await expect(startRegistration(DETAILS, CONTEXT)).rejects.toThrow(
      'This email is already registered.',
    );
    expect(mail.sent).toHaveLength(0);
    expect(store.pending).toHaveLength(0);
  });

  it('refuses a non-institutional address when the domain restriction is on', async () => {
    /*
     * The restriction is switched on explicitly. It now defaults to off for
     * development, so a test that relied on the old default would quietly
     * stop asserting anything — and this is precisely the rule that has to
     * keep working when it is turned back on for launch.
     */
    const saved = process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
    process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = 'true';
    process.env.GOOGLE_ALLOWED_DOMAIN = 'asiancollege.edu.ph';

    try {
      await expect(
        startRegistration({ ...DETAILS, email: 'jctan@gmail.com' }, CONTEXT),
      ).rejects.toThrow();
      expect(mail.sent).toHaveLength(0);
      expect(store.pending).toHaveLength(0);
    } finally {
      if (saved === undefined) delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
      else process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = saved;
    }
  });

  it('accepts any well-formed address while the restriction is off', async () => {
    // The development setting: a real Google account on any domain.
    delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;

    await startRegistration({ ...DETAILS, email: 'jctan@gmail.com' }, CONTEXT);
    expect(mail.sent).toHaveLength(1);
    expect(store.pending).toHaveLength(1);
  });

  it('still refuses a malformed address whatever the policy', async () => {
    await expect(
      startRegistration({ ...DETAILS, email: 'not-an-email' }, CONTEXT),
    ).rejects.toThrow();
    expect(mail.sent).toHaveLength(0);
    expect(store.pending).toHaveLength(0);
  });

  it('refuses once a Super Admin exists, however the endpoint is reached', async () => {
    // Complete a bootstrap first.
    await startRegistration(DETAILS, CONTEXT);
    await verifyCode(lastCode(), CONTEXT);
    await completeRegistration(CONTEXT);

    await expect(
      startRegistration({ ...DETAILS, email: 'someone.else@asiancollege.edu.ph' }, CONTEXT),
    ).rejects.toThrow('already been completed');
    expect(store.users).toHaveLength(1);
  });

  it('leaves nothing behind when the verification email cannot be sent', async () => {
    mail.delivered = false;

    await expect(startRegistration(DETAILS, CONTEXT)).rejects.toThrow(
      "We couldn't send the verification email. Please try again.",
    );

    // Neither an account nor a half-finished registration holding the address.
    expect(store.users).toHaveLength(0);
    expect(store.pending).toHaveLength(0);
  });

  it('refuses outright when no mail transport is configured', async () => {
    const host = process.env.MAIL_HOST;
    const key = process.env.RESEND_API_KEY;
    delete process.env.MAIL_HOST;
    delete process.env.RESEND_API_KEY;

    try {
      await expect(startRegistration(DETAILS, CONTEXT)).rejects.toThrow(/MAIL_HOST/);
      // The refusal is the point: no silent creation.
      expect(store.users).toHaveLength(0);
      expect(store.pending).toHaveLength(0);
    } finally {
      process.env.MAIL_HOST = host;
      if (key !== undefined) process.env.RESEND_API_KEY = key;
    }
  });
});

// --- Refusals at step 2 ----------------------------------------------------

describe('verifying the code', () => {
  beforeEach(async () => {
    await startRegistration(DETAILS, CONTEXT);
  });

  it('rejects a wrong code and creates nothing', async () => {
    const wrong = lastCode() === '000000' ? '111111' : '000000';

    await expect(verifyCode(wrong, CONTEXT)).rejects.toThrow(
      'Incorrect verification code. Please try again.',
    );

    expect(pendingRow()!.verifiedAt).toBeNull();
    expect(store.users).toHaveLength(0);
  });

  it('counts each wrong code, and burns the code at the cap', async () => {
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';

    for (let i = 1; i < MAX_VERIFICATION_ATTEMPTS; i += 1) {
      await expect(verifyCode(wrong, CONTEXT)).rejects.toThrow('Incorrect verification code');
      expect(pendingRow()!.verificationAttempts).toBe(i);
    }

    // The attempt that reaches the cap says so, rather than "incorrect".
    await expect(verifyCode(wrong, CONTEXT)).rejects.toThrow('Too many verification attempts');

    // And now even the RIGHT code is dead: the hash was emptied.
    expect(pendingRow()!.verificationCodeHash).toBe('');
    await expect(verifyCode(right, CONTEXT)).rejects.toThrow('Too many verification attempts');

    expect(store.users).toHaveLength(0);
  });

  it('refuses an expired code, and says to request a new one', async () => {
    ageRegistration(CODE_TTL_MINUTES * 60 + 1);

    await expect(verifyCode(lastCode(), CONTEXT)).rejects.toThrow(
      'This verification code has expired. Request a new code.',
    );
    expect(store.users).toHaveLength(0);
  });

  it('is single use: the same code cannot be verified twice into two accounts', async () => {
    const code = lastCode();
    await verifyCode(code, CONTEXT);

    // The hash is gone, so the digits are spent.
    expect(pendingRow()!.verificationCodeHash).toBe('');

    // Repeating the call is treated as already-done rather than as a failure,
    // so a double-clicked Verify button does not show an error.
    const again = await verifyCode(code, CONTEXT);
    expect(again.verified).toBe(true);

    await completeRegistration(CONTEXT);
    expect(store.users).toHaveLength(1);
  });

  it('cannot be verified with a code issued for a different registration', async () => {
    const first = lastCode();

    // A second registration for another address supersedes nothing of the
    // first, and its code must not work against it.
    jar.cookies.clear();
    await startRegistration(
      { ...DETAILS, email: 'other.person@asiancollege.edu.ph' },
      { ip: '198.51.100.5', userAgent: 'vitest' },
    );

    await expect(verifyCode(first, CONTEXT)).rejects.toThrow(
      'Incorrect verification code. Please try again.',
    );
    expect(store.users).toHaveLength(0);
  });

  it('refuses a verification attempt from a browser with no setup cookie', async () => {
    const code = lastCode();
    jar.cookies.clear();

    await expect(verifyCode(code, CONTEXT)).rejects.toThrow(/expired or was not found/);
    expect(store.users).toHaveLength(0);
  });
});

// --- Resending -------------------------------------------------------------

describe('resending the code', () => {
  beforeEach(async () => {
    await startRegistration(DETAILS, CONTEXT);
  });

  it('refuses inside the cooldown', async () => {
    await expect(resendCode(CONTEXT)).rejects.toThrow(/Please wait \d+ seconds/);
    expect(mail.sent).toHaveLength(1);
  });

  it('issues a new code once the cooldown has passed, and retires the old one', async () => {
    const original = lastCode();
    ageRegistration(RESEND_COOLDOWN_SECONDS);

    await resendCode(CONTEXT);
    expect(mail.sent).toHaveLength(2);

    const replacement = lastCode();
    expect(pendingRow()!.resendCount).toBe(1);

    // The superseded code no longer works; the new one does.
    if (replacement !== original) {
      await expect(verifyCode(original, CONTEXT)).rejects.toThrow('Incorrect verification code');
    }
    const state = await verifyCode(replacement, CONTEXT);
    expect(state.verified).toBe(true);
  });

  it('resets the failed attempts, because the code is new', async () => {
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    await expect(verifyCode(wrong, CONTEXT)).rejects.toThrow();
    expect(pendingRow()!.verificationAttempts).toBe(1);

    ageRegistration(RESEND_COOLDOWN_SECONDS);
    await resendCode(CONTEXT);

    expect(pendingRow()!.verificationAttempts).toBe(0);
  });

  it('revives an expired registration, rather than stranding it', async () => {
    ageRegistration(CODE_TTL_MINUTES * 60 + 1);
    await expect(verifyCode(lastCode(), CONTEXT)).rejects.toThrow('expired');

    await resendCode(CONTEXT);
    const state = await verifyCode(lastCode(), CONTEXT);
    expect(state.verified).toBe(true);
  });

  it(`stops after ${MAX_RESENDS} resends`, async () => {
    for (let i = 0; i < MAX_RESENDS; i += 1) {
      ageRegistration(RESEND_COOLDOWN_SECONDS);
      await resendCode(CONTEXT);
    }

    ageRegistration(RESEND_COOLDOWN_SECONDS);
    await expect(resendCode(CONTEXT)).rejects.toThrow('No more codes can be sent');

    // One initial send plus the cap, and no more.
    expect(mail.sent).toHaveLength(MAX_RESENDS + 1);
    expect(store.users).toHaveLength(0);
  });

  it('is rate limited per address, so restarting does not buy unlimited mail', async () => {
    /*
     * Six sends per address per hour. Starting over resets the per-row resend
     * counter, so this budget is what actually bounds the mail sent to one
     * institutional mailbox.
     */
    let refused: string | null = null;

    for (let i = 0; i < 12 && refused === null; i += 1) {
      try {
        await startRegistration(DETAILS, CONTEXT);
      } catch (error) {
        refused = error instanceof Error ? error.message : 'unknown';
      }
    }

    expect(refused).toMatch(/Too many verification emails/);
    expect(mail.sent.length).toBeLessThanOrEqual(6);
  });
});

// --- Refusals at step 3 ----------------------------------------------------

describe('creating the account', () => {
  it('refuses to create anything from an unverified registration', async () => {
    await startRegistration(DETAILS, CONTEXT);

    await expect(completeRegistration(CONTEXT)).rejects.toThrow(/verify your email/i);

    expect(store.users).toHaveLength(0);
    expect(superAdminCount()).toBe(0);
    expect(store.sessions).toHaveLength(0);
  });

  it('refuses without a setup cookie, even when a verified registration exists', async () => {
    await startRegistration(DETAILS, CONTEXT);
    await verifyCode(lastCode(), CONTEXT);

    jar.cookies.clear();

    await expect(completeRegistration(CONTEXT)).rejects.toThrow(/expired or was not found/);
    expect(store.users).toHaveLength(0);
  });

  it('creates one account when the button is double-clicked', async () => {
    await startRegistration(DETAILS, CONTEXT);
    await verifyCode(lastCode(), CONTEXT);

    const results = await Promise.allSettled([
      completeRegistration(CONTEXT),
      completeRegistration(CONTEXT),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(store.users).toHaveLength(1);
    expect(superAdminCount()).toBe(1);
  });

  it('issues no session when account creation fails', async () => {
    await startRegistration(DETAILS, CONTEXT);
    await verifyCode(lastCode(), CONTEXT);

    // Somebody else took the address between verification and creation.
    await prisma.user.create({ data: { name: 'Race', email: DETAILS.email, password: 'x' } });

    await expect(completeRegistration(CONTEXT)).rejects.toThrow('This email is already registered.');

    // The transaction rolled back: no role assignment, no session, and the
    // pending row was not consumed.
    expect(superAdminCount()).toBe(0);
    expect(store.sessions).toHaveLength(0);
    expect(store.pending).toHaveLength(1);
  });

  it('refuses if another administrator appeared first', async () => {
    await startRegistration(DETAILS, CONTEXT);
    await verifyCode(lastCode(), CONTEXT);

    // e.g. npm run admin:create, run from a shell in the meantime.
    const role = await prisma.role.create({ data: { name: 'super_admin', guardName: 'web' } });
    const other = await prisma.user.create({
      data: { name: 'CLI', email: 'cli@asiancollege.edu.ph', password: 'x' },
    });
    await prisma.modelHasRole.create({
      data: { roleId: role.id, modelType: 'App\\Models\\User', modelId: other.id },
    });

    await expect(completeRegistration(CONTEXT)).rejects.toThrow('already been completed');
    expect(store.users).toHaveLength(1);
  });
});

// --- Resuming and housekeeping --------------------------------------------

describe('a refresh part-way through', () => {
  it('resumes from the cookie, with the countdowns intact', async () => {
    await startRegistration(DETAILS, CONTEXT);

    // A refresh is exactly this: the browser asks where it had got to.
    const resumed = (await pendingRegistrationState())!;

    expect(resumed.email).toBe(DETAILS.email);
    expect(resumed.verified).toBe(false);
    expect(resumed.expiresInSeconds).toBeGreaterThan(0);
    expect(resumed.expiresInSeconds).toBeLessThanOrEqual(CODE_TTL_MINUTES * 60);
    expect(resumed.attemptsRemaining).toBe(MAX_VERIFICATION_ATTEMPTS);

    // And the code in the inbox still works afterwards.
    await verifyCode(lastCode(), CONTEXT);
    expect((await pendingRegistrationState())!.verified).toBe(true);
  });

  it('reports nothing pending for a browser that holds no cookie', async () => {
    expect(await pendingRegistrationState()).toBeNull();
  });

  it('forgets the registration when the operator starts over', async () => {
    await startRegistration(DETAILS, CONTEXT);
    await abandonRegistration();

    expect(store.pending).toHaveLength(0);
    expect(await pendingRegistrationState()).toBeNull();
    expect(store.users).toHaveLength(0);
  });
});

describe('pruning', () => {
  it('removes a registration abandoned past the point of recovery', async () => {
    await startRegistration(DETAILS, CONTEXT);

    // Expired with its resends spent: nothing can revive it.
    const row = pendingRow()!;
    row.verificationExpiresAt = new Date(Date.now() - 60_000);
    row.resendCount = MAX_RESENDS;

    expect(await prunePendingRegistrations()).toBe(1);
    expect(store.pending).toHaveLength(0);
  });

  it('keeps an expired registration that could still be revived by a resend', async () => {
    await startRegistration(DETAILS, CONTEXT);
    pendingRow()!.verificationExpiresAt = new Date(Date.now() - 60_000);

    expect(await prunePendingRegistrations()).toBe(0);
    expect(store.pending).toHaveLength(1);
  });
});
