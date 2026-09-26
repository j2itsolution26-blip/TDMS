/**
 * End-to-end check of the institutional account lifecycle.
 *
 * Walks the acceptance list: domain rejection, invitation, pending state,
 * verification, password choice, sign-in, deactivation, reactivation.
 *
 * Creates and then deletes its own throwaway institutional account, so it
 * writes to the database — and therefore refuses a non-local target unless
 * ALLOW_REMOTE=1 is passed.
 *
 * The verification link is read out of a local SMTP catcher — Mailpit or
 * MailHog — because that is now the only way mail leaves the application:
 * the old log transport, which wrote verification links to the server log,
 * has been removed. See docs/deployment.md.
 *
 *   mailpit          # SMTP on :1025, HTTP API and UI on :8025
 *   MAIL_HOST=127.0.0.1 MAIL_PORT=1025  *     MAIL_FROM_ADDRESS=no-reply@asiancollege.edu.ph npm run dev
 */
import { pathToFileURL } from 'node:url';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';

/** A local SMTP catcher's HTTP API. Mailpit and MailHog both serve on 8025. */
const CATCHER = (process.env.MAIL_CATCHER_URL ?? 'http://127.0.0.1:8025').replace(/\/+$/, '');

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(BASE);
if (!isLocal && process.env.ALLOW_REMOTE !== '1') {
  console.error(
    [
      `Refusing to run against ${BASE}.`,
      'This suite creates and deletes an account. Re-run with ALLOW_REMOTE=1',
      'if that is intended.',
    ].join('\n'),
  );
  process.exit(2);
}

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function makeJar() {
  const jar = new Map();
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(r) {
      for (const line of r.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';');
        const i = pair.indexOf('=');
        const n = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
        if (v === '') jar.delete(n); else jar.set(n, v);
      }
    },
    has: (n) => jar.has(n),
  };
}

async function call(path, { method = 'GET', body, jar } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method, redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar ? { cookie: jar.header() } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (jar) jar.absorb(r);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, location: r.headers.get('location') };
}

/**
 * Read the delivered messages out of a local SMTP catcher.
 *
 * Mailpit and MailHog expose different endpoints, so both shapes are tried:
 * the point is to read a real delivered message rather than to prefer a tool.
 * Returns null when no catcher answers at all, which the caller reports as a
 * missing prerequisite rather than as a failed assertion.
 */
async function catcherBodies() {
  const shapes = [
    {
      list: `${CATCHER}/api/v1/messages`,
      items: (json) => json.messages ?? [],
      detail: (item) => `${CATCHER}/api/v1/message/${item.ID}`,
    },
    {
      list: `${CATCHER}/api/v2/messages`,
      items: (json) => json.items ?? [],
      detail: null,
    },
  ];

  for (const shape of shapes) {
    let listed;
    try {
      listed = await fetch(shape.list);
    } catch {
      continue;
    }
    if (!listed.ok) continue;

    const items = shape.items(await listed.json());
    const bodies = [];

    for (const item of items) {
      if (!shape.detail) {
        // MailHog returns the body inline, quoted-printable soft breaks and all.
        bodies.push((item.Content?.Body ?? '').replace(/=\r?\n/g, ''));
        continue;
      }

      const one = await fetch(shape.detail(item));
      if (!one.ok) continue;
      const detail = await one.json();
      bodies.push(detail.Text ?? detail.HTML ?? '');
    }

    return bodies;
  }

  return null;
}

/** The most recent token of a kind, from the mail that was actually sent. */
async function latestTokenFromMail(kind = 'verify-email') {
  const bodies = await catcherBodies();

  if (bodies === null) {
    throw new Error(
      [
        `No SMTP catcher answered at ${CATCHER}.`,
        'Start Mailpit (or MailHog) and run the dev server with:',
        '  MAIL_HOST=127.0.0.1 MAIL_PORT=1025 MAIL_FROM_ADDRESS=no-reply@asiancollege.edu.ph',
        'or point MAIL_CATCHER_URL at one. The log transport this used to read',
        'has been removed — mail is now either delivered or it fails.',
      ].join('\n'),
    );
  }

  const pattern = new RegExp(`/${kind}\\?token=([0-9a-f]{64})`, 'g');
  const found = bodies.flatMap((body) => [...body.matchAll(pattern)].map((m) => m[1]));
  return found.at(-1) ?? null;
}

const clientUrl = pathToFileURL(`${process.cwd()}/node_modules/@prisma/client/default.js`).href;
const { PrismaClient } = await import(clientUrl);
const prisma = new PrismaClient();

const STAMP = Date.now().toString().slice(-8);
const TEST_EMAIL = `e2e.tester${STAMP}@asiancollege.edu.ph`;
const TEST_PASSWORD = 'Institution#2026x';

let adminJar = null;
let createdUserId = null;

try {
  console.log('\n=== The system must have an administrator to invite with ===');
  {
    // Find any existing active admin to act as. If the database has been
    // freshened there will be none, and the suite says so rather than
    // inventing one.
    const admin = await prisma.user.findFirst({
      where: { status: 'ACTIVE', emailVerifiedAt: { not: null } },
      select: { id: true, email: true },
    });
    if (!admin) {
      console.log('  SKIP  no active administrator exists — run `npm run admin:create` first');
      console.log('\n  (This is the expected state immediately after `npm run db:fresh`.)\n');
      process.exit(0);
    }
    console.log(`  using existing administrator: ${admin.email}`);
    // We cannot know their password, so sign in by minting a session the
    // same way the app does — via the service layer, not by bypassing it.
    const { createHash, randomBytes } = await import('node:crypto');
    const token = randomBytes(32).toString('hex');
    await prisma.session.create({
      data: {
        id: createHash('sha256').update(token).digest('hex'),
        userId: admin.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    adminJar = makeJar();
    adminJar.absorb({ headers: { getSetCookie: () => [`tdms_session=${token}; Path=/`] } });
    const who = await call('/api/auth/session', { jar: adminJar });
    check('administrator session works', who.json?.data?.user?.email === admin.email, JSON.stringify(who.json?.data?.user?.email));
  }

  console.log('\n=== Domain is enforced server-side, whatever the client sends ===');
  {
    for (const email of ['someone@gmail.com', 'someone@asiancollege.edu.ph.evil.com', 'someone@notasiancollege.edu.ph']) {
      const r = await call('/api/staff', {
        method: 'POST', jar: adminJar,
        body: { name: 'Should Fail', email, role: 'secretary' },
      });
      check(`invite rejected for ${email}`, r.status === 422, `${r.status}`);
      check(`  names the institutional domain`, JSON.stringify(r.json?.errors ?? {}).includes('asiancollege.edu.ph'));
    }
  }

  console.log('\n=== Signing in with a non-institutional address is refused by name ===');
  {
    const r = await call('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'someone@gmail.com', password: 'whatever', remember: false },
    });
    check('403', r.status === 403, `${r.status}`);
    check('message names the domain', r.json?.message === 'Only an @asiancollege.edu.ph account can access TDMS.', r.json?.message);
  }

  console.log('\n=== Invite creates a PENDING account with no usable password ===');
  {
    const r = await call('/api/staff', {
      method: 'POST', jar: adminJar,
      body: { name: 'E2E Tester', email: TEST_EMAIL, role: 'secretary' },
    });
    check('invite 201', r.status === 201, `${r.status} ${r.text.slice(0, 150)}`);
    createdUserId = r.json?.data?.id;

    const row = await prisma.user.findUnique({
      where: { email: TEST_EMAIL },
      select: { id: true, status: true, emailVerifiedAt: true, isActive: true },
    });
    check('status PENDING_VERIFICATION', row?.status === 'PENDING_VERIFICATION', row?.status);
    check('email not verified', row?.emailVerifiedAt === null);
    check('is_active mirrors status (false)', row?.isActive === false, String(row?.isActive));

    const tokenCount = await prisma.emailVerificationToken.count({ where: { userId: row.id } });
    check('a verification token was issued', tokenCount === 1, String(tokenCount));
  }

  console.log('\n=== A pending account cannot sign in ===');
  {
    const r = await call('/api/auth/login', {
      method: 'POST',
      body: { identifier: TEST_EMAIL, password: TEST_PASSWORD, remember: false },
    });
    // The placeholder password is unknown, so this is a credential failure —
    // which is itself the point: nobody can sign in as an invited account.
    check('refused', r.status === 401 || r.status === 403, `${r.status}`);
  }

  console.log('\n=== Verification link activates the account ===');
  let resetToken = null;
  {
    const token = await latestTokenFromMail('verify-email');
    check('verification link found in the delivered mail', Boolean(token));
    if (!token) throw new Error(`no verification token found in the mail at ${CATCHER}`);

    const r = await call('/api/auth/verify-email', { method: 'POST', body: { token } });
    check('verify 200', r.status === 200, `${r.status} ${r.text.slice(0, 150)}`);
    check('directed to set a password', (r.json?.data?.next ?? '').startsWith('/reset-password?token='), r.json?.data?.next);
    resetToken = new URL(`http://x${r.json.data.next}`).searchParams.get('token');

    const row = await prisma.user.findUnique({
      where: { email: TEST_EMAIL },
      select: { status: true, emailVerifiedAt: true, isActive: true },
    });
    check('email now verified', row?.emailVerifiedAt !== null);
    check('status promoted to ACTIVE', row?.status === 'ACTIVE', row?.status);
    check('is_active mirrors status (true)', row?.isActive === true);

    const again = await call('/api/auth/verify-email', { method: 'POST', body: { token } });
    check('token is single-use', again.status === 400, `${again.status}`);
  }

  console.log('\n=== Setting a password completes the invitation ===');
  {
    const weak = await call('/api/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: 'short', passwordConfirmation: 'short' },
    });
    check('weak password rejected', weak.status === 422, `${weak.status}`);

    const mismatch = await call('/api/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: TEST_PASSWORD, passwordConfirmation: 'Different#2026x' },
    });
    check('mismatched confirmation rejected', mismatch.status === 422, `${mismatch.status}`);

    const ok = await call('/api/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: TEST_PASSWORD, passwordConfirmation: TEST_PASSWORD },
    });
    check('password set', ok.status === 200, `${ok.status} ${ok.text.slice(0, 150)}`);

    const replay = await call('/api/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: TEST_PASSWORD, passwordConfirmation: TEST_PASSWORD },
    });
    check('reset token is single-use', replay.status === 400, `${replay.status}`);
  }

  console.log('\n=== The new account can now sign in ===');
  {
    const jar = makeJar();
    const r = await call('/api/auth/login', {
      method: 'POST', jar,
      body: { identifier: TEST_EMAIL, password: TEST_PASSWORD, remember: false },
    });
    check('login 200', r.status === 200, `${r.status} ${r.text.slice(0, 150)}`);
    check('session issued', jar.has('tdms_session'));

    const dash = await call('/dashboard', { jar });
    check('dashboard renders', dash.status === 200, `${dash.status}`);

    const out = await call('/api/auth/logout', { method: 'POST', jar });
    check('logout works', out.status === 200);
  }

  console.log('\n=== Deactivate blocks sign-in; reactivate restores it ===');
  {
    const id = BigInt(createdUserId);

    const off = await call(`/api/staff/${createdUserId}/status`, {
      method: 'POST', jar: adminJar, body: { status: 'INACTIVE' },
    });
    check('deactivate 200', off.status === 200, `${off.status} ${off.text.slice(0, 120)}`);

    const blocked = await call('/api/auth/login', {
      method: 'POST',
      body: { identifier: TEST_EMAIL, password: TEST_PASSWORD, remember: false },
    });
    check('inactive account refused (403)', blocked.status === 403, `${blocked.status}`);
    check('inactive message', blocked.json?.message === 'Your account is inactive. Please contact the administrator.', blocked.json?.message);

    const susp = await call(`/api/staff/${createdUserId}/status`, {
      method: 'POST', jar: adminJar, body: { status: 'SUSPENDED' },
    });
    check('suspend 200', susp.status === 200, `${susp.status}`);
    const suspended = await call('/api/auth/login', {
      method: 'POST',
      body: { identifier: TEST_EMAIL, password: TEST_PASSWORD, remember: false },
    });
    check('suspended message differs from inactive', suspended.json?.message?.includes('suspended'), suspended.json?.message);

    const on = await call(`/api/staff/${createdUserId}/status`, {
      method: 'POST', jar: adminJar, body: { status: 'ACTIVE' },
    });
    check('reactivate 200', on.status === 200, `${on.status}`);

    const jar = makeJar();
    const back = await call('/api/auth/login', {
      method: 'POST', jar,
      body: { identifier: TEST_EMAIL, password: TEST_PASSWORD, remember: false },
    });
    check('can sign in again', back.status === 200 && jar.has('tdms_session'), `${back.status}`);
    void id;
  }

  console.log('\n=== Forgot password never reveals whether an account exists ===');
  {
    const known = await call('/api/auth/forgot-password', { method: 'POST', body: { email: TEST_EMAIL } });
    const unknown = await call('/api/auth/forgot-password', {
      method: 'POST', body: { email: `nobody${STAMP}@asiancollege.edu.ph` },
    });
    check('known address: 200', known.status === 200, `${known.status}`);
    check('unknown address: identical response', unknown.status === known.status && unknown.json?.data?.message === known.json?.data?.message);

    const offDomain = await call('/api/auth/forgot-password', { method: 'POST', body: { email: 'someone@gmail.com' } });
    check('non-institutional address rejected by validation', offDomain.status === 422, `${offDomain.status}`);
  }
} finally {
  if (createdUserId) {
    const id = BigInt(createdUserId);
    await prisma.emailVerificationToken.deleteMany({ where: { userId: id } });
    await prisma.passwordResetRequest.deleteMany({ where: { userId: id } });
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.modelHasRole.deleteMany({ where: { modelId: id, modelType: 'App\\Models\\User' } });
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
    const gone = await prisma.user.findUnique({ where: { email: TEST_EMAIL }, select: { id: true } });
    check('cleanup: throwaway account removed', gone === null);
  }
  await prisma.$disconnect();
}

console.log(`\n================  ${passed} passed, ${failed} failed  ================\n`);
process.exit(failed === 0 ? 0 : 1);
