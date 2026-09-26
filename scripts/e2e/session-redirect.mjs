/**
 * Regression checks for the login <-> dashboard redirect handoff.
 *
 * These cover the two bugs that the production failure exposed:
 *   1. a stale session cookie used to ping-pong between /login and
 *      /dashboard forever, because middleware trusted cookie presence;
 *   2. getCurrentUser() cleared the cookie during render, which Next.js
 *      forbids, turning a stale session into a 500.
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Password123!';

/*
 * This suite temporarily deactivates the `teacher` demo account to prove
 * that a mid-session deactivation redirects instead of throwing, and
 * restores it in a finally block. That is a write, so it refuses to run
 * against anything but a local server unless you insist explicitly.
 */
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(BASE);
if (!isLocal && process.env.ALLOW_REMOTE !== '1') {
  console.error(
    [
      `Refusing to run against ${BASE}.`,
      'This suite writes to the database: it deactivates and restores the',
      'teacher demo account. Re-run with ALLOW_REMOTE=1 if that is intended.',
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
    set: (n, v) => jar.set(n, v),
    has: (n) => jar.has(n),
  };
}

async function call(path, { method = 'GET', body, jar, redirect = 'manual' } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method, redirect,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar ? { cookie: jar.header() } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (jar) jar.absorb(r);
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
    if (r.status !== 307 && r.status !== 308 && r.status !== 302) return { chain, final: r, looped: false };
    current = r.location.startsWith('http') ? new URL(r.location).pathname + new URL(r.location).search : r.location;
  }
  return { chain, final: null, looped: true };
}

console.log('\n=== A stale/garbage session cookie must not loop ===');
{
  const jar = makeJar();
  jar.set('tdms_session', 'f'.repeat(64));

  const toDash = await trace('/dashboard', jar);
  check('/dashboard settles (no redirect loop)', !toDash.looped, toDash.chain.join(' | '));
  check('  and lands on a 200 page', toDash.final?.status === 200, `chain: ${toDash.chain.join(' | ')}`);
  check('  which is the login form', (toDash.final?.text ?? '').includes('Username or Email'));

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
  check('settles on the login form', !t.looped && t.final?.status === 200, t.chain.join(' | '));
}

console.log('\n=== A genuine session: /login hands off to /dashboard ===');
{
  const jar = makeJar();
  const login = await call('/api/auth/login', {
    method: 'POST', jar,
    body: { identifier: 'director', password: PASSWORD, remember: false },
  });
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
  // Previously getCurrentUser() tried to delete the cookie during render,
  // which Next.js forbids, so this path threw instead of redirecting.
  // Windows needs a file:// URL for an absolute dynamic import.
  const { pathToFileURL } = await import('node:url');
  const clientUrl = pathToFileURL(process.cwd() + '/node_modules/@prisma/client/default.js').href;
  const { PrismaClient } = await import(clientUrl);
  const prisma = new PrismaClient();

  const jar = makeJar();
  await call('/api/auth/login', {
    method: 'POST', jar,
    body: { identifier: 'teacher', password: PASSWORD, remember: false },
  });
  check('teacher signed in', jar.has('tdms_session'));

  const user = await prisma.user.findFirst({ where: { username: 'teacher' }, select: { id: true } });
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  try {
    const t = await trace('/dashboard', jar);
    check('deactivated -> redirected, not 500', !t.looped && t.final?.status === 200, t.chain.join(' | '));
    check('  lands on the login form', (t.final?.text ?? '').includes('Username or Email'));

    const api = await call('/api/students', { jar });
    check('API rejects the deactivated session (401)', api.status === 401, `${api.status}`);
  } finally {
    // Always restore, even if an assertion above threw.
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    const restored = await prisma.user.findFirst({ where: { username: 'teacher' }, select: { isActive: true } });
    check('teacher reactivated (cleanup)', restored.isActive === true);
    await prisma.$disconnect();
  }
}

console.log('\n=== /api/health ===');
{
  const h = await call('/api/health');
  check('200 when healthy', h.status === 200, `${h.status}`);
  check('reports database ok', h.json?.database === 'ok');
  check('reports DATABASE_URL present', h.json?.env?.DATABASE_URL === true);
  check('leaks no connection string', !h.text.includes('postgres') && !h.text.includes('@'));
  check('reachable without a session', h.json?.status === 'ok');
}

console.log(`\n================  ${passed} passed, ${failed} failed  ================\n`);
process.exit(failed === 0 ? 0 : 1);
