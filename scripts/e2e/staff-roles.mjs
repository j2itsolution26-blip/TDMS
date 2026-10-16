// End-to-end check of Admin → Add Staff for the TVET Processing Officer and
// the TVET Assessment Center Manager: creation, editing, first sign-in with
// the temporary password, dashboard, sidebar and permissions, and refusal of
// role escalation through direct API calls.
//
//   npm run build && PORT=3001 npm start
//   npm run test:staff-roles            (BASE=http://host:port to point elsewhere)
//
// Throwaway accounts only (marker ZZE2E), removed at the end. Run it against a
// disposable database.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Roles#Check${stamp}xY`;
const TEMP = `Temp#Pass${stamp}Ab`;
const OWN = `Own#Pass${stamp}Cd`;
const ADMIN_CODE = '418273';
const started = new Date();
const created = [];
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const jars = {};
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
        if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) store.delete(name); else store.set(name, value);
      }
    },
  };
}
async function api(who, method, path, body) {
  const j = jars[who] ?? (jars[who] = jar());
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method, redirect: 'manual',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(j.header() ? { cookie: j.header() } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  j.absorb(res);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data, text };
}
const page = (who, path) => api(who, 'GET', `/pages${path}`);
const login = (who, email, password) => { jars[who] = jar(); return api(who, 'POST', '/auth/login', { identifier: email, password, remember: false }); };

async function directUser(key, role) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: {
    name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12),
    emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  if (role === 'admin') await prisma.adminAccessCode.create({ data: { adminUserId: u.id, codeHash: await bcrypt.hash(ADMIN_CODE, 12), expiresAt: new Date(Date.now() + 600e3), maxAttempts: 5 } });
  await login(key, u.email, PASSWORD);
  if (role === 'admin') await api(key, 'POST', '/auth/admin-access-code', { code: ADMIN_CODE });
  if (!jars[key].header().includes('tdms_session=')) throw new Error(`could not sign in ${key}`);
  return u;
}

const ROLES = [
  { role: 'processing_officer', label: 'TVET Processing Officer', key: 'po' },
  { role: 'assessment_center_manager', label: 'TVET Assessment Center Manager', key: 'acm' },
];

try {
  console.log(`Staff roles e2e against ${BASE} (marker ${M})\n`);
  await directUser('admin', 'admin');
  await directUser('secretary', 'secretary');
  await directUser('teacher', 'teacher');

  console.log('Add Staff offers both roles');
  const staffPage = await page('admin', '/staff');
  const options = staffPage.data?.roleOptions ?? [];
  check('the Add Staff role list has the Processing Officer', options.includes('processing_officer'), options);
  check('the Add Staff role list has the Assessment Center Manager', options.includes('assessment_center_manager'), options);
  check('existing staff roles are still offered', ['director', 'coordinator', 'secretary', 'teacher'].every((r) => options.includes(r)), options);
  check('privileged roles are not offered', !options.some((r) => ['admin', 'super_admin', 'student'].includes(r)), options);

  const accounts = {};
  for (const r of ROLES) {
    console.log(`\n${r.label}`);
    const email = `${M.toLowerCase()}-${r.key}@example.test`;
    const add = await api('admin', 'POST', '/staff', { name: `${M} ${r.label}`, email, role: r.role, temporaryPassword: TEMP, temporaryPasswordConfirmation: TEMP });
    check('the Admin creates the account', add.status === 201, add.json?.message ?? add.json);
    const id = add.data?.id;
    if (id) created.push(BigInt(id));
    accounts[r.key] = { id, email };

    const roles = await prisma.modelHasRole.findMany({ where: { modelId: BigInt(id), modelType: 'App\\Models\\User' }, select: { role: { select: { name: true } } } });
    check('the database holds exactly that role', roles.length === 1 && roles[0].role.name === r.role, roles.map((x) => x.role.name));
    const row = (await page('admin', '/staff')).data?.rows?.find((x) => x.id === id);
    check('the staff list shows the role', row?.role === r.role, row);

    const edit = await api('admin', 'PUT', `/staff/${id}`, { name: `${M} ${r.label} (edited)`, email, role: r.role });
    check('editing keeps the role', edit.status === 200 && (await page('admin', '/staff')).data?.rows?.find((x) => x.id === id)?.role === r.role, edit.json?.message);

    const first = await login(r.key, email, TEMP);
    check('the temporary password signs in and asks for a new one', first.status === 200 && first.data?.redirectTo === '/change-password', first.data ?? first.json);
    const changed = await api(r.key, 'POST', '/auth/change-password', { currentPassword: TEMP, password: OWN, passwordConfirmation: OWN });
    check('the new password is set', changed.status === 200, changed.json?.message);
    check('the new password signs in', (await login(r.key, email, OWN)).status === 200);
    const shell = await page(r.key, '/app-shell');
    check('the header names the role', shell.data?.user?.roleLabel === r.label, shell.data?.user);
    accounts[r.key].hrefs = shell.data?.items?.map((i) => i.href) ?? [];
    accounts[r.key].dash = (await page(r.key, '/dashboard')).data;
  }

  console.log('\nProcessing Officer: dashboard, sidebar and permissions');
  const po = accounts.po;
  check('opens the Processing dashboard', po.dash?.kind === 'workspace' && po.dash?.common?.roleLabel === 'TVET Processing Officer', po.dash?.kind);
  check('sidebar: students, enrollments, training calendar, PDS', ['/dashboard', '/students', '/enrollments', '/assessment/calendar', '/teaching/pds'].every((h) => po.hrefs.includes(h)), po.hrefs);
  check('sidebar: no staff, applications, results or admin screens', !po.hrefs.some((h) => ['/staff', '/applications', '/assessment/results', '/audit-logs', '/admins', '/assessment/inventory'].includes(h)), po.hrefs);
  check('can list students', (await api('po', 'GET', '/students')).status === 200);
  check('can open enrollments', (await page('po', '/enrollments')).status === 200);
  check('can read the training calendar', (await api('po', 'GET', '/assessment/activities?from=2026-10-01&to=2026-10-31')).status === 200);
  const act = await api('po', 'POST', '/assessment/activities', { title: `${M} TESDA orientation`, activityType: 'TRAINING', startsAt: '2026-11-03T00:00:00Z', endsAt: '2026-11-03T03:00:00Z', venue: `${M} Room` });
  check('can schedule on the training calendar', act.status === 201, act.json);
  check('keeps a PDS', (await api('po', 'PUT', '/instructor-profile', { employeeId: `EMP-PO-${M}`, personal: { sex: 'Female' } })).status === 200);
  check('cannot open applications', (await page('po', '/applications')).status === 403);
  check('cannot manage staff', (await api('po', 'GET', '/staff')).status === 403);
  check('cannot record assessment results', (await api('po', 'POST', '/assessment/batches', { batchNumber: `${M}-X`, programId: '1', assessmentDate: '2026-11-03', assessorName: 'X' })).status === 403);
  check('cannot change inventory', (await api('po', 'POST', '/assessment/inventory', { category: 'CSS_NC2', name: 'x', quantityGood: 1, quantityDefective: 0 })).status === 403);
  check('cannot see audit logs', (await page('po', '/audit-logs')).status === 403);
  const admList = (await page('admin', '/instructors')).data?.rows?.map((r) => r.id) ?? [];
  check("the Admin sees the Processing Officer's PDS", admList.includes(po.id));

  console.log('\nAssessment Center Manager: dashboard, sidebar and permissions');
  const acm = accounts.acm;
  check('opens the Assessment Center dashboard', acm.dash?.kind === 'assessment', acm.dash?.kind);
  check('sidebar: results, calendar, reports, inventory, purchases, PDS', ['/assessment/results', '/assessment/calendar', '/assessment/reports', '/assessment/inventory', '/assessment/purchases', '/teaching/pds'].every((h) => acm.hrefs.includes(h)), acm.hrefs);
  check('sidebar: no students, staff or admin screens', !acm.hrefs.some((h) => ['/students', '/staff', '/applications', '/audit-logs'].includes(h)), acm.hrefs);
  check('can open results, reports, inventory and purchases', (await Promise.all(['/assessment/results', '/assessment/reports', '/assessment/inventory', '/assessment/purchases'].map((p) => page('acm', p)))).every((r) => r.status === 200));
  check('cannot list students', (await api('acm', 'GET', '/students')).status === 403);
  check('cannot manage staff', (await api('acm', 'GET', '/staff')).status === 403);

  console.log('\nNo escalation through the API');
  const tryCreate = (who, role) => api(who, 'POST', '/staff', { name: 'X', email: `${M.toLowerCase()}-x-${who}-${role}@example.test`, role, temporaryPassword: TEMP, temporaryPasswordConfirmation: TEMP });
  check('a Secretary cannot create a Processing Officer', (await tryCreate('secretary', 'processing_officer')).status === 403);
  check('a Processing Officer cannot create a Manager', (await tryCreate('po', 'assessment_center_manager')).status === 403);
  check('a Manager cannot create a Processing Officer', (await tryCreate('acm', 'processing_officer')).status === 403);
  check('an Instructor cannot create either', (await tryCreate('teacher', 'processing_officer')).status === 403);
  check('the Admin cannot create an Admin through Add Staff', (await tryCreate('admin', 'admin')).status >= 400);
  check('the Admin cannot create a Super Admin through Add Staff', (await tryCreate('admin', 'super_admin')).status >= 400);
  check('an unknown role is refused', (await tryCreate('admin', 'processing_officer_plus')).status === 422);
  check('the Admin cannot turn a Processing Officer into an Admin', (await api('admin', 'PUT', `/staff/${po.id}`, { name: 'X', email: po.email, role: 'admin' })).status >= 400);
  const stillPo = await prisma.modelHasRole.findMany({ where: { modelId: BigInt(po.id), modelType: 'App\\Models\\User' }, select: { role: { select: { name: true } } } });
  check('the Processing Officer is still only a Processing Officer', stillPo.length === 1 && stillPo[0].role.name === 'processing_officer', stillPo);
  const leaked = await prisma.user.count({ where: { email: { contains: `${M.toLowerCase()}-x-` } } });
  check('no account was created by a refused request', leaked === 0, leaked);

  console.log('\nExisting roles still work');
  const sec = await api('admin', 'POST', '/staff', { name: `${M} Secretary2`, email: `${M.toLowerCase()}-sec2@example.test`, role: 'secretary', temporaryPassword: TEMP, temporaryPasswordConfirmation: TEMP });
  check('the Admin still creates a Secretary', sec.status === 201, sec.json?.message);
  if (sec.data?.id) created.push(BigInt(sec.data.id));
  const audit = await prisma.auditLog.count({ where: { createdAt: { gte: started }, target: { contains: M } } });
  check('account changes are audited', audit > 0, audit);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    await prisma.trainingActivity.deleteMany({ where: { title: { contains: M } } });
    await prisma.instructorProfile.deleteMany({ where: { userId: { in: created } } });
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: created } }, { createdAt: { gte: started }, title: { contains: M } }] } });
    await prisma.adminAccessCode.deleteMany({ where: { adminUserId: { in: created } } });
    await prisma.adminLoginChallenge.deleteMany({ where: { userId: { in: created } } });
    await prisma.session.deleteMany({ where: { userId: { in: created } } });
    await prisma.modelHasRole.deleteMany({ where: { modelId: { in: created }, modelType: 'App\\Models\\User' } });
    const u = await prisma.user.deleteMany({ where: { OR: [{ id: { in: created } }, { email: { startsWith: M.toLowerCase() } }] } });
    console.log(`\nremoved ${u.count} throwaway account(s)`);
  } catch (e) {
    console.log('CLEANUP ERROR', e.message);
  }
  await prisma.$disconnect();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.map((f) => ` - ${f}`).join('\n'));
process.exit(failures.length ? 1 : 0);
