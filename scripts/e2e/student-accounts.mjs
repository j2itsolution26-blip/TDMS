// End-to-end check of student login accounts: the Admin creates them only for
// students whose enrollment is Enrolled; duplicates, races and other roles are
// refused by the server; the student must change the temporary password.
//
//   npm run build && PORT=3001 npm start
//   npm run test:student-accounts            (BASE=http://host:port to point elsewhere)
//
// Throwaway accounts and records only (marker ZZE2E), removed at the end.
// Audit rows are kept. Run it against a disposable database.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const m = M.toLowerCase();
const PASSWORD = `Acct#Check${stamp}xY`;
const OWN = `Own#Pass${stamp}Zz`;
const ADMIN_CODE = '730561';
const started = new Date();
const created = { users: [], students: [], programs: [], curricula: [] };
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
  return { status: res.status, json, data: json?.data, headers: res.headers };
}
const login = (who, email, password) => { jars[who] = jar(); return api(who, 'POST', '/auth/login', { identifier: email, password, remember: false }); };

async function staff(key, role) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: { name: `${M} ${key}`, email: `${m}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12), emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.users.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  if (role === 'admin') await prisma.adminAccessCode.create({ data: { adminUserId: u.id, codeHash: await bcrypt.hash(ADMIN_CODE, 12), expiresAt: new Date(Date.now() + 600e3), maxAttempts: 5 } });
  await login(key, u.email, PASSWORD);
  if (role === 'admin') await api(key, 'POST', '/auth/admin-access-code', { code: ADMIN_CODE });
  if (!jars[key].header().includes('tdms_session=')) throw new Error(`could not sign in ${key}`);
  return u;
}

const create = (who, studentId, email) => api(who, 'POST', `/students/${studentId}/account`, { email });

try {
  console.log(`Student accounts e2e against ${BASE} (marker ${M})\n`);
  await staff('admin', 'admin');
  for (const [k, r] of [['secretary', 'secretary'], ['director', 'director'], ['coordinator', 'coordinator'], ['po', 'processing_officer']]) await staff(k, r);

  const program = await prisma.program.create({ data: { code: `${M}-DIT`, name: `${M} Diploma in IT`, isActive: true, createdAt: new Date() } });
  created.programs.push(program.id);
  const cur = await prisma.curriculum.create({ data: { programId: program.id, versionLabel: 'v1', effectiveSchoolYear: '2026-2027', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);
  const mk = async (n, enrollmentStatus) => {
    const s = await prisma.student.create({ data: { studentNumber: `${M}-${n}`, firstName: `Cand${n}`, lastName: `Last${M}`, email: `${m}-student${n}@example.test`, programId: program.id, curriculumId: cur.id, yearLevel: 1, status: 'active', createdAt: new Date() } });
    created.students.push(s.id);
    if (enrollmentStatus) await prisma.enrollment.create({ data: { studentId: s.id, curriculumId: cur.id, schoolYear: '2026-2027', semester: 1, yearLevel: 1, status: enrollmentStatus, createdAt: new Date(), updatedAt: new Date() } });
    return s;
  };
  const enrolled = await mk(1, 'enrolled');
  const pending = await mk(2, 'pending');
  const rejected = await mk(3, 'rejected');
  const dropped = await mk(4, 'dropped');
  const race = await mk(5, 'enrolled');
  const none = await mk(6, null);

  console.log('The Student Accounts page');
  const pageData = (await api('admin', 'GET', '/pages/student-accounts')).data;
  const listed = (pageData?.rows ?? []).filter((r) => r.studentNumber.startsWith(M)).map((r) => r.studentNumber);
  check('lists only students with an Enrolled enrollment', listed.includes(`${M}-1`) && listed.includes(`${M}-5`) && !listed.some((n) => [`${M}-2`, `${M}-3`, `${M}-4`, `${M}-6`].includes(n)), listed);
  check('shows them as Account Not Created', pageData?.rows?.find((r) => r.studentNumber === `${M}-1`)?.stateLabel === 'Account Not Created');
  check('other roles cannot open the page', (await Promise.all(['secretary', 'director', 'po'].map((w) => api(w, 'GET', '/pages/student-accounts')))).every((r) => r.status === 403));

  console.log('\nEligibility');
  for (const [who, s, label] of [['admin', pending, 'Pending'], ['admin', rejected, 'Rejected'], ['admin', dropped, 'Dropped'], ['admin', none, 'never enrolled']]) {
    const r = await create(who, s.id, null);
    check(`a ${label} student cannot get an account`, r.status === 409 && r.json?.code === 'STUDENT_NOT_ENROLLED', r.json);
  }
  check('no login was created for them', (await prisma.student.count({ where: { id: { in: [pending.id, rejected.id, dropped.id, none.id] }, userId: { not: null } } })) === 0);
  check('a missing student is a 404', (await create('admin', 99999999, null)).status === 404);
  for (const who of ['secretary', 'director', 'coordinator', 'po']) {
    check(`the ${who} cannot create one through the API`, (await create(who, enrolled.id, null)).status === 403);
  }

  console.log('\nCreating');
  const made = await create('admin', enrolled.id, null);
  check('the Admin creates an account for the Enrolled student', made.status === 201, made.json);
  check('the response is not cached', /no-store/.test(made.headers.get('cache-control') ?? ''));
  const temp = made.data?.temporaryPassword;
  const linked = await prisma.student.findUnique({ where: { id: enrolled.id }, include: { user: true } });
  check('it is linked to that student record', linked?.user?.id?.toString() === made.data?.userId && linked?.user?.email === `${m}-student1@example.test`);
  check('active, with a password change required', linked?.user?.status === 'ACTIVE' && linked?.user?.mustChangePassword === true);
  check('the password is stored hashed, never as given', typeof temp === 'string' && temp.length >= 12 && linked?.user?.password !== temp);
  const roles = await prisma.modelHasRole.findMany({ where: { modelId: linked.user.id, modelType: 'App\\Models\\User' }, select: { role: { select: { name: true } } } });
  check('its only role is student', roles.length === 1 && roles[0].role.name === 'student', roles);
  if (linked?.user?.id) created.users.push(linked.user.id);
  const again = await create('admin', enrolled.id, `${m}-other@example.test`);
  check('a second account for the same student is refused', again.status === 409 && again.json?.code === 'ACCOUNT_ALREADY_EXISTS', again.json);
  const pageAfter = (await api('admin', 'GET', '/pages/student-accounts')).data?.rows?.find((r) => r.studentNumber === `${M}-1`);
  check('the page now shows Password Change Required', pageAfter?.stateLabel === 'Password Change Required', pageAfter);
  const audit = await prisma.auditLog.findFirst({ where: { createdAt: { gte: started }, action: 'STUDENT_ACCOUNT_CREATED', target: { contains: M } } });
  check('the creation is audited, without the password', !!audit && !JSON.stringify(audit.details).includes(temp), audit?.details);

  console.log('\nTwo Admins at once');
  await staff('admin2', 'admin');
  const [a, b] = await Promise.all([create('admin', race.id, `${m}-race-a@example.test`), create('admin2', race.id, `${m}-race-b@example.test`)]);
  const codes = [a.status, b.status].sort();
  check('exactly one of two simultaneous creations wins', codes[0] === 201 && codes[1] === 409, [a.status, b.status, a.json?.message, b.json?.message]);
  const loserEmail = a.status === 201 ? `${m}-race-b@example.test` : `${m}-race-a@example.test`;
  check('the losing request leaves no stray login behind', (await prisma.user.count({ where: { email: loserEmail } })) === 0);
  const raceUser = await prisma.student.findUnique({ where: { id: race.id }, select: { userId: true } });
  if (raceUser?.userId) created.users.push(raceUser.userId);
  check('an address already in use is refused', (await create('admin', (await mk(7, 'enrolled')).id, `${m}-student1@example.test`)).status === 422);

  console.log('\nThe student signs in');
  const first = await login('stu', `${m}-student1@example.test`, temp);
  check('the temporary password signs in and asks for a new one', first.status === 200 && first.data?.redirectTo === '/change-password', first.data ?? first.json);
  const blocked = await api('stu', 'GET', '/pages/dashboard');
  check('the dashboard waits until the password is changed', blocked.data?.redirect === '/change-password' || blocked.status !== 200 || !!blocked.json?.redirect, blocked.json);
  check('the password is changed', (await api('stu', 'POST', '/auth/change-password', { currentPassword: temp, password: OWN, passwordConfirmation: OWN })).status === 200);
  const shell = (await api('stu', 'GET', '/pages/app-shell')).data;
  check('signed in as a Student', shell?.user?.roleLabel === 'Student', shell?.user);
  check('reaches the student dashboard', (await api('stu', 'GET', '/pages/dashboard')).status === 200);
  check('cannot open the student list or accounts', (await api('stu', 'GET', '/pages/students')).status === 403 && (await api('stu', 'GET', '/pages/student-accounts')).status === 403);
  check('cannot create accounts', (await create('stu', race.id, null)).status === 403);

  console.log('\nManaging an existing account');
  const reset = await api('admin', 'POST', `/staff/${made.data.userId}/reset-password`);
  check('the Admin can issue a new temporary password', reset.status === 200 && typeof reset.data?.temporaryPassword === 'string', reset.json);
  check('the student is signed out by it', (await api('stu', 'GET', '/pages/dashboard')).status !== 200 || !!(await api('stu', 'GET', '/pages/dashboard')).json?.redirect);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const linkedUsers = (await prisma.student.findMany({ where: { id: { in: created.students } }, select: { userId: true } })).map((s) => s.userId).filter(Boolean);
    const all = [...new Set([...created.users, ...linkedUsers].map(String))].map(BigInt);
    await prisma.enrollment.deleteMany({ where: { studentId: { in: created.students } } });
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: created.students } } });
    await prisma.student.deleteMany({ where: { id: { in: created.students } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.notification.deleteMany({ where: { userId: { in: all } } });
    await prisma.adminAccessCode.deleteMany({ where: { adminUserId: { in: all } } });
    await prisma.adminLoginChallenge.deleteMany({ where: { userId: { in: all } } });
    await prisma.session.deleteMany({ where: { userId: { in: all } } });
    await prisma.modelHasRole.deleteMany({ where: { modelId: { in: all }, modelType: 'App\\Models\\User' } });
    const u = await prisma.user.deleteMany({ where: { OR: [{ id: { in: all } }, { email: { startsWith: m } }] } });
    console.log(`\nremoved ${u.count} throwaway account(s) and all fixtures`);
  } catch (e) {
    console.log('CLEANUP ERROR', e.message);
  }
  await prisma.$disconnect();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.map((f) => ` - ${f}`).join('\n'));
process.exit(failures.length ? 1 : 0);
