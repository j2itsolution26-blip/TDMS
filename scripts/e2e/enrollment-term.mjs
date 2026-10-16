// End-to-end check of opening a New Enrollment Term, through the real endpoint
// (POST /students/:id/enrollments) and the student's Enrollment page data.
//
//   npm run build && PORT=3001 npm start
//   node scripts/e2e/enrollment-term.mjs     (BASE=http://host:port to point elsewhere)
//
// What it guards (shared/lib/enrollment-term.ts, createEnrollment):
//   * the page offers only school years that are set up and not archived, the
//     active one first, and year levels up to the curriculum's final year;
//   * a valid term is created as pending and linked to its school-year record;
//   * the server refuses, with a message on the field: a school year never set
//     up, an archived one, a 3rd semester, a year level past the curriculum,
//     a term the student already has — and six simultaneous submissions of the
//     same term create exactly one;
//   * someone without permission to create enrollments is refused;
//   * the student's other enrollments are untouched.
//
// Throwaway records only (marker ZZE2E…), removed at the end. A disposable database only.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Et#Check${stamp}xY`;
const created = { users: [], programs: [], curricula: [], years: [], subjects: [] };
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const cookies = {};
async function makeUser(key, role) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: { name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12), emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.users.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: u.email, password: PASSWORD, remember: false }) });
  const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('tdms_session='));
  if (!c) throw new Error(`login failed for ${key}`);
  cookies[key] = c.split(';')[0];
}
async function api(who, method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers: { cookie: cookies[who], ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data };
}
const page = async (who, path) => (await api(who, 'GET', `/pages${path}`)).data;
const open = (s, body) => api('secretary', 'POST', `/students/${s.id}/enrollments`, body);
const fieldSays = (r, field, re) => r.status === 422 && (r.json?.errors?.[field] ?? []).some((m) => re.test(m));

try {
  console.log(`New Enrollment Term e2e against ${BASE} (marker ${M})\n`);
  await makeUser('secretary', 'secretary');
  await makeUser('teacher', 'teacher');

  const b = 2200 + (stamp % 700);
  const year = await prisma.schoolYear.create({ data: { label: `${b}-${b + 1}`, startsOn: new Date(`${b}-06-01`), endsOn: new Date(`${b + 1}-03-31`), status: 'UPCOMING', currentSemester: 2 } });
  const archived = await prisma.schoolYear.create({ data: { label: `${b - 1}-${b}`, startsOn: new Date(`${b - 1}-06-01`), endsOn: new Date(`${b}-03-31`), status: 'ARCHIVED', currentSemester: 1 } });
  created.years.push(year.id, archived.id);
  const prog = await prisma.program.create({ data: { code: `${M}-DHT`, name: 'Diploma in Hospitality Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(prog.id);
  // A two-year curriculum: its highest subject sits in 2nd Year.
  const cur = await prisma.curriculum.create({ data: { programId: prog.id, versionLabel: 'v1', effectiveSchoolYear: year.label, isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);
  for (const level of [1, 2]) {
    const subject = await prisma.subject.create({ data: { code: `${M}-S${level}`, title: `Subject ${level}`, subjectType: 'core', defaultUnits: 3, createdAt: new Date() } });
    created.subjects.push(subject.id);
    await prisma.curriculumSubject.create({ data: { curriculumId: cur.id, subjectId: subject.id, yearLevel: level, semester: 1, units: 3 } });
  }
  const student = await prisma.student.create({ data: { studentNumber: `${M}-1`, firstName: 'Ana', lastName: `L${M}`, programId: prog.id, curriculumId: cur.id, yearLevel: 1, status: 'applicant', createdAt: new Date(), updatedAt: new Date() } });

  console.log('What the dialog offers');
  const data = await page('secretary', `/students/${student.id}/enrollment`);
  const labels = data?.termOptions.schoolYears.map((y) => y.label) ?? [];
  check('the school year we set up is offered', labels.includes(year.label), labels);
  check('…an archived one is not', !labels.includes(archived.label));
  check('…the active one, if any, is first', !data?.termOptions.schoolYears.some((y, i) => y.active && i > 0) || data.termOptions.schoolYears[0].active);
  check('…each with its current semester', data?.termOptions.schoolYears.find((y) => y.label === year.label)?.currentSemester === 2);
  check('year levels stop at the curriculum’s final year (2nd Year)', JSON.stringify(data?.termOptions.yearLevels) === '[1,2]', data?.termOptions.yearLevels);

  console.log('\nValid and invalid submissions');
  const ok = await open(student, { schoolYear: year.label, semester: 1, yearLevel: 1 });
  check('a valid term is created (201)', ok.status === 201, ok.json);
  const row = await prisma.enrollment.findFirst({ where: { studentId: student.id, schoolYear: year.label, semester: 1 } });
  check('…as pending, linked to the school-year record', row?.status === 'pending' && row?.schoolYearId === year.id);

  check('a school year never set up is refused on its field', fieldSays(await open(student, { schoolYear: '1990-1991', semester: 1, yearLevel: 1 }), 'schoolYear', /set up/));
  check('an archived school year is refused on its field', fieldSays(await open(student, { schoolYear: archived.label, semester: 1, yearLevel: 1 }), 'schoolYear', /archived/));
  check('a malformed school year is refused on its field', fieldSays(await open(student, { schoolYear: 'next year', semester: 1, yearLevel: 1 }), 'schoolYear', /format/));
  check('a 3rd semester is refused, naming the choices', fieldSays(await open(student, { schoolYear: year.label, semester: 3, yearLevel: 1 }), 'semester', /1st or 2nd Semester/));
  check('3rd Year is refused for a two-year curriculum', fieldSays(await open(student, { schoolYear: year.label, semester: 2, yearLevel: 3 }), 'yearLevel', /1st Year or 2nd Year/));
  check('…but 2nd Year is accepted', (await open(student, { schoolYear: year.label, semester: 2, yearLevel: 2 })).status === 201);

  console.log('\nDuplicates');
  check('a term the student already has is refused on its field', fieldSays(await open(student, { schoolYear: year.label, semester: 1, yearLevel: 1 }), 'schoolYear', /already has an enrollment for that term/));
  const twin = await prisma.student.create({ data: { studentNumber: `${M}-2`, firstName: 'Ben', lastName: `L${M}`, programId: prog.id, curriculumId: cur.id, yearLevel: 1, status: 'applicant', createdAt: new Date(), updatedAt: new Date() } });
  const burst = await Promise.all(Array.from({ length: 6 }, () => open(twin, { schoolYear: year.label, semester: 1, yearLevel: 1 })));
  const statuses = burst.map((r) => r.status).sort();
  check('six simultaneous submissions create exactly one enrollment', (await prisma.enrollment.count({ where: { studentId: twin.id } })) === 1, statuses);
  check('…and every other gets the duplicate message, not a server error', burst.filter((r) => r.status !== 201).every((r) => fieldSays(r, 'schoolYear', /already has an enrollment/)), statuses);

  console.log('\nPermissions and existing records');
  check('an Instructor cannot open an enrollment (403)', (await api('teacher', 'POST', `/students/${student.id}/enrollments`, { schoolYear: year.label, semester: 1, yearLevel: 1 })).status === 403);
  const mine = await prisma.enrollment.findMany({ where: { studentId: student.id }, orderBy: { id: 'asc' }, select: { semester: true, status: true } });
  check('the student has exactly the two terms created, both pending', JSON.stringify(mine) === JSON.stringify([{ semester: 1, status: 'pending' }, { semester: 2, status: 'pending' }]), mine);
  const after = await page('secretary', `/students/${student.id}/enrollment`);
  check('the page lists both terms for the dialog to flag', after?.enrollments.filter((e) => e.schoolYear === year.label).length === 2);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const students = (await prisma.student.findMany({ where: { programId: { in: created.programs } }, select: { id: true } })).map((s) => s.id);
    const enrollmentIds = (await prisma.enrollment.findMany({ where: { studentId: { in: students } }, select: { id: true } })).map((e) => e.id);
    await prisma.enrollmentStatusHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: students } } });
    await prisma.student.deleteMany({ where: { id: { in: students } } });
    await prisma.curriculumSubject.deleteMany({ where: { curriculumId: { in: created.curricula } } });
    await prisma.subject.deleteMany({ where: { id: { in: created.subjects } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
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
