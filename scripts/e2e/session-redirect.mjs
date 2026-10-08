/**
 * Regression checks for the login <-> dashboard redirect handoff.
 *
 * These cover the two bugs that a production failure once exposed:
 *   1. a stale session cookie used to ping-pong between /login and
 *      /dashboard forever, because the edge trusted cookie presence;
 *   2. getCurrentUser() cleared the cookie while reading it, turning a
 *      stale session into a 500.
 *
 * In the React + Fastify app a page's redirects come from its server loader
 * (/api/v1/pages/<path>); lib/pages.mjs turns those back into the 307s these
 * checks were written against, so a loop is still detectable as a loop.
 *
 * Self-contained: it creates a throwaway Director and Diploma Instructor in
 * the database, deactivates one mid-session, and deletes both at the end. That
 * is a write, so it refuses to run against anything but a local server unless
 * you insist explicitly.
 *
 *   BASE=http://localhost:3000 DATABASE_URL=… npm run test:e2e
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fetchPage, isPagePath } from './lib/pages.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(BASE);
if (!isLocal && process.env.ALLOW_REMOTE !== '1') {
  console.error(
    [
      `Refusing to run against ${BASE}.`,
      'This suite writes to the database: it creates, deactivates and deletes',
      'throwaway accounts. Re-run with ALLOW_REMOTE=1 if that is intended.',
    ].join('\n'),
  );
  process.exit(2);
}

const prisma = new PrismaClient();
const stamp = Date.now();
const PASSWORD = `Sess#Check${stamp}xY`;
const created = [];

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function makeUser(role) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({
    data: {
      name: `Session ${role} ${stamp}`,
      email: `session-${role}-${stamp}@example.test`,
      password: await bcrypt.hash(PASSWORD, 10),
      emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date(),
    },
  });
  created.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  return u;
}

function makeJar() {
  const jar = new Map();
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(setCookies) {
      for (const line of setCookies) {
        const [pair] = line.split(';');
        const i = pair.indexOf('=');
        const n = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
        if (v === '' || /Expires=Thu, 01 Jan 1970/i.test(line)) jar.delete(n); else jar.set(n, v);
      }
    },
    set: (n, v) => jar.set(n, v),
    has: (n) => jar.has(n),
  };
}

async function call(path, { method = 'GET', body, jar } = {}) {
  const cookie = jar?.header() ? { cookie: jar.header() } : {};
  if (method === 'GET' && isPagePath(path)) {
    const page = await fetchPage(BASE, path, cookie);
    if (jar) jar.absorb(page.setCookie);
    return { status: page.status, text: page.text, location: page.location };
  }
  const r = await fetch(`${BASE}${path}`, {
    method, redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (jar) jar.absorb(r.headers.getSetCookie?.() ?? []);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, location: r.headers.get('location') };
}

/** Follow redirects by hand so a loop is detectable rather than fatal. */
async function trace(path, jar, max = 12) {
  const chain = [];
  let current = path;
  for (let i = 0; i < max; i += 1) {
    const r = await call(current, { jar });
    chain.push(`${current} -> ${r.status}`);
    if (r.status !== 307 && r.status !== 308 && r.status !== 302) return { chain, final: r, path: current.split('?')[0], looped: false };
    current = r.location.startsWith('http') ? new URL(r.location).pathname + new URL(r.location).search : r.location;
  }
  return { chain, final: null, path: null, looped: true };
}

const signIn = async (jar, email) =>
  call('/api/v1/auth/login', { method: 'POST', jar, body: { identifier: email, password: PASSWORD, remember: false } });

try {
  const director = await makeUser('director');
  const teacher = await makeUser('teacher');

  console.log('\n=== A stale/garbage session cookie must not loop ===');
  {
    const jar = makeJar();
    jar.set('tdms_session', 'f'.repeat(64));

    const toDash = await trace('/dashboard', jar);
    check('/dashboard settles (no redirect loop)', !toDash.looped, toDash.chain.join(' | '));
    check('  and lands on a 200 page', toDash.final?.status === 200, `chain: ${toDash.chain.join(' | ')}`);
    check('  which is the login form', toDash.path === '/login', toDash.path);

    const toLogin = await trace('/login', jar);
    check('/login settles (no redirect loop)', !toLogin.looped, toLogin.chain.join(' | '));
    check('  renders the form rather than 500', toLogin.final?.status === 200, `${toLogin.final?.status}`);
  }

  console.log('\n=== An expired session behaves the same way ===');
  {
    // A syntactically valid but unknown token is the same class of problem.
    const jar = makeJar();
    jar.set('tdms_session', '0123456789abcdef'.repeat(4));
    const t = await trace('/dashboard', jar);
    check('settles on the login form', !t.looped && t.final?.status === 200 && t.path === '/login', t.chain.join(' | '));
  }

  console.log('\n=== A genuine session: /login hands off to /dashboard ===');
  {
    const jar = makeJar();
    const login = await signIn(jar, director.email);
    check('signed in', login.status === 200 && jar.has('tdms_session'), `${login.status}`);

    const toLogin = await call('/login', { jar });
    check('/login redirects an authenticated visitor', toLogin.status === 307, `${toLogin.status}`);
    check('  to /dashboard', toLogin.location === '/dashboard', `${toLogin.location}`);

    const dash = await trace('/dashboard', jar);
    check('/dashboard renders directly (no redirect)', dash.chain.length === 1 && dash.final?.status === 200, dash.chain.join(' | '));
    check('  shows the greeting', /Good (morning|afternoon|evening)/.test(dash.final?.text ?? ''));

    // And the handoff terminates: no oscillation between the two.
    const again = await trace('/login', jar);
    check('/login -> /dashboard terminates', !again.looped && again.final?.status === 200, again.chain.join(' | '));
  }

  console.log('\n=== A deactivated account mid-session does not 500 ===');
  {
    const jar = makeJar();
    await signIn(jar, teacher.email);
    check('teacher signed in', jar.has('tdms_session'));

    await prisma.user.update({ where: { id: teacher.id }, data: { isActive: false, status: 'INACTIVE' } });
    const t = await trace('/dashboard', jar);
    check('deactivated -> redirected, not 500', !t.looped && t.final?.status === 200, t.chain.join(' | '));
    check('  lands on the login form', t.path === '/login', t.path);

    const api = await call('/api/v1/students', { jar });
    check('API rejects the deactivated session (401)', api.status === 401, `${api.status}`);
  }

  console.log('\n=== /api/v1/health ===');
  {
    const h = await call('/api/v1/health');
    check('200 when healthy', h.status === 200, `${h.status}`);
    check('reports database ok', h.json?.database === 'ok');
    check('reports DATABASE_URL present', h.json?.env?.DATABASE_URL === true);
    check('leaks no connection string', !h.text.includes('postgres') && !h.text.includes('@'));
    check('reachable without a session', h.json?.status === 'ok');
  }
} finally {
  for (const id of created) {
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.modelHasRole.deleteMany({ where: { modelId: id, modelType: 'App\\Models\\User' } });
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  console.log(`\nremoved ${created.length} throwaway account(s)`);
  await prisma.$disconnect();
}

console.log(`\n================  ${passed} passed, ${failed} failed  ================\n`);
process.exit(failed === 0 ? 0 : 1);
