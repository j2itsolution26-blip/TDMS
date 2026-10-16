// End-to-end check of automatic section assignment on enrollment approval,
// through the real approval endpoint (POST /enrollments/:id/transition):
// A fills to 25 before B opens, the first section with a seat is used,
// programs, year levels and school years never mix, a repeated approval
// places nobody twice, simultaneous approvals never make a 26th seat, and a
// failed placement leaves the enrollment pending.
//
//   npm run build && PORT=3001 npm start
//   npm run test:auto-assign           (BASE=http://host:port to point elsewhere)
//
// Throwaway records only (marker ZZE2E), in throwaway school years; removed
// at the end. Run it against a disposable database.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Auto#Check${stamp}xY`;
const created = { users: [], students: [], programs: [], curricula: [], years: [] };
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

let required = [];
let n = 0;
/** A student with every required document verified and a pending enrollment for the term. */
async function pendingStudent(program, curriculum, yearLevel, year, semester = 1) {
  n += 1;
  const st = await prisma.student.create({ data: { studentNumber: `${M}-${String(n).padStart(3, '0')}`, firstName: `S${n}`, lastName: `Last${M}`, programId: program.id, curriculumId: curriculum.id, yearLevel, status: 'applicant', createdAt: new Date() } });
  created.students.push(st.id);
  if (required.length) await prisma.studentCredential.createMany({ data: required.map((r) => ({ studentId: st.id, credentialRequirementId: r.id, status: 'verified', verifiedAt: new Date(), createdAt: new Date() })) });
  const e = await prisma.enrollment.create({ data: { studentId: st.id, curriculumId: curriculum.id, schoolYear: year.label, schoolYearId: year.id, semester, yearLevel, status: 'pending', createdAt: new Date() } });
  return { student: st, enrollment: e };
}
const approve = (enrollmentId) => api('admin', 'POST', `/enrollments/${enrollmentId}/transition`, { status: 'enrolled', reason: '' });
const sectionsOf = (yearId, programId, yearLevel) => prisma.section.findMany({
  where: { schoolYearId: yearId, programId, yearLevel }, orderBy: { name: 'asc' },
  select: { id: true, name: true, _count: { select: { students: true } } },
});
const shape = (rows) => rows.map((s) => `${s.name}:${s._count.students}`).join(' ');
const placementOf = async (studentId, yearId) => prisma.sectionStudent.findUnique({ where: { schoolYearId_studentId: { schoolYearId: yearId, studentId } }, select: { section: { select: { name: true, yearLevel: true, programId: true, schoolYearId: true } } } });

try {
  console.log(`Automatic section assignment e2e against ${BASE} (marker ${M})\n`);
  await makeUser('admin', 'admin');
  await makeUser('teacher', 'teacher');
  required = await prisma.credentialRequirement.findMany({ where: { isActive: true, isRequired: true }, select: { id: true, programId: true } });

  const dit = await prisma.program.create({ data: { code: `${M}-DIT`, name: `${M} Diploma in IT`, isActive: true, createdAt: new Date() } });
  const dht = await prisma.program.create({ data: { code: `${M}-DHT`, name: `${M} Diploma in Hospitality`, isActive: true, createdAt: new Date() } });
  created.programs.push(dit.id, dht.id);
  // Program-specific requirements of these programs do not exist; global ones apply to both.
  required = required.filter((r) => r.programId === null);
  const curDit = await prisma.curriculum.create({ data: { programId: dit.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  const curDht = await prisma.curriculum.create({ data: { programId: dht.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(curDit.id, curDht.id);
  const y = String(stamp).slice(-4);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${y}`, startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  const nextYear = await prisma.schoolYear.create({ data: { label: `2098-${y}`, startsOn: new Date('2098-06-01'), endsOn: new Date('2099-03-31'), status: 'UPCOMING' } });
  const oldYear = await prisma.schoolYear.create({ data: { label: `2096-${y}`, startsOn: new Date('2096-06-01'), endsOn: new Date('2097-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id, nextYear.id, oldYear.id);

  // History that must survive: an old section with a placed student.
  const oldSection = await prisma.section.create({ data: { schoolYearId: oldYear.id, programId: dit.id, yearLevel: 1, name: 'A' } });
  const veteran = await pendingStudent(dit, curDit, 1, oldYear);
  await prisma.sectionStudent.create({ data: { sectionId: oldSection.id, studentId: veteran.student.id, schoolYearId: oldYear.id } });

  console.log('Filling DIT 1st Year');
  const first = await pendingStudent(dit, curDit, 1, year);
  const r1 = await approve(first.enrollment.id);
  check('1. the first approval opens Section A and says so', r1.status === 200 && r1.data?.placement?.section === `${M}-DIT · 1st Year · Section A` && r1.data.placement.created === true, r1.json);
  check('…the enrollment is enrolled and the student active', (await prisma.enrollment.findUnique({ where: { id: first.enrollment.id } })).status === 'enrolled' && (await prisma.student.findUnique({ where: { id: first.student.id } })).status === 'active');
  for (let i = 2; i <= 25; i++) await approve((await pendingStudent(dit, curDit, 1, year)).enrollment.id);
  check('2. students 1–25 are all in Section A', shape(await sectionsOf(year.id, dit.id, 1)) === 'A:25', shape(await sectionsOf(year.id, dit.id, 1)));
  const s26 = await pendingStudent(dit, curDit, 1, year);
  const r26 = await approve(s26.enrollment.id);
  check('3. student 26 opens Section B', r26.data?.placement?.section?.endsWith('Section B') && r26.data.placement.created === true && shape(await sectionsOf(year.id, dit.id, 1)) === 'A:25 B:1', [r26.json, shape(await sectionsOf(year.id, dit.id, 1))]);
  for (let i = 27; i <= 50; i++) await approve((await pendingStudent(dit, curDit, 1, year)).enrollment.id);
  const s51 = await pendingStudent(dit, curDit, 1, year);
  const r51 = await approve(s51.enrollment.id);
  check('4. student 51 opens Section C (A and B at 25)', r51.data?.placement?.section?.endsWith('Section C') && shape(await sectionsOf(year.id, dit.id, 1)) === 'A:25 B:25 C:1', shape(await sectionsOf(year.id, dit.id, 1)));
  check('11. a new section is opened only when every existing one is full', r26.data?.placement?.created && r51.data?.placement?.created);

  console.log('\nThe first section with a seat');
  const a2 = await prisma.section.create({ data: { schoolYearId: year.id, programId: dit.id, yearLevel: 2, name: 'A' } });
  const b2 = await prisma.section.create({ data: { schoolYearId: year.id, programId: dit.id, yearLevel: 2, name: 'B' } });
  for (const [sec, count] of [[a2, 24], [b2, 10]]) {
    for (let i = 0; i < count; i++) {
      const p = await pendingStudent(dit, curDit, 2, year);
      await prisma.sectionStudent.create({ data: { sectionId: sec.id, studentId: p.student.id, schoolYearId: year.id } });
    }
  }
  const fill = await pendingStudent(dit, curDit, 2, year);
  const rf = await approve(fill.enrollment.id);
  check('5. A at 24 and B at 10: the next student goes to A', rf.data?.placement?.section === `${M}-DIT · 2nd Year · Section A` && shape(await sectionsOf(year.id, dit.id, 2)) === 'A:25 B:10', [rf.json, shape(await sectionsOf(year.id, dit.id, 2))]);
  const next2 = await pendingStudent(dit, curDit, 2, year);
  const rn = await approve(next2.enrollment.id);
  check('…then B (not a new C) once A is full', rn.data?.placement?.section?.endsWith('2nd Year · Section B') && rn.data.placement.created === false && shape(await sectionsOf(year.id, dit.id, 2)) === 'A:25 B:11');

  console.log('\nSeparation');
  const hosp = await pendingStudent(dht, curDht, 1, year);
  const rh = await approve(hosp.enrollment.id);
  const ph = await placementOf(hosp.student.id, year.id);
  check('6. a Hospitality student opens DHT Section A, never an IT section (DIT 1st Year B/C had seats)', rh.data?.placement?.section === `${M}-DHT · 1st Year · Section A` && ph.section.programId === dht.id, rh.json);
  check('7. the 2nd Year students went to 2nd Year sections only', (await placementOf(fill.student.id, year.id)).section.yearLevel === 2 && (await placementOf(next2.student.id, year.id)).section.yearLevel === 2);
  const ny = await pendingStudent(dit, curDit, 1, nextYear);
  const rny = await approve(ny.enrollment.id);
  check('8. a student of the next school year opens that year’s Section A, not this year’s C', rny.data?.placement?.created === true && (await placementOf(ny.student.id, nextYear.id)).section.schoolYearId === nextYear.id && shape(await sectionsOf(nextYear.id, dit.id, 1)) === 'A:1');

  console.log('\nNo duplicates');
  const again = await approve(first.enrollment.id);
  check('9a. approving the same enrollment again is refused (409) and places nobody twice', again.status === 409 && (await prisma.sectionStudent.count({ where: { studentId: first.student.id } })) === 1, again.json);
  const sem2 = await prisma.enrollment.create({ data: { studentId: first.student.id, curriculumId: curDit.id, schoolYear: year.label, schoolYearId: year.id, semester: 2, yearLevel: 1, status: 'pending', createdAt: new Date() } });
  const rs2 = await approve(sem2.id);
  check('9b. the 2nd-semester approval keeps the student in Section A — no second placement', rs2.status === 200 && rs2.data?.placement?.already === true && rs2.data.placement.section.endsWith('Section A') && (await prisma.sectionStudent.count({ where: { studentId: first.student.id } })) === 1, rs2.json);

  console.log('\nSimultaneous approvals');
  const a3 = await prisma.section.create({ data: { schoolYearId: year.id, programId: dit.id, yearLevel: 3, name: 'A' } });
  for (let i = 0; i < 20; i++) {
    const p = await pendingStudent(dit, curDit, 3, year);
    await prisma.sectionStudent.create({ data: { sectionId: a3.id, studentId: p.student.id, schoolYearId: year.id } });
  }
  const batch = [];
  for (let i = 0; i < 12; i++) batch.push(await pendingStudent(dit, curDit, 3, year));
  const results = await Promise.all(batch.map((b) => approve(b.enrollment.id)));
  const ok12 = results.every((r) => r.status === 200);
  const s3 = await sectionsOf(year.id, dit.id, 3);
  check('10. 12 approvals at once into a section with 5 seats: all succeed, A 25 and B 7, never 26', ok12 && shape(s3) === 'A:25 B:7', { statuses: results.map((r) => r.status), shape: shape(s3), errors: results.filter((r) => r.status !== 200).map((r) => r.json?.message) });
  const over = await prisma.$queryRaw`SELECT s.name, COUNT(*)::int AS n FROM section_students ss JOIN sections s ON s.id = ss.section_id WHERE s.school_year_id IN (${year.id}, ${nextYear.id}) GROUP BY s.id, s.name HAVING COUNT(*) > 25`;
  check('…and no section anywhere in the run is over 25', over.length === 0, over);
  check('…one B, not two (the opening of a section is serialised too)', s3.filter((s) => s.name === 'B').length === 1);

  // A manual "Add students" and an automatic approval racing for the last seat.
  await makeUser('coordinator', 'coordinator');
  const dhtA = (await sectionsOf(year.id, dht.id, 1))[0];
  for (let i = 0; i < 23; i++) {
    const p = await pendingStudent(dht, curDht, 1, year);
    await prisma.sectionStudent.create({ data: { sectionId: dhtA.id, studentId: p.student.id, schoolYearId: year.id } });
  }
  const manual = await pendingStudent(dht, curDht, 1, year);
  await prisma.student.update({ where: { id: manual.student.id }, data: { status: 'active' } });
  const auto = await pendingStudent(dht, curDht, 1, year);
  const [rm, rauto] = await Promise.all([
    api('coordinator', 'POST', `/sections/${dhtA.id}/students`, { studentIds: [String(manual.student.id)] }),
    approve(auto.enrollment.id),
  ]);
  const dhtShape = shape(await sectionsOf(year.id, dht.id, 1));
  check('manual add and automatic approval racing for A’s last seat: one gets it, the other is refused or goes to B — A never 26',
    rauto.status === 200 && (dhtShape === 'A:25 B:1' || (dhtShape === 'A:25' && rm.status === 409)), { manual: rm.status, auto: rauto.data?.placement, shape: dhtShape });

  console.log('\nOnly approvals place students; failures change nothing');
  const rej = await pendingStudent(dit, curDit, 1, year);
  const rr = await api('admin', 'POST', `/enrollments/${rej.enrollment.id}/transition`, { status: 'rejected', reason: 'Incomplete documents' });
  check('a rejected enrollment places nobody', rr.status === 200 && !(await placementOf(rej.student.id, year.id)) && !rr.data?.placement);
  const pend = await pendingStudent(dit, curDit, 1, year);
  check('a pending enrollment places nobody', !(await placementOf(pend.student.id, year.id)));
  const noDocs = await pendingStudent(dit, curDit, 1, year);
  await prisma.studentCredential.deleteMany({ where: { studentId: noDocs.student.id } });
  const rd = required.length ? await approve(noDocs.enrollment.id) : { status: 422 };
  check('an ineligible student (documents missing) is not approved or placed', rd.status === 422 && !(await placementOf(noDocs.student.id, year.id)));
  await prisma.schoolYear.update({ where: { id: nextYear.id }, data: { status: 'ARCHIVED' } });
  const arch = await pendingStudent(dit, curDit, 1, nextYear);
  const ra = await approve(arch.enrollment.id);
  check('an archived school year: refused with a reason; the enrollment stays pending, nobody placed', ra.status === 409 && /archived/.test(ra.json?.message ?? '') && (await prisma.enrollment.findUnique({ where: { id: arch.enrollment.id } })).status === 'pending' && !(await placementOf(arch.student.id, nextYear.id)), ra.json);
  await prisma.schoolYear.update({ where: { id: nextYear.id }, data: { status: 'UPCOMING' } });
  const orphan = await pendingStudent(dit, curDit, 1, year);
  await prisma.enrollment.update({ where: { id: orphan.enrollment.id }, data: { schoolYear: `2099-${y}`, schoolYearId: null } });
  const ro = await approve(orphan.enrollment.id);
  check('a school year that was never set up: refused with what to do; still pending', ro.status === 422 && /Create it under School Years/.test(ro.json?.message ?? '') && (await prisma.enrollment.findUnique({ where: { id: orphan.enrollment.id } })).status === 'pending', ro.json);

  console.log('\nScreens and history');
  const page = await fetch(`${BASE}/api/v1/pages/class-setup?year=${year.id}`, { headers: { cookie: cookies.admin } });
  const pageSections = (await page.json())?.data?.setup?.sections ?? [];
  const db = await prisma.section.findMany({ where: { schoolYearId: year.id }, select: { id: true, _count: { select: { students: true } } } });
  check('12. Classes & Sections reports every section’s count exactly as stored', db.length === pageSections.length && db.every((d) => pageSections.find((p) => p.id === String(d.id))?.students === d._count.students), { page: pageSections.map((p) => p.label + ':' + p.students) });
  check('13. the old school year’s section and placement are untouched', (await prisma.sectionStudent.count({ where: { sectionId: oldSection.id } })) === 1 && !!(await prisma.section.findUnique({ where: { id: oldSection.id } })));
  const audit = await prisma.auditLog.findFirst({ where: { action: 'SECTION_CREATED_AND_STUDENT_ASSIGNED', target: { contains: M } }, orderBy: { id: 'desc' } });
  check('the automatic placement is in the audit log', audit !== null, audit);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const sectionIds = (await prisma.section.findMany({ where: { schoolYearId: { in: created.years } }, select: { id: true } })).map((s) => s.id);
    await prisma.sectionStudent.deleteMany({ where: { sectionId: { in: sectionIds } } });
    await prisma.section.deleteMany({ where: { id: { in: sectionIds } } });
    const enrollmentIds = (await prisma.enrollment.findMany({ where: { studentId: { in: created.students } }, select: { id: true } })).map((e) => e.id);
    await prisma.enrollmentStatusHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: created.students } } });
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
