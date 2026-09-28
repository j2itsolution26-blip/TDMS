/**
 * Live walk-through of staff onboarding: an Admin adds a Teacher with a
 * temporary password, the Teacher signs in, is made to choose their own, and
 * gets in. Then a reset, and the old password stops working.
 *
 *   npm run test:staff        (with a dev server running)
 *
 * Self-contained: it creates a throwaway Admin (with a known password and a
 * known access code, straight into the database), drives everything through the
 * real API, and deletes every account it made on the way out.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.TDMS_BASE ?? 'http://localhost:3000';
const prisma = new PrismaClient();
const stamp = Date.now();
const ADMIN = { email: `e2e-staff-admin-${stamp}@example.test`, password: `E2e#Admin${stamp}xY`, code: '731604' };
const TEACHER_EMAIL = `e2e-teacher-${stamp}@example.test`;
const TEMP = `E2e#Temp${stamp}xY`;
const OWN = `E2e#Own${stamp}xY`;
const created = [];

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log(`  ok   ${label}`); return; }
  failures.push(label);
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${detail}`}`);
}

function jar() {
  const store = new Map();
  return {
    header: () => [...store].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const pair = raw.split(';')[0];
        const i = pair.indexOf('=');
        const name = pair.slice(0, i);
        const value = pair.slice(i + 1);
        if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) store.delete(name);
        else store.set(name, value);
      }
    },
    has: (n) => store.has(n),
  };
}

async function call(cookies, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookies.header() ? { cookie: cookies.header() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  cookies.absorb(res);
  const text = await res.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* HTML */ }
  return { status: res.status, payload, text, location: res.headers.get('location') };
}

const login = (c, email, password) =>
  call(c, 'POST', '/api/auth/login', { identifier: email, password, remember: false });

try {
  // A throwaway Admin with a known password and a known live access code.
  const adminRole = await prisma.role.findFirst({ where: { name: 'admin', guardName: 'web' } });
  const a = await prisma.user.create({
    data: {
      name: 'E2E Staff Admin', email: ADMIN.email, password: await bcrypt.hash(ADMIN.password, 12),
      emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date(),
    },
  });
  created.push(a.id);
  await prisma.modelHasRole.create({ data: { roleId: adminRole.id, modelType: 'App\\Models\\User', modelId: a.id } });
  await prisma.adminAccessCode.create({
    data: { adminUserId: a.id, codeHash: await bcrypt.hash(ADMIN.code, 12), expiresAt: new Date(Date.now() + 600e3), maxAttempts: 5 },
  });

  console.log('\nAdmin signs in');
  const admin = jar();
  await login(admin, ADMIN.email, ADMIN.password);
  await call(admin, 'POST', '/api/auth/admin-access-code', { code: ADMIN.code });
  check('Admin is signed in', admin.has('tdms_session'));

  console.log('\nAdd Staff');
  const staffPage = await call(admin, 'GET', '/staff');
  check('Staff page offers "Add Staff"', staffPage.text.includes('Add Staff'));
  check('no "Invite Staff" or "Resend invite" left', !/Invite Staff|Resend invite/.test(staffPage.text));

  const add = await call(admin, 'POST', '/api/staff', {
    name: 'E2E Teacher', email: TEACHER_EMAIL, role: 'teacher',
    temporaryPassword: TEMP, temporaryPasswordConfirmation: TEMP,
  });
  check('Teacher account created', add.status === 201, add.payload?.message);
  check('temporary password returned once', add.payload?.data?.temporaryPassword === TEMP);
  const teacherId = add.payload?.data?.id;
  if (teacherId) created.push(BigInt(teacherId));

  const invitedAdmin = await call(admin, 'POST', '/api/staff', {
    name: 'X', email: `x-${stamp}@example.test`, role: 'admin',
    temporaryPassword: TEMP, temporaryPasswordConfirmation: TEMP,
  });
  check('an Admin cannot be created from Staff', invitedAdmin.status >= 400, `status ${invitedAdmin.status}`);

  console.log('\nTeacher first sign-in');
  const teacher = jar();
  const tLogin = await login(teacher, TEACHER_EMAIL, TEMP);
  check('temporary password signs in, no access code needed', tLogin.status === 200 && tLogin.payload?.data?.stage === 'complete',
    `${tLogin.status} ${tLogin.payload?.data?.stage}`);
  check('sent to change the password', tLogin.payload?.data?.redirectTo === '/change-password');
  const divert = await call(teacher, 'GET', '/dashboard');
  check('dashboard diverts to /change-password', (divert.location ?? '').includes('/change-password'), `${divert.status} ${divert.location}`);

  const changed = await call(teacher, 'POST', '/api/auth/change-password', {
    currentPassword: TEMP, password: OWN, passwordConfirmation: OWN,
  });
  check('SET PASSWORD succeeds', changed.status === 200, changed.payload?.message);
  check('a success message is shown', /successfully/i.test(changed.payload?.data?.message ?? ''), changed.payload?.data?.message);
  const dash = await call(teacher, 'GET', '/dashboard');
  check('Teacher reaches the dashboard', dash.status === 200, `status ${dash.status}`);
  check('old temporary password no longer works', (await login(jar(), TEACHER_EMAIL, TEMP)).status === 401);
  check('new password works', (await login(jar(), TEACHER_EMAIL, OWN)).status === 200);

  console.log('\nReset password');
  const reset = await call(admin, 'POST', `/api/staff/${teacherId}/reset-password`);
  const newTemp = reset.payload?.data?.temporaryPassword;
  check('reset returns a new temporary password', reset.status === 200 && typeof newTemp === 'string', reset.payload?.message);
  check('Teacher was signed out', (await call(teacher, 'GET', '/dashboard')).status !== 200);
  check('their own password no longer works', (await login(jar(), TEACHER_EMAIL, OWN)).status === 401);
  const again = await login(jar(), TEACHER_EMAIL, newTemp);
  check('the new temporary password works and forces a change', again.payload?.data?.redirectTo === '/change-password');

  console.log('\nDeactivate');
  await call(admin, 'POST', `/api/staff/${teacherId}/status`, { status: 'SUSPENDED' });
  check('a suspended Teacher cannot sign in', (await login(jar(), TEACHER_EMAIL, newTemp)).status === 403);
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.error(`\n  threw: ${error.message}`);
} finally {
  const { count } = await prisma.user.deleteMany({ where: { id: { in: created } } });
  console.log(`\nremoved ${count} throwaway account(s)`);
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
