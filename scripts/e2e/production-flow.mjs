/**
 * Deployment verification of the login -> dashboard flow.
 *
 * Read-only apart from creating and destroying its own sessions. Run it
 * against a deployment (HTTPS) or a local production build:
 *
 *   BASE=https://tdms.example.edu \
 *   E2E_IDENTIFIER=you@asiancollege.edu.ph E2E_PASSWORD='…' \
 *   node scripts/e2e/production-flow.mjs
 *
 * Optional, to check every role signs in to its own dashboard:
 *   E2E_ROLE_ACCOUNTS='[["director","dir@…","pw"],["teacher","t@…","pw"]]'
 *
 * A fresh installation has no accounts until /setup is completed, so there
 * are no built-in demo credentials: supply real ones.
 */
import { fetchPage, isPagePath } from './lib/pages.mjs';

const BASE = process.env.BASE;
const IDENTIFIER = process.env.E2E_IDENTIFIER;
const PASSWORD = process.env.E2E_PASSWORD;
if (!BASE || !IDENTIFIER || !PASSWORD) {
  console.error('Set BASE, E2E_IDENTIFIER and E2E_PASSWORD (see the header of this file).');
  process.exit(2);
}
const ROLE_ACCOUNTS = JSON.parse(process.env.E2E_ROLE_ACCOUNTS ?? '[]');
const isHttps = BASE.startsWith('https://');
const GENERIC = 'Invalid username/email or password.';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function makeJar() {
  const jar = new Map();
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(lines) {
      for (const line of lines) {
        const [pair] = line.split(';');
        const i = pair.indexOf('=');
        const n = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
        if (v === '' || /Expires=Thu, 01 Jan 1970/i.test(line)) jar.delete(n); else jar.set(n, v);
      }
    },
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
  return { status: r.status, json, text, location: r.headers.get('location'), raw: r };
}

async function trace(path, jar, max = 10) {
  const chain = [];
  let cur = path;
  for (let i = 0; i < max; i++) {
    const r = await call(cur, { jar });
    chain.push(`${cur} -> ${r.status}${r.location ? ` (${r.location})` : ''}`);
    if (![301, 302, 307, 308].includes(r.status)) return { chain, final: r, path: cur.split('?')[0], looped: false };
    cur = r.location.startsWith('http') ? new URL(r.location).pathname + new URL(r.location).search : r.location;
  }
  return { chain, final: null, path: null, looped: true };
}

const login = (identifier, jar, password = PASSWORD) =>
  call('/api/v1/auth/login', { method: 'POST', jar, body: { identifier, password, remember: false } });

console.log(`\nVerifying ${BASE}\n${'='.repeat(60)}`);

console.log('\n--- Health ---');
{
  const h = await call('/api/v1/health');
  check('health 200 / database ok', h.status === 200 && h.json?.database === 'ok', JSON.stringify(h.json)?.slice(0, 200));
  console.log(`      region=${h.json?.region} source=${h.json?.databaseUrlSource} latency=${h.json?.latencyMs}ms commit=${h.json?.commit}`);
}

console.log('\n--- TEST 1: login -> dashboard ---');
{
  const jar = makeJar();
  const r = await login(IDENTIFIER, jar);
  check('login 200', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`);
  check('session cookie set', jar.has('tdms_session'));
  check('redirectTo /dashboard', r.json?.data?.redirectTo === '/dashboard', r.json?.data?.redirectTo);

  const d = await trace('/dashboard', jar);
  check('dashboard loads without redirect', d.chain.length === 1 && d.final?.status === 200, d.chain.join(' | '));
  check('greeting present', /Good (morning|afternoon|evening)/.test(d.final?.text ?? ''));
}

console.log('\n--- TEST 2: refresh /dashboard stays authenticated ---');
{
  const jar = makeJar();
  await login(IDENTIFIER, jar);
  for (const n of [1, 2, 3]) {
    const d = await call('/dashboard', { jar });
    check(`refresh #${n} still 200`, d.status === 200, `${d.status}`);
  }
}

console.log('\n--- TEST 3: /dashboard while logged out -> /login ---');
{
  const r = await call('/dashboard');
  check('redirected', r.status === 307, `${r.status}`);
  check('to /login with intended path', r.location === '/login?redirect=%2Fdashboard', `${r.location}`);
  const api = await call('/api/v1/students');
  check('API 401 JSON, not HTML', api.status === 401 && api.json?.success === false, `${api.status}`);
}

console.log('\n--- TEST 4: logout destroys the session ---');
{
  const jar = makeJar();
  await login(IDENTIFIER, jar);
  check('signed in', jar.has('tdms_session'));

  const out = await call('/api/v1/auth/logout', { method: 'POST', jar });
  check('logout 200', out.status === 200, `${out.status}`);
  check('cookie cleared', !jar.has('tdms_session'));

  const d = await trace('/dashboard', jar);
  check('dashboard no longer reachable', d.final?.status === 200 && d.path === '/login', d.chain.join(' | '));
}

console.log('\n--- TEST 5: login again after logout ---');
{
  const jar = makeJar();
  await login(IDENTIFIER, jar);
  await call('/api/v1/auth/logout', { method: 'POST', jar });
  const again = await login(IDENTIFIER, jar);
  check('second login 200', again.status === 200, `${again.status}`);
  const d = await call('/dashboard', { jar });
  check('dashboard works again', d.status === 200, `${d.status}`);
}

if (ROLE_ACCOUNTS.length > 0) {
  console.log('\n--- TEST 6: every supplied role ---');
  for (const [expectedRole, identifier, password] of ROLE_ACCOUNTS) {
    const jar = makeJar();
    const r = await login(identifier, jar, password);
    if (r.status !== 200) { check(`${expectedRole}: login`, false, `${r.status} ${r.text.slice(0, 100)}`); continue; }
    const s = await call('/api/v1/auth/session', { jar });
    const got = s.json?.data?.user;
    const dash = await call('/dashboard', { jar });
    check(`${expectedRole.padEnd(12)} dashboard=${dash.status}`, got?.roles?.includes(expectedRole) && dash.status === 200, `roles=${JSON.stringify(got?.roles)} dash=${dash.status}`);
    check(`  ${expectedRole}: no password hash in session payload`, !/\$2[aby]\$|\$argon2/.test(JSON.stringify(s.json)));
  }
}

console.log('\n--- Invalid credentials still rejected ---');
{
  const jar = makeJar();
  const bad = await login(IDENTIFIER, jar, 'definitely-not-the-password');
  check('wrong password 401', bad.status === 401, `${bad.status}`);
  check('generic message', bad.json?.message === GENERIC, bad.json?.message);
  check('no session issued', !jar.has('tdms_session'));

  const unknown = await login('no-such-user-at-all', makeJar());
  check('unknown user 401, same message', unknown.status === 401 && unknown.json?.message === GENERIC);
}

console.log('\n--- Cookie flags ---');
{
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD, remember: false }),
  });
  const line = (r.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('tdms_session=')) ?? '';
  check('HttpOnly', /HttpOnly/i.test(line), line);
  check('SameSite=Lax', /SameSite=Lax/i.test(line), line);
  check('Path=/', /Path=\//i.test(line), line);
  if (isHttps) check('Secure (set on HTTPS)', /Secure/i.test(line), line);
  check('token is not a bare user id', !/tdms_session=\d+;/.test(line));
}

console.log('\n--- Login page itself ---');
{
  const html = await fetch(`${BASE}/login`).then((r) => r.text());
  check('/login serves the app', html.includes('<title>TDMS</title>') && html.includes('id="root"'));
  const l = await call('/login');
  check('/login loader 200', l.status === 200, `${l.status}`);
  check('no outage notice now that the db is up', /"systemUnavailable":false/.test(l.text), l.text.slice(0, 160));

  const jar = makeJar();
  await login(IDENTIFIER, jar);
  const authed = await call('/login', { jar });
  check('/login redirects an authenticated visitor to /dashboard', authed.status === 307 && authed.location === '/dashboard', `${authed.status} ${authed.location}`);
}

console.log(`\n${'='.repeat(60)}\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
