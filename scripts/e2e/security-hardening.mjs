// End-to-end check of the security hardening: atomic sign-in and reset
// throttles, the public/Super-Admin split of /api/v1/health, and the security
// headers on the API and on the app itself.
//
//   npm run build && NODE_ENV=production PORT=3001 npm start
//   npm run test:security                 (BASE=http://host:port to point elsewhere)
//
// Throwaway accounts only (marker ZZE2E…), removed at the end. Local database
// only — see _guard.mjs.
import './_guard.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Sh#Check${stamp}xY`;
const created = [];
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 300)}`}`);
}

async function makeUser(key, role) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: { name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 10), emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  return u;
}
const login = (identifier, password) => fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password, remember: false }) });
const loginKeys = (identifier) => prisma.legacyCache.findMany({ where: { key: { startsWith: `tdms:login:${identifier.toLowerCase()}|` } } });
const clearKeys = (prefix) => prisma.legacyCache.deleteMany({ where: { key: { startsWith: prefix } } });

try {
  console.log(`Security hardening e2e against ${BASE} (marker ${M})\n`);

  console.log('Sign-in throttle (atomic)');
  const victim = await makeUser('victim', 'teacher');
  const burst = await Promise.all(Array.from({ length: 20 }, () => login(victim.email, 'wrong-password')));
  const statuses = burst.map((r) => r.status);
  const evaluated = statuses.filter((s) => s === 401).length;
  check('20 parallel wrong passwords: exactly 5 are evaluated, 15 refused with 429', evaluated === 5 && statuses.filter((s) => s === 429).length === 15, statuses);
  const counter = (await loginKeys(victim.email))[0];
  check('every attempt was counted (no lost updates)', counter && Number(counter.value) === 20, counter?.value);
  check('the correct password is refused while locked', (await login(victim.email, PASSWORD)).status === 429);
  await clearKeys(`tdms:login:${victim.email.toLowerCase()}|`);
  for (let i = 0; i < 4; i++) await login(victim.email, 'wrong-password');
  check('after the window: the correct password signs in', (await login(victim.email, PASSWORD)).status === 200);
  const after = await Promise.all(Array.from({ length: 4 }, () => login(victim.email, 'wrong-password')));
  check('a successful sign-in resets the count (4 more failures are still evaluated)', after.every((r) => r.status === 401), after.map((r) => r.status));
  await clearKeys(`tdms:login:${victim.email.toLowerCase()}|`);

  console.log('\nPassword-reset throttle');
  const resets = await Promise.all(Array.from({ length: 12 }, () => fetch(`${BASE}/api/v1/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: victim.email }) })));
  const bodies = await Promise.all(resets.map((r) => r.text()));
  check('12 parallel reset requests all get the same neutral answer', resets.every((r) => r.status === 200) && new Set(bodies).size === 1, resets.map((r) => r.status));
  const resetCounter = (await loginKeys(`reset:${victim.email}`))[0];
  check('…and all 12 were counted atomically', resetCounter && Number(resetCounter.value) === 12, resetCounter?.value);
  await clearKeys(`tdms:login:reset:${victim.email.toLowerCase()}|`);

  console.log('\n/api/v1/health');
  const anon = await fetch(`${BASE}/api/v1/health`);
  const anonJson = await anon.json();
  check('anonymous: database diagnostics, detail "public"', anon.status === 200 && anonJson.database === 'ok' && anonJson.detail === 'public' && anonJson.env?.DATABASE_URL === true, anonJson);
  check('anonymous: no mail, domain, Google or admin access-control settings', !('mail' in anonJson) && !('adminAccessControl' in anonJson) && !('domainPolicy' in anonJson) && !('googleSignIn' in anonJson) && !('autoActivateNewGoogleUsers' in anonJson), Object.keys(anonJson));
  const teacherCookie = await login(victim.email, PASSWORD).then((r) => (r.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('tdms_session='))?.split(';')[0]);
  const asTeacher = await (await fetch(`${BASE}/api/v1/health`, { headers: { cookie: teacherCookie } })).json();
  check('a signed-in non-Super-Admin also gets only the public detail', asTeacher.detail === 'public' && !('mail' in asTeacher));
  const owner = await makeUser('owner', 'super_admin');
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({ data: { id: createHash('sha256').update(token).digest('hex'), userId: owner.id, expiresAt: new Date(Date.now() + 3600_000) } });
  const full = await (await fetch(`${BASE}/api/v1/health`, { headers: { cookie: `tdms_session=${token}` } })).json();
  check('the Super Admin gets the full configuration detail', full.detail === 'full' && 'mail' in full && 'adminAccessControl' in full && 'domainPolicy' in full, Object.keys(full));
  check('…which still never includes a secret value', !JSON.stringify(full).match(/postgres(ql)?:\/\/|re_[A-Za-z0-9]{10,}/));

  console.log('\nSecurity headers');
  const api = await fetch(`${BASE}/api/v1/health`);
  const page = await fetch(`${BASE}/login`);
  for (const [label, r] of [['API', api], ['app page', page]]) {
    const h = r.headers;
    const production = Boolean(h.get('strict-transport-security'));
    check(`${label}: nosniff, DENY framing, referrer policy, permissions policy`, h.get('x-content-type-options') === 'nosniff' && h.get('x-frame-options') === 'DENY' && !!h.get('referrer-policy') && !!h.get('permissions-policy'));
    check(`${label}: HSTS and a report-only CSP (production server)`, production && /script-src 'self'/.test(h.get('content-security-policy-report-only') ?? ''), { hsts: h.get('strict-transport-security'), csp: h.get('content-security-policy-report-only') });
  }
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    for (const id of created) {
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.modelHasRole.deleteMany({ where: { modelId: id, modelType: 'App\\Models\\User' } });
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.legacyCache.deleteMany({ where: { key: { contains: M.toLowerCase() } } });
    await prisma.passwordResetToken.deleteMany({ where: { email: { contains: M.toLowerCase() } } });
  } catch (e) {
    console.log('cleanup failed:', e.message);
  }
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
}
