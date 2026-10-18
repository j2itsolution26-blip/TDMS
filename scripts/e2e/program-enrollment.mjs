// End-to-end check of the Programs page counts and the Students filter they link to.
//
//   npm run build && PORT=3001 npm start
//   node scripts/e2e/program-enrollment.mjs     (BASE=http://host:port to point elsewhere)
//
// What it guards (server/src/services/program-enrollment.ts):
//   * "currently enrolled" = an Active student with an Enrolled enrollment for
//     the current term (active school year + its current semester);
//   * applicants, pending / rejected / dropped enrollments, other terms, and
//     transferred students do not count; a student counts once;
//   * the summary total equals the sum of the program counts;
//   * /students?program=X&enrollment=current lists exactly the counted students,
//     and an inactive program's filter still applies;
//   * who may see the page and its counts.
//
// Throwaway records only (marker ZZPE…), removed at the end. A disposable database only.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZPE${String(stamp).slice(-6)}`;
const PASSWORD = `Pe#Check${stamp}xY`;
const created = { users: [], programs: [], curricula: [], schoolYears: [] };
let passed = 0;
const failures = [];
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
};

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
  return u;
}
async function page(who, p) {
  const res = await fetch(`${BASE}/api/v1/pages${p}`, { headers: who ? { cookie: cookies[who] } : {} });
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data, redirect: json?.redirect };
}

try {
  console.log(`Program enrollment e2e against ${BASE} (marker ${M})\n`);
  await makeUser('secretary', 'secretary');
  await makeUser('teacher', 'teacher');

  // The current term: the active school year, or one made for this run.
  let year = await prisma.schoolYear.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startsOn: 'desc' } });
  if (!year) {
    year = await prisma.schoolYear.create({ data: { label: '2097-2098', startsOn: new Date('2097-06-01'), endsOn: new Date('2098-05-31'), status: 'ACTIVE', currentSemester: 1 } });
    created.schoolYears.push(year.id);
  }
  const SY = year.label, SEM = year.currentSemester, OTHER_SEM = SEM === 1 ? 2 : 1;

  async function program(code, isActive = true) {
    const p = await prisma.program.create({ data: { code: `${M}-${code}`, name: `${code} Program ${M}`, isActive, createdAt: new Date() } });
    created.programs.push(p.id);
    const cur = await prisma.curriculum.create({ data: { programId: p.id, versionLabel: `v${code}`, effectiveSchoolYear: SY, isActive: true, createdAt: new Date() } });
    created.curricula.push(cur.id);
    return { ...p, cur };
  }
  let n = 0;
  async function student(p, status, enrollments) {
    const s = await prisma.student.create({ data: { studentNumber: `${M}-${++n}`, firstName: 'S', lastName: `${M}${n}`, programId: p.id, curriculumId: p.cur.id, yearLevel: 1, status, createdAt: new Date(), updatedAt: new Date() } });
    for (const [st, sy, sem] of enrollments) {
      await prisma.enrollment.create({ data: { studentId: s.id, curriculumId: p.cur.id, schoolYear: sy, semester: sem, yearLevel: 1, status: st, createdAt: new Date(), updatedAt: new Date() } });
    }
    return s;
  }

  const A = await program('A');
  const B = await program('B');
  const C = await program('C', false);
  const counted = [
    await student(A, 'active', [['enrolled', SY, SEM]]),
    // Enrolled this term and another: counted once.
    await student(A, 'active', [['enrolled', SY, SEM], ['enrolled', SY, OTHER_SEM]]),
  ];
  await student(A, 'applicant', [['pending', SY, SEM]]); // prospective
  await student(A, 'active', [['dropped', SY, SEM]]); // dropped this term
  await student(A, 'active', [['rejected', SY, SEM]]); // rejected
  await student(A, 'transferred', [['enrolled', SY, SEM]]); // transferred out
  await student(A, 'active', [['enrolled', SY, OTHER_SEM]]); // another semester only
  await student(A, 'active', [['enrolled', '1999-2000', SEM]]); // another school year only
  await student(A, 'applicant', []); // no enrollment at all
  const countedB = await student(B, 'active', [['enrolled', SY, SEM]]);
  const countedC = await student(C, 'active', [['enrolled', SY, SEM]]); // inactive program, still counted

  // What the database says, independently of the service: distinct active students enrolled this term.
  const dbCount = async (programId) => (await prisma.$queryRaw`
    SELECT count(DISTINCT s.id)::int AS n FROM students s JOIN enrollments e ON e.student_id = s.id
    WHERE s.program_id = ${programId} AND s.status = 'active' AND e.status = 'enrolled' AND e.school_year = ${SY} AND e.semester = ${SEM}`)[0].n;

  console.log('\nCounts');
  const res = await page('secretary', '/programs');
  check('the Programs page loads (200)', res.status === 200, res.status);
  const d = res.data;
  const row = (p) => d.rows.find((r) => r.id === p.id.toString());
  check(`the current term is named (${d.term})`, d.term === `SY ${SY} · ${SEM === 1 ? '1st Semester' : SEM === 2 ? '2nd Semester' : 'Summer'}`, d.term);
  check('program A: 2 currently enrolled — excludes applicant, dropped, rejected, transferred, other terms; one student once', row(A).enrolled === 2, row(A));
  check('…and it matches a direct database count', row(A).enrolled === await dbCount(A.id));
  check('…while all 9 records are still listed as records', row(A).students === 9, row(A).students);
  check('program B: 1', row(B).enrolled === 1 && row(B).enrolled === await dbCount(B.id));
  check('inactive program C: shown, inactive, its enrolled student counted', row(C).enrolled === 1 && row(C).isActive === false);
  check('the total is the sum of the program counts', d.totalEnrolled === d.rows.reduce((s, r) => s + r.enrolled, 0), d.totalEnrolled);
  check('the active-program count matches the rows', d.activePrograms === d.rows.filter((r) => r.isActive).length);
  check('curriculum versions are reported', JSON.stringify(row(A).activeCurricula) === '["vA"]' && row(A).curriculaCount === 1);
  check('the page carries no student records, only counts', !JSON.stringify(d).includes(counted[0].studentNumber));

  console.log('\nThe Students filter behind each count');
  const listA = await page('secretary', `/students?program=${A.id}&enrollment=current`);
  const idsA = listA.data.rows.map((r) => r.id).sort();
  check('program A, enrolled this term: exactly the 2 counted students', listA.data.total === 2 && JSON.stringify(idsA) === JSON.stringify(counted.map((s) => s.id.toString()).sort()), idsA);
  check('…the filter and its term come back for the page', listA.data.filters.enrollment === 'current' && listA.data.filters.program === A.id.toString() && listA.data.currentTerm === d.term);
  check('program A without the enrollment filter: all 9 records (View Students)', (await page('secretary', `/students?program=${A.id}`)).data.total === 9);
  const listC = await page('secretary', `/students?program=${C.id}&enrollment=current`);
  check('an inactive program’s link still filters (1 student, not everyone)', listC.data.total === 1 && listC.data.rows[0].id === countedC.id.toString(), listC.data.total);
  check('…and the filter list marks it inactive', listC.data.programs.find((p) => p.id === C.id.toString())?.isActive === false);
  const listB = await page('secretary', `/students?program=${B.id}&enrollment=current`);
  check('program B: its 1 student', listB.data.total === 1 && listB.data.rows[0].id === countedB.id.toString());

  console.log('\nAfter a change, the counts follow');
  await prisma.enrollment.updateMany({ where: { studentId: counted[0].id, schoolYear: SY, semester: SEM }, data: { status: 'dropped' } });
  const after = await page('secretary', '/programs');
  check('dropping one enrollment: program A shows 1', after.data.rows.find((r) => r.id === A.id.toString()).enrolled === 1);
  check('…the total follows', after.data.totalEnrolled === d.totalEnrolled - 1);

  console.log('\nAccess');
  const anon = await page(null, '/programs');
  check('signed out: sent to sign in, no data', anon.redirect === '/login' && anon.data === undefined, anon);
  const teacher = await page('teacher', '/programs');
  check(`an Instructor: ${teacher.status === 200 ? 'may view programs, but not the student lists' : 'refused, as before'}`,
    teacher.status === 403 || (teacher.status === 200 && teacher.data.canViewStudents === false && teacher.data.canUpdate === false), { status: teacher.status, can: teacher.data && { s: teacher.data.canViewStudents, u: teacher.data.canUpdate } });
  check('the Secretary sees the student links and may not edit programs without programs.manage', res.data.canViewStudents === true);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const students = (await prisma.student.findMany({ where: { programId: { in: created.programs } }, select: { id: true } })).map((s) => s.id);
    await prisma.enrollment.deleteMany({ where: { studentId: { in: students } } });
    await prisma.student.deleteMany({ where: { id: { in: students } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.schoolYears } } });
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
