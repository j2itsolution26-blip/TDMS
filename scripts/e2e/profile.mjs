// End-to-end check of My Profile: profile, password, activity — through the real endpoints.
//
//   npm run build && PORT=3001 npm start
//   node scripts/e2e/profile.mjs     (BASE=http://host:port to point elsewhere)
//
// What it guards:
//   * the page carries the signed-in account's own real data (never a hash);
//   * the name can be changed; the email cannot (refused, still verified);
//   * the password changes only after the current one checks out on the
//     server, meets the policy and is confirmed; then every other session ends
//     and this browser keeps a fresh one; the old password stops working;
//   * sign-ins, profile and password changes are recorded and shown as the
//     account's activity — and only events ABOUT this account;
//   * only the signed-in account is ever changed; signed out is refused.
//
// Throwaway records only (marker ZZPF…), removed at the end. A disposable database only.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZPF${String(stamp).slice(-6)}`;
const PASSWORD = `Pf#Check${stamp}xY`;
const NEW_PASSWORD = `New#Pass${stamp}Zq9`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const created = { users: [], programs: [], curricula: [] };
let passed = 0;
const failures = [];
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
};

async function makeUser(key, role) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: { name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12), emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.users.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  return u;
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ identifier: email, password, remember: false }) });
  const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('tdms_session='));
  return { status: res.status, cookie: c ? c.split(';')[0] : null };
}
async function call(cookie, method, p, body) {
  const res = await fetch(`${BASE}/api/v1${p}`, { method, headers: { 'User-Agent': UA, ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('tdms_session='));
  return { status: res.status, json, text, cookie: c ? c.split(';')[0] : null };
}
const profile = (cookie) => call(cookie, 'GET', '/pages/profile');

try {
  console.log(`My Profile e2e against ${BASE} (marker ${M})\n`);
  const me = await makeUser('secretary', 'secretary');
  const other = await makeUser('other', 'teacher');

  const a = await login(me.email, PASSWORD);
  check('sign in', a.status === 200 && a.cookie, a.status);
  let cookie = a.cookie;
  const b = await login(me.email, PASSWORD); // a second browser

  console.log('\nThe page');
  const page = await profile(cookie);
  const d = page.json?.data;
  check('loads the signed-in account', page.status === 200 && d.user.email === me.email && d.user.name === me.name, page.status);
  check('with role, status, member-since and last sign-in from the account', d.user.roles.includes('Secretary') && d.user.status === 'ACTIVE' && d.user.createdAt && d.user.lastLoginAt);
  check('never a password hash', !page.text.includes(me.password) && !/"password"/.test(page.text));
  check('activity: the sign-ins, with the device sent', d.activity.filter((e) => e.action === 'LOGIN_SUCCESS').length >= 2 && d.activity[0].device === 'Chrome on Windows', d.activity.slice(0, 2));

  console.log('\nProfile information');
  check('an empty name is refused (422)', (await call(cookie, 'PUT', '/profile', { name: '  ' })).status === 422);
  const renamed = await call(cookie, 'PUT', '/profile', { name: `${M} Renamed` });
  check('the name is saved', renamed.status === 200 && (await prisma.user.findUnique({ where: { id: me.id } })).name === `${M} Renamed`);
  check('…and recorded as profile updated', (await prisma.auditLog.count({ where: { action: 'PROFILE_UPDATED', target: `User ${me.id}` } })) === 1);
  const emailChange = await call(cookie, 'PUT', '/profile', { name: `${M} Renamed`, email: `${M.toLowerCase()}-new@example.test` });
  const afterEmail = await prisma.user.findUnique({ where: { id: me.id } });
  check('changing the email is refused (422), with the reason', emailChange.status === 422 && /administrator/.test(JSON.stringify(emailChange.json)), emailChange.json);
  check('…the email and its verification are unchanged (no lock-out)', afterEmail.email === me.email && afterEmail.emailVerifiedAt !== null);
  check('the same email alongside a name is still accepted (older clients)', (await call(cookie, 'PUT', '/profile', { name: `${M} Renamed`, email: me.email })).status === 200);
  const sneaky = await call(cookie, 'PUT', '/profile', { name: `${M} Sneaky`, id: other.id.toString(), userId: other.id.toString(), roles: ['super_admin'] });
  check('an id or role in the request changes nobody else and grants nothing', sneaky.status === 200 && (await prisma.user.findUnique({ where: { id: other.id } })).name === other.name && (await prisma.modelHasRole.count({ where: { modelId: me.id } })) === 1);
  check('signed out: refused (401)', (await call(null, 'PUT', '/profile', { name: 'x' })).status === 401);

  console.log('\nPassword');
  const before = (await prisma.user.findUnique({ where: { id: me.id } })).password;
  const wrong = await call(cookie, 'PUT', '/profile/password', { currentPassword: 'not-it', password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD });
  check('a wrong current password is refused (422) on the current-password field', wrong.status === 422 && wrong.json?.errors?.currentPassword, wrong.json);
  const weak = await call(cookie, 'PUT', '/profile/password', { currentPassword: PASSWORD, password: 'short', passwordConfirmation: 'short' });
  check('a weak new password is refused, every requirement named', weak.status === 422 && (weak.json?.errors?.password?.length ?? 0) >= 2, weak.json);
  const mismatch = await call(cookie, 'PUT', '/profile/password', { currentPassword: PASSWORD, password: NEW_PASSWORD, passwordConfirmation: `${NEW_PASSWORD}x` });
  check('a confirmation that does not match is refused', mismatch.status === 422 && mismatch.json?.errors?.passwordConfirmation);
  check('…and after all of those the password is unchanged', (await prisma.user.findUnique({ where: { id: me.id } })).password === before);
  const changed = await call(cookie, 'PUT', '/profile/password', { currentPassword: PASSWORD, password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD });
  check('the right current password and a strong new one: changed', changed.status === 200 && changed.json?.data?.updated === true, changed.json);
  const row = await prisma.user.findUnique({ where: { id: me.id } });
  check('stored as a hash, never the plain text; change time recorded', row.password !== before && row.password !== NEW_PASSWORD && row.password.startsWith('$') && row.passwordChangedAt !== null);
  check('the other browser’s session ended (reported: 1)', changed.json?.data?.otherSessionsEnded === 1 && (await profile(b.cookie)).json?.redirect === '/login', changed.json?.data);
  check('this browser got a fresh session and stays signed in', changed.cookie && changed.cookie !== cookie && (await profile(changed.cookie)).json?.data?.user?.email === me.email);
  check('…its old session token no longer works', (await profile(cookie)).json?.redirect === '/login');
  cookie = changed.cookie;
  check('the old password no longer signs in', (await login(me.email, PASSWORD)).status !== 200);
  const fresh = await login(me.email, NEW_PASSWORD);
  check('the new one does', fresh.status === 200);
  const audit = await prisma.auditLog.findFirst({ where: { action: 'PASSWORD_CHANGED', target: `User ${me.id}` } });
  const auditText = audit ? JSON.stringify(audit, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : '';
  check('recorded as password changed, with no password in it', audit && !auditText.includes(NEW_PASSWORD) && !auditText.includes(row.password));

  console.log('\nActivity is about this account only');
  // An action this user took on SOMEONE ELSE's account must not appear in their own history.
  await prisma.auditLog.create({ data: { action: 'TEMP_PASSWORD_RESET', actor: `${M} Sneaky <${me.email}>`, target: `${other.name} <${other.email}>`, createdAt: new Date() } });
  const act = (await profile(cookie)).json.data.activity;
  const actions = act.map((e) => e.action);
  check('shows sign-ins, the profile update and the password change, newest first', ['PASSWORD_CHANGED', 'PROFILE_UPDATED', 'LOGIN_SUCCESS'].every((x) => actions.includes(x)) && new Date(act[0].at) >= new Date(act[act.length - 1].at), actions);
  check('not the reset they did to another account', !actions.includes('TEMP_PASSWORD_RESET'));
  const otherLogin = await login(other.email, PASSWORD);
  const otherAct = (await profile(otherLogin.cookie)).json.data.activity.map((e) => e.action);
  check('the other account sees the reset done to it, and none of this user’s events', otherAct.includes('TEMP_PASSWORD_RESET') && !otherAct.includes('PASSWORD_CHANGED'), otherAct);

  console.log('\nA student');
  const stu = await makeUser('student', 'student');
  const prog = await prisma.program.create({ data: { code: `${M}-DIT`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(prog.id);
  const cur = await prisma.curriculum.create({ data: { programId: prog.id, versionLabel: 'v1', effectiveSchoolYear: '2026-2027', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);
  await prisma.student.create({ data: { studentNumber: `${M}-1`, firstName: 'Ana', lastName: 'Reyes', programId: prog.id, curriculumId: cur.id, yearLevel: 1, status: 'active', userId: stu.id, createdAt: new Date(), updatedAt: new Date() } });
  const sc = await login(stu.email, PASSWORD);
  const sp = (await profile(sc.cookie)).json?.data;
  check('the same page, with the student’s own program and number', sp?.user.roles.includes('Student') && sp.user.student?.studentNumber === `${M}-1` && sp.user.student.program.includes('Information Technology'), sp?.user);
  check('a student can change their own name too', (await call(sc.cookie, 'PUT', '/profile', { name: 'Ana M. Reyes' })).status === 200);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const students = (await prisma.student.findMany({ where: { programId: { in: created.programs } }, select: { id: true } })).map((s) => s.id);
    await prisma.student.deleteMany({ where: { id: { in: students } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    const users = await prisma.user.findMany({ where: { id: { in: created.users } }, select: { id: true, name: true, email: true } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ target: { in: users.map((u) => `User ${u.id}`) } }, { target: { contains: M } }, { actor: { contains: M } }] } });
    await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.modelHasRole.deleteMany({ where: { modelId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  } catch (e) {
    console.log('cleanup failed:', e.message);
  }
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
}
