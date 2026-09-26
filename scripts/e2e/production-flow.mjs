/**
 * Production verification of the login -> dashboard flow.
 *
 * Read-only apart from creating and destroying its own sessions. Mirrors the
 * requested test list, run against the real deployment over HTTPS.
 */
const BASE = process.env.BASE ?? 'https://tdms-swart.vercel.app';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Password123!';
const isHttps = BASE.startsWith('https://');

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
  return { status: r.status, json, text, location: r.headers.get('location'), raw: r };
}

async function trace(path, jar, max = 10) {
  const chain = []; let cur = path;
  for (let i = 0; i < max; i += 1) {
    const r = await call(cur, { jar });
    chain.push(`${cur} -> ${r.status}`);
    if (![301, 302, 307, 308].includes(r.status)) return { chain, final: r, looped: false };
    cur = r.location.startsWith('http') ? new URL(r.location).pathname + new URL(r.location).search : r.location;
  }
  return { chain, final: null, looped: true };
}

const login = (identifier, jar, password = PASSWORD) =>
  call('/api/auth/login', { method: 'POST', jar, body: { identifier, password, remember: false } });

console.log(`\nVerifying ${BASE}\n${'='.repeat(60)}`);

console.log('\n--- Health ---');
{
  const h = await call('/api/health');
  check('health 200 / status ok', h.status === 200 && h.json?.database === 'ok', JSON.stringify(h.json));
  console.log(`      region=${h.json?.region} source=${h.json?.databaseUrlSource} latency=${h.json?.latencyMs}ms commit=${h.json?.commit}`);
}

console.log('\n--- TEST 1: demo USERNAME -> login -> dashboard ---');
{
  const jar = makeJar();
  const r = await login('director', jar);
  check('login 200', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`);
  check('session cookie set', jar.has('tdms_session'));
  check('redirectTo /dashboard', r.json?.data?.redirectTo === '/dashboard');

  const d = await trace('/dashboard', jar);
  check('dashboard renders without redirect', d.chain.length === 1 && d.final?.status === 200, d.chain.join(' | '));
  check('greeting present', /Good (morning|afternoon|evening)/.test(d.final?.text ?? ''));
  check('shows the user first name', (d.final?.text ?? '').includes('Dev'));
}

console.log('\n--- TEST 2: demo EMAIL -> login -> dashboard ---');
{
  const jar = makeJar();
  const r = await login('director@tdms.test', jar);
  check('login 200', r.status === 200, `${r.status}`);
  const d = await trace('/dashboard', jar);
  check('dashboard renders', d.final?.status === 200, d.chain.join(' | '));
}

console.log('\n--- TEST 3: refresh /dashboard stays authenticated ---');
{
  const jar = makeJar();
  await login('secretary', jar);
  for (const n of [1, 2, 3]) {
    const d = await call('/dashboard', { jar });
    check(`refresh #${n} still 200`, d.status === 200, `${d.status}`);
  }
}

console.log('\n--- TEST 4: /dashboard while logged out -> /login ---');
{
  const r = await call('/dashboard');
  check('307 redirect', r.status === 307, `${r.status}`);
  check('to /login with intended path', r.location === '/login?redirect=%2Fdashboard', `${r.location}`);
  const api = await call('/api/students');
  check('API 401 JSON, not HTML', api.status === 401 && api.json?.success === false, `${api.status}`);
}

console.log('\n--- TEST 5: logout destroys the session ---');
{
  const jar = makeJar();
  await login('teacher', jar);
  check('signed in', jar.has('tdms_session'));

  const out = await call('/api/auth/logout', { method: 'POST', jar });
  check('logout 200', out.status === 200, `${out.status}`);
  check('cookie cleared', !jar.has('tdms_session'));

  const d = await trace('/dashboard', jar);
  check('dashboard no longer reachable', d.final?.status === 200 && (d.final?.text ?? '').includes('Username or Email'), d.chain.join(' | '));
}

console.log('\n--- TEST 6: login again after logout ---');
{
  const jar = makeJar();
  await login('teacher', jar);
  await call('/api/auth/logout', { method: 'POST', jar });
  const again = await login('teacher', jar);
  check('second login 200', again.status === 200, `${again.status}`);
  const d = await call('/dashboard', { jar });
  check('dashboard works again', d.status === 200, `${d.status}`);
}

console.log('\n--- TEST 7: every demo role ---');
{
  const roles = [
    ['superadmin', 'super_admin'],
    ['admin', 'admin'],
    ['director', 'director'],
    ['coordinator', 'coordinator'],
    ['secretary', 'secretary'],
    ['teacher', 'teacher'],
    ['student', 'student'],
  ];
  for (const [username, expectedRole] of roles) {
    const jar = makeJar();
    const r = await login(username, jar);
    if (r.status !== 200) { check(`${username}: login`, false, `${r.status} ${r.text.slice(0, 100)}`); continue; }

    const s = await call('/api/auth/session', { jar });
    const got = s.json?.data?.user;
    const dash = await call('/dashboard', { jar });

    check(
      `${username.padEnd(12)} role=${expectedRole.padEnd(12)} dashboard=${dash.status}`,
      got?.roles?.includes(expectedRole) && dash.status === 200,
      `roles=${JSON.stringify(got?.roles)} dash=${dash.status}`,
    );
    check(`  ${username}: no password hash in session payload`, !JSON.stringify(s.json).includes('$2'));
  }
}

console.log('\n--- Invalid credentials still rejected ---');
{
  const jar = makeJar();
  const bad = await login('director', jar, 'definitely-not-the-password');
  check('wrong password 401', bad.status === 401, `${bad.status}`);
  check('generic message', bad.json?.message === 'Invalid username/email or password.', bad.json?.message);
  check('no session issued', !jar.has('tdms_session'));

  const unknown = await login('no-such-user-at-all', makeJar());
  check('unknown user 401, same message', unknown.status === 401 && unknown.json?.message === 'Invalid username/email or password.');
}

console.log('\n--- Cookie flags over HTTPS ---');
{
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'director', password: PASSWORD, remember: false }),
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
  const l = await call('/login');
  check('/login 200', l.status === 200, `${l.status}`);
  check('renders the branded form', l.text.includes('Username or Email') && l.text.includes('TVET DIPLOMA MANAGEMENT SYSTEM'));
  check('no outage banner now that the db is up', !l.text.includes('temporarily unavailable'));
  check('no error boundary', !l.text.includes('Something went wrong'));

  const jar = makeJar();
  await login('director', jar);
  const authed = await call('/login', { jar });
  check('/login redirects an authenticated visitor to /dashboard', authed.status === 307 && authed.location === '/dashboard', `${authed.status} ${authed.location}`);
}

console.log(`\n${'='.repeat(60)}\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
