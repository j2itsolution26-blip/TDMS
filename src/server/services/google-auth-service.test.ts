import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GoogleIdentity } from '@/server/auth/google/oauth';

/**
 * The sign-in decision, with the database and session layers stubbed.
 *
 * What is being pinned here is the *decision*: which Google identities are
 * accepted, what a brand-new one becomes, and which account states are
 * refused. Those are the rules that keep Google authentication from being
 * mistaken for TDMS authorization.
 */

const db = {
  user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  modelHasRole: { count: vi.fn() },
};
const createSession = vi.fn();
const recordAudit = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/server/auth/session', () => ({ createSession: (...a: unknown[]) => createSession(...a) }));
vi.mock('@/server/services/audit-log', () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  actorLabel: () => 'actor',
}));
vi.mock('@/server/auth/password', () => ({ hashPassword: async () => '$2b$12$stub' }));

const { signInWithGoogle } = await import('./google-auth-service');

function identity(overrides: Partial<GoogleIdentity> = {}): GoogleIdentity {
  return {
    sub: 'google-sub-12345',
    email: 'jane.cruz@asiancollege.edu.ph',
    emailVerified: true,
    name: 'Jane Cruz',
    givenName: 'Jane',
    familyName: 'Cruz',
    picture: 'https://lh3.googleusercontent.com/a/x',
    hostedDomain: 'asiancollege.edu.ph',
    ...overrides,
  };
}

const context = { ip: '203.0.113.5', userAgent: 'test' };

/*
 * Most of these cases describe the RESTRICTED policy, so it is switched on
 * here. The OFF behaviour — any real Google account — has its own block at
 * the end of this file.
 */
let savedRestriction: string | undefined;

beforeEach(() => {
  savedRestriction = process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = 'true';
  process.env.GOOGLE_ALLOWED_DOMAIN = 'asiancollege.edu.ph';
  vi.clearAllMocks();
  db.user.findFirst.mockResolvedValue(null);
  db.user.create.mockResolvedValue({ id: 99n });
  db.user.update.mockResolvedValue({});
  db.modelHasRole.count.mockResolvedValue(0);
});

afterEach(() => {
  if (savedRestriction === undefined) delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  else process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = savedRestriction;
  delete process.env.DEV_AUTO_ACTIVATE_GOOGLE_USERS;
});

describe('Google must have verified the address', () => {
  it('refuses an unverified Google email', async () => {
    const result = await signInWithGoogle(identity({ emailVerified: false }), context);
    expect(result.kind).toBe('email_unverified');
    expect(db.user.create).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('domain enforcement on the address Google vouched for', () => {
  const rejected = [
    'johnsmith@gmail.com',
    'john@asiancollege.com',
    'john@fakeasiancollege.edu.ph',
    'john@asiancollege.edu.ph.evil.com',
    'john@notasiancollege.edu.ph',
    'john@sub.asiancollege.edu.ph',
  ];

  for (const email of rejected) {
    it(`refuses ${email}`, async () => {
      const result = await signInWithGoogle(identity({ email, hostedDomain: null }), context);
      expect(result.kind).toBe('wrong_domain');
      expect(db.user.create).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    });
  }

  it('accepts an institutional address', async () => {
    const result = await signInWithGoogle(identity(), context);
    expect(result.kind).toBe('pending');
  });

  it('normalises case before checking', async () => {
    const result = await signInWithGoogle(
      identity({ email: 'JANE.CRUZ@ASIANCOLLEGE.EDU.PH', hostedDomain: 'ASIANCOLLEGE.EDU.PH' }),
      context,
    );
    expect(result.kind).toBe('pending');
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'jane.cruz@asiancollege.edu.ph' }),
      }),
    );
  });

  it('refuses when the Workspace hosted domain contradicts the address', async () => {
    const result = await signInWithGoogle(
      identity({ email: 'jane@asiancollege.edu.ph', hostedDomain: 'someoneelse.edu' }),
      context,
    );
    expect(result.kind).toBe('wrong_domain');
  });
});

describe('first sign-in creates a PENDING account with no privileges', () => {
  it('creates the account as PENDING and inactive', async () => {
    const result = await signInWithGoogle(identity(), context);
    expect(result).toEqual({ kind: 'pending', created: true });

    const data = db.user.create.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING');
    expect(data.isActive).toBe(false);
  });

  it('assigns NO role at all — never an administrator', async () => {
    await signInWithGoogle(identity(), context);
    const data = db.user.create.mock.calls[0][0].data;

    // A role is an authorization decision; holding a college mailbox is not
    // grounds for one. Nothing role-shaped may be written here.
    expect(JSON.stringify(data)).not.toMatch(/role|admin|super/i);
    expect(db.modelHasRole.count).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.anything() }),
    );
  });

  it('does not create a session for a pending account', async () => {
    await signInWithGoogle(identity(), context);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('records the Google sub and the verified address', async () => {
    await signInWithGoogle(identity(), context);
    const data = db.user.create.mock.calls[0][0].data;
    expect(data.googleId).toBe('google-sub-12345');
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('stores no password anyone could use', async () => {
    await signInWithGoogle(identity(), context);
    const data = db.user.create.mock.calls[0][0].data;
    expect(typeof data.password).toBe('string');
    expect(data.password.startsWith('$2')).toBe(true);
  });
});

describe('returning users are never duplicated', () => {
  it('reuses the account found by Google sub', async () => {
    db.user.findFirst.mockResolvedValue({
      id: 7n, email: 'jane.cruz@asiancollege.edu.ph', googleId: 'google-sub-12345',
      status: 'ACTIVE', emailVerifiedAt: new Date(), name: 'Jane Cruz',
    });

    const result = await signInWithGoogle(identity(), context);
    expect(result).toEqual({ kind: 'signed_in', userId: 7n, redirectTo: '/dashboard' });
    expect(db.user.create).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledOnce();
  });

  it('matches on sub even after the address changed', async () => {
    db.user.findFirst.mockResolvedValue({
      id: 7n, email: 'old.name@asiancollege.edu.ph', googleId: 'google-sub-12345',
      status: 'ACTIVE', emailVerifiedAt: new Date(), name: 'Jane Cruz',
    });

    const result = await signInWithGoogle(identity(), context);
    expect(result.kind).toBe('signed_in');
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('updates last_login_at', async () => {
    db.user.findFirst.mockResolvedValue({
      id: 7n, email: 'jane.cruz@asiancollege.edu.ph', googleId: 'google-sub-12345',
      status: 'ACTIVE', emailVerifiedAt: new Date(), name: 'Jane Cruz',
    });

    await signInWithGoogle(identity(), context);
    expect(db.user.update.mock.calls[0][0].data.lastLoginAt).toBeInstanceOf(Date);
  });

  it('links the Google identity to an account that had none', async () => {
    db.user.findFirst.mockResolvedValue({
      id: 7n, email: 'jane.cruz@asiancollege.edu.ph', googleId: null,
      status: 'ACTIVE', emailVerifiedAt: new Date(), name: 'Jane Cruz',
    });

    const result = await signInWithGoogle(identity(), context);
    expect(result.kind).toBe('signed_in');
    expect(db.user.update.mock.calls[0][0].data.googleId).toBe('google-sub-12345');
  });
});

describe('account status governs access, not Google', () => {
  function found(status: string, overrides: Record<string, unknown> = {}) {
    db.user.findFirst.mockResolvedValue({
      id: 7n, email: 'jane.cruz@asiancollege.edu.ph', googleId: 'google-sub-12345',
      status, emailVerifiedAt: new Date(), name: 'Jane Cruz', ...overrides,
    });
  }

  it('lets an ACTIVE account in', async () => {
    found('ACTIVE');
    expect((await signInWithGoogle(identity(), context)).kind).toBe('signed_in');
    expect(createSession).toHaveBeenCalledOnce();
  });

  it('refuses SUSPENDED', async () => {
    found('SUSPENDED');
    expect((await signInWithGoogle(identity(), context)).kind).toBe('suspended');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('refuses INACTIVE', async () => {
    found('INACTIVE');
    expect((await signInWithGoogle(identity(), context)).kind).toBe('inactive');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('refuses a self-registered PENDING account that has no role', async () => {
    found('PENDING');
    db.modelHasRole.count.mockResolvedValue(0);
    expect((await signInWithGoogle(identity(), context)).kind).toBe('pending');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('activates a PENDING account that an administrator invited', async () => {
    // An invitation already established who should have access; Google
    // establishes that this is them. This is what lets invitations work
    // without a mail provider.
    found('PENDING');
    db.modelHasRole.count.mockResolvedValue(1);

    const result = await signInWithGoogle(identity(), context);
    expect(result.kind).toBe('signed_in');
    expect(db.user.update.mock.calls[0][0].data.status).toBe('ACTIVE');
    expect(createSession).toHaveBeenCalledOnce();
  });

  it('does NOT let Google sign-in undo a suspension', async () => {
    found('SUSPENDED');
    db.modelHasRole.count.mockResolvedValue(1);

    const result = await signInWithGoogle(identity(), context);
    expect(result.kind).toBe('suspended');
    expect(db.user.update.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('does NOT let Google sign-in undo a deactivation', async () => {
    found('INACTIVE');
    db.modelHasRole.count.mockResolvedValue(1);

    const result = await signInWithGoogle(identity(), context);
    expect(result.kind).toBe('inactive');
    expect(db.user.update.mock.calls[0][0].data.status).toBeUndefined();
  });
});

describe('query budget', () => {
  it('costs one lookup and one write for a returning active user', async () => {
    db.user.findFirst.mockResolvedValue({
      id: 7n, email: 'jane.cruz@asiancollege.edu.ph', googleId: 'google-sub-12345',
      status: 'ACTIVE', emailVerifiedAt: new Date(), name: 'Jane Cruz',
    });

    await signInWithGoogle(identity(), context);

    expect(db.user.findFirst).toHaveBeenCalledOnce();
    expect(db.user.update).toHaveBeenCalledOnce();
    // No role count: only a PENDING account needs that question answered.
    expect(db.modelHasRole.count).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledOnce();
  });

  it('looks up by indexed columns only, never scanning', async () => {
    await signInWithGoogle(identity(), context);
    const where = db.user.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { googleId: 'google-sub-12345' },
      { email: 'jane.cruz@asiancollege.edu.ph' },
    ]);
  });
});

describe('RESTRICTION OFF — any real Google account (development setting)', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  });

  const accounts = [
    'user@gmail.com',
    'developer@gmail.com',
    'user@asiancollege.edu.ph',
    'tester@outlook.com',
  ];

  for (const email of accounts) {
    it(`accepts ${email}`, async () => {
      const result = await signInWithGoogle(identity({ email, hostedDomain: null }), context);
      // Accepted by the domain policy, then held at PENDING by the account
      // policy — which is the distinction this whole service exists to keep.
      expect(result).toEqual({ kind: 'pending', created: true });
      expect(db.user.create).toHaveBeenCalledOnce();
    });
  }

  it('ignores the Workspace hosted-domain claim when there is no domain to enforce', async () => {
    const result = await signInWithGoogle(
      identity({ email: 'user@gmail.com', hostedDomain: 'someoneelse.edu' }),
      context,
    );
    expect(result.kind).toBe('pending');
  });

  it('still requires Google to have verified the address', async () => {
    const result = await signInWithGoogle(
      identity({ email: 'user@gmail.com', emailVerified: false }),
      context,
    );
    expect(result.kind).toBe('email_unverified');
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('still refuses a malformed address', async () => {
    const result = await signInWithGoogle(identity({ email: 'not-an-email' }), context);
    expect(result.kind).toBe('wrong_domain');
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('still creates the account with NO role', async () => {
    await signInWithGoogle(identity({ email: 'developer@gmail.com' }), context);
    const data = db.user.create.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toMatch(/role|admin|super/i);
  });

  it('still refuses a SUSPENDED account', async () => {
    db.user.findFirst.mockResolvedValue({
      id: 7n, email: 'user@gmail.com', googleId: 'google-sub-12345',
      status: 'SUSPENDED', emailVerifiedAt: new Date(), name: 'Dev',
    });
    const result = await signInWithGoogle(identity({ email: 'user@gmail.com' }), context);
    expect(result.kind).toBe('suspended');
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('DEV_AUTO_ACTIVATE_GOOGLE_USERS', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  });

  it('is off unless explicitly set, so PENDING remains the default', async () => {
    const result = await signInWithGoogle(identity({ email: 'dev@gmail.com' }), context);
    expect(result.kind).toBe('pending');
    expect(db.user.create.mock.calls[0][0].data.status).toBe('PENDING');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('when on, a first-time user is ACTIVE and signed straight in', async () => {
    process.env.DEV_AUTO_ACTIVATE_GOOGLE_USERS = 'true';
    const result = await signInWithGoogle(identity({ email: 'dev@gmail.com' }), context);
    expect(result).toEqual({ kind: 'signed_in', userId: 99n, redirectTo: '/dashboard' });
    expect(db.user.create.mock.calls[0][0].data.status).toBe('ACTIVE');
    expect(createSession).toHaveBeenCalledOnce();
  });

  it('grants no role even when on — activation is not authorization', async () => {
    process.env.DEV_AUTO_ACTIVATE_GOOGLE_USERS = 'true';
    await signInWithGoogle(identity({ email: 'dev@gmail.com' }), context);
    const data = db.user.create.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toMatch(/role|admin|super/i);
  });

  it('does not resurrect a SUSPENDED account', async () => {
    process.env.DEV_AUTO_ACTIVATE_GOOGLE_USERS = 'true';
    db.user.findFirst.mockResolvedValue({
      id: 7n, email: 'dev@gmail.com', googleId: 'google-sub-12345',
      status: 'SUSPENDED', emailVerifiedAt: new Date(), name: 'Dev',
    });
    const result = await signInWithGoogle(identity({ email: 'dev@gmail.com' }), context);
    expect(result.kind).toBe('suspended');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('only an explicit affirmative enables it', async () => {
    for (const value of ['false', '0', 'no', '', 'ture']) {
      vi.clearAllMocks();
      db.user.findFirst.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ id: 99n });
      process.env.DEV_AUTO_ACTIVATE_GOOGLE_USERS = value;
      const result = await signInWithGoogle(identity({ email: 'dev@gmail.com' }), context);
      expect(result.kind).toBe('pending');
    }
  });
});
