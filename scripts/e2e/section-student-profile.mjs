// End-to-end check of the roster's Student Information panel endpoint,
// GET /api/v1/sections/:id/students/:studentId: who may open it, what each
// role gets, that it only answers for students of that section, and that no
// secret (password, hash, token) ever leaves the server.
//
//   npm run build && PORT=3001 npm start
//   npm run test:student-profile      (BASE=http://host:port to point elsewhere)
//
// Throwaway records only (marker ZZE2E), in a throwaway school year; removed
// at the end. Run it against a disposable database.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Prof#Check${stamp}xY`;
const created = { users: [], students: [], programs: [], curricula: [], years: [], sections: [], requirements: [] };
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const cookies = {};
async function makeUser(key, role, extra = {}) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: { name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12), emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date(), ...extra } });
  created.users.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  return u;
}
async function login(key, user) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: user.email, password: PASSWORD, remember: false }) });
  const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('tdms_session='));
  if (!c) throw new Error(`login failed for ${key}`);
  cookies[key] = c.split(';')[0];
}
async function get(who, path) {
  const res = await fetch(`${BASE}/api/v1${path}`, { headers: who ? { cookie: cookies[who] } : {} });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, data: json?.data };
}
const SECRET = /password|hash|token|secret|remember/i;

try {
  console.log(`Section student profile e2e against ${BASE} (marker ${M})\n`);
  for (const role of ['admin', 'coordinator', 'director', 'secretary', 'teacher']) await login(role, await makeUser(role, role));

  const program = await prisma.program.create({ data: { code: `${M}-DIT`, name: `${M} Diploma in IT`, isActive: true, createdAt: new Date() } });
  created.programs.push(program.id);
  const cur = await prisma.curriculum.create({ data: { programId: program.id, versionLabel: 'v2', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${String(stamp).slice(-4)}`.slice(0, 20), startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id);
  const A = await prisma.section.create({ data: { schoolYearId: year.id, programId: program.id, yearLevel: 2, name: 'A' } });
  const B = await prisma.section.create({ data: { schoolYearId: year.id, programId: program.id, yearLevel: 2, name: 'B' } });
  created.sections.push(A.id, B.id);

  // A student with everything filled in: a login account, an approved
  // enrollment for this school year, and one verified document.
  const account = await makeUser('learner', 'student', { mustChangePassword: true, rememberToken: `tok-${M}` });
  const mk = (n, extra = {}) => prisma.student.create({ data: { studentNumber: `${M}-${n}`, firstName: `First${n}`, middleName: 'Mid', lastName: `Last${M}`, email: `${M.toLowerCase()}-s${n}@example.test`, phone: '09170000000', dateOfBirth: new Date('2005-04-09'), programId: program.id, curriculumId: cur.id, yearLevel: 2, status: 'active', enrollmentDate: new Date('2096-06-10'), createdAt: new Date(), ...extra } }).then((x) => { created.students.push(x.id); return x; });
  const full = await mk(1, { userId: account.id });
  const bare = await mk(2, { firstName: 'Bare', middleName: null, email: null, phone: null, dateOfBirth: null, enrollmentDate: null });
  const other = await mk(3);
  await prisma.sectionStudent.createMany({ data: [{ sectionId: A.id, studentId: full.id, schoolYearId: year.id }, { sectionId: A.id, studentId: bare.id, schoolYearId: year.id }, { sectionId: B.id, studentId: other.id, schoolYearId: year.id }] });
  await prisma.enrollment.create({ data: { studentId: full.id, curriculumId: cur.id, schoolYear: year.label, schoolYearId: year.id, semester: 1, yearLevel: 2, status: 'enrolled', approvedAt: new Date(), approvedBy: created.users[0], createdAt: new Date() } });
  const req = await prisma.credentialRequirement.create({ data: { programId: program.id, name: `${M} Form 138`, isRequired: true, isActive: true, createdAt: new Date() } });
  created.requirements.push(req.id);
  await prisma.studentCredential.create({ data: { studentId: full.id, credentialRequirementId: req.id, status: 'verified', submittedAt: new Date(), verifiedAt: new Date(), verifiedBy: created.users[0], filePath: `private/${M}.pdf`, createdAt: new Date() } });

  console.log('Admin');
  const a = await get('admin', `/sections/${A.id}/students/${full.id}`);
  const d = a.data;
  check('the Admin opens a student of the section', a.status === 200 && d?.studentNumber === `${M}-1`, a.text);
  check('profile header: name, status, program, year level, section label', d?.name === `First1 Mid Last${M}` && d.status === 'active' && d.program.code === `${M}-DIT` && d.yearLevel === 2 && d.section.label.includes('2nd Year') && d.section.label.includes('Section A'), d);
  check('personal information from the record', d?.personal?.dateOfBirth === '2005-04-09' && d.personal.phone === '09170000000' && d.personal.email === `${M.toLowerCase()}-s1@example.test` && d.personal.middleName === 'Mid', d?.personal);
  check('academic: curriculum, school year and this year’s enrollment with approver', d?.curriculum?.version === 'v2' && d.section.schoolYear === year.label && d.enrollment?.status === 'enrolled' && d.enrollment.approvedBy === `${M} admin`, { c: d?.curriculum, e: d?.enrollment });
  check('documents: name, status and verifier — no file path', d?.documents?.length === 1 && d.documents[0].status === 'verified' && d.documents[0].verifiedBy === `${M} admin` && !a.text.includes(`private/${M}`), d?.documents);
  check('account: exists, status, password-change flag, sign-in email', d?.account?.exists === true && d.account.status === 'ACTIVE' && d.account.passwordChangeRequired === true && d.account.email === account.email, d?.account);
  check('nothing restricted for the Admin', Array.isArray(d?.restricted) && d.restricted.length === 0, d?.restricted);
  const keys = JSON.stringify(d, (k, v) => v).match(/"([^"]+)":/g) ?? [];
  check('no password, hash or token field anywhere in the response', !keys.some((k) => SECRET.test(k) && !/passwordChangeRequired/.test(k)) && !a.text.includes(`tok-${M}`) && !a.text.includes('$2'), keys.filter((k) => SECRET.test(k)));

  const b = await get('admin', `/sections/${A.id}/students/${bare.id}`);
  check('a student with little on record: missing fields come back empty, not invented', b.status === 200 && b.data.personal.dateOfBirth === null && b.data.personal.phone === null && b.data.personal.middleName === null && b.data.enrollment === null && b.data.documents.length === 0 && b.data.account.exists === false, b.data);

  console.log('\nOnly students of that section');
  const wrong = await get('admin', `/sections/${A.id}/students/${other.id}`);
  check('a student of another section is 404', wrong.status === 404 && !wrong.text.includes(`First3`), wrong.text);
  const none = await get('admin', `/sections/${A.id}/students/999999999`);
  check('an unknown student is 404', none.status === 404);
  const bad = await get('admin', `/sections/${A.id}/students/abc`);
  check('a malformed id is rejected', bad.status === 422 || bad.status === 400 || bad.status === 404, bad.status);

  console.log('\nRoles');
  const c = await get('coordinator', `/sections/${A.id}/students/${full.id}`);
  check('the Coordinator (who manages sections) can open it', c.status === 200 && c.data.studentNumber === `${M}-1`);
  check('…but personal details and the account are withheld, and say so', c.data?.personal === null && c.data.account === null && c.data.restricted.includes('personal') && c.data.restricted.includes('account') && !c.text.includes('09170000000') && !c.text.includes('2005-04-09') && !c.text.includes(account.email), c.data);
  check('…documents follow the existing document permission (office viewers)', Array.isArray(c.data?.documents) && c.data.documents.length === 1);
  // The Director views Classes & Sections read-only (teachingPolicy.viewClasses), so may open it too.
  const dir = await get('director', `/sections/${A.id}/students/${full.id}`);
  check('director: may view (read-only oversight), with the details the Director may already see', dir.status === 200 && dir.data?.studentNumber === `${M}-1` && dir.data.personal !== null, dir.status);
  for (const who of ['secretary', 'teacher']) {
    const r = await get(who, `/sections/${A.id}/students/${full.id}`);
    check(`${who}: 403, same as the roster itself`, r.status === 403 && !r.text.includes(`First1`), r.status);
  }
  const anon = await get(null, `/sections/${A.id}/students/${full.id}`);
  check('signed out: 401', anon.status === 401, anon.status);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: created.students } } });
    await prisma.credentialRequirement.deleteMany({ where: { id: { in: created.requirements } } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: created.students } } });
    await prisma.sectionStudent.deleteMany({ where: { sectionId: { in: created.sections } } });
    await prisma.section.deleteMany({ where: { id: { in: created.sections } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.student.deleteMany({ where: { id: { in: created.students } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.modelHasRole.deleteMany({ where: { modelId: { in: created.users }, modelType: 'App\\Models\\User' } });
    const u = await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    console.log(`\nremoved ${u.count} throwaway account(s) and all fixtures`);
  } catch (e) {
    console.log('CLEANUP ERROR', e.message);
  }
  await prisma.$disconnect();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.map((f) => ` - ${f}`).join('\n'));
process.exit(failures.length ? 1 : 0);
