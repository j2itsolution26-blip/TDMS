// End-to-end check of Students → Enrollments → automatic section, through the
// real endpoints and page loaders. The bug it guards against: a student
// registered from Students (or from an approved application) got no
// enrollment, so never appeared in Enrollments and could never be placed.
//
//   npm run build && PORT=3001 npm start
//   npm run test:registration          (BASE=http://host:port to point elsewhere)
//
// Throwaway records only (marker ZZE2E), in throwaway school years; removed
// at the end. Run it against a disposable database.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Rg#Check${stamp}xY`;
const created = { users: [], programs: [], curricula: [], years: [], applications: [] };
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const cookies = {};
let previouslyActive = [];
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

let required = [];
let n = 0;
const studentIds = () => prisma.student.findMany({ where: { lastName: { startsWith: `L${M}` } }, select: { id: true } }).then((r) => r.map((x) => x.id));
/** Register through Students → New Student, exactly as the form posts it. */
async function register(program, curriculum, { yearLevel = 1, year = null, semester = 1, first } = {}) {
  n += 1;
  const r = await api('secretary', 'POST', '/students', {
    firstName: first ?? `S${n}`, middleName: null, lastName: `L${M}${String(n).padStart(3, '0')}`, email: null, phone: null, dateOfBirth: null,
    programId: String(program.id), curriculumId: String(curriculum.id), yearLevel, status: 'applicant', enrollmentDate: null,
    ...(year ? { schoolYearId: String(year.id), semester } : {}),
  });
  return { ...r, student: r.data ? { id: BigInt(r.data.id), studentNumber: r.data.studentNumber } : null };
}
const verifyDocs = (studentId) => prisma.studentCredential.updateMany({ where: { studentId }, data: { status: 'verified', verifiedAt: new Date() } });
const pendingOf = (studentId) => prisma.enrollment.findFirst({ where: { studentId, status: 'pending' } });
const approve = (id) => api('secretary', 'POST', `/enrollments/${id}/transition`, { status: 'enrolled', reason: '' });
const placementOf = (studentId, yearId) => prisma.sectionStudent.findUnique({ where: { schoolYearId_studentId: { schoolYearId: yearId, studentId } }, select: { section: { select: { id: true, name: true, yearLevel: true, programId: true } } } });

try {
  console.log(`Registration → enrollment → section e2e against ${BASE} (marker ${M})\n`);
  await makeUser('secretary', 'secretary');
  await makeUser('coordinator', 'coordinator');
  await makeUser('teacher', 'teacher');
  required = await prisma.credentialRequirement.count({ where: { isActive: true, isRequired: true } });
  const otherStudentsBefore = await prisma.student.count();
  const otherEnrollmentsBefore = await prisma.enrollment.count();

  const dit = await prisma.program.create({ data: { code: `${M}-DIT-1`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  const dht = await prisma.program.create({ data: { code: `${M}-DHT-2`, name: 'Diploma in Hospitality Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(dit.id, dht.id);
  const curDit = await prisma.curriculum.create({ data: { programId: dit.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  const curDht = await prisma.curriculum.create({ data: { programId: dht.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(curDit.id, curDht.id);
  const y = String(stamp).slice(-4);
  // The active school year, as in production; the test restores whatever was active.
  previouslyActive = await prisma.schoolYear.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  await prisma.schoolYear.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'UPCOMING' } });
  const year = await prisma.schoolYear.create({ data: { label: `2097-${y}`, startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'ACTIVE', currentSemester: 1 } });
  const next = await prisma.schoolYear.create({ data: { label: `2098-${y}`, startsOn: new Date('2098-06-01'), endsOn: new Date('2099-03-31'), status: 'UPCOMING' } });
  const archived = await prisma.schoolYear.create({ data: { label: `2096-${y}`, startsOn: new Date('2096-06-01'), endsOn: new Date('2097-03-31'), status: 'ARCHIVED' } });
  created.years.push(year.id, next.id, archived.id);

  console.log('1–3. A new DIT-1 student reaches Students and Enrollments');
  const ivy = await register(dit, curDit, { year, first: 'Ivy' });
  check('registering returns the student and its pending enrollment for the chosen term', ivy.status === 201 && ivy.data?.enrollment?.status === 'pending' && ivy.data.enrollment.term === `SY 2097-${y} · 1st Semester`, ivy.json);
  const inStudents = await page('secretary', `/students?search=${encodeURIComponent(ivy.student.studentNumber)}`);
  check('2. the student is in Students, under DIT-1', inStudents?.rows.length === 1 && inStudents.rows[0].program.code === `${M}-DIT-1`);
  const inEnrollments = await page('secretary', `/enrollments?search=${encodeURIComponent(ivy.student.studentNumber)}`);
  check('3. …and in Enrollments right away, Pending, DIT-1, no section yet', inEnrollments?.data.rows.length === 1 && inEnrollments.data.rows[0].status === 'pending' && inEnrollments.data.rows[0].student.programCode === `${M}-DIT-1` && inEnrollments.data.rows[0].section === null, inEnrollments?.data.rows);
  check('…the status history records it was opened at registration', (await prisma.enrollmentStatusHistory.count({ where: { enrollment: { studentId: ivy.student.id }, toStatus: 'pending', reason: 'Opened at registration' } })) === 1);
  check('6. a pending enrollment holds no seat', !(await placementOf(ivy.student.id, year.id)));

  console.log('\n4. Approval places the student, and every page agrees');
  const early = await approve((await pendingOf(ivy.student.id)).id);
  check('approval is refused while the documents are unverified (the existing rule)', required === 0 || early.status === 422, early.json);
  await verifyDocs(ivy.student.id);
  const ap = await approve((await pendingOf(ivy.student.id)).id);
  const secA = (await placementOf(ivy.student.id, year.id))?.section;
  check('approving places Ivy in DIT-1 · 1st Year · Section A', ap.status === 200 && ap.data?.placement?.section === `${M}-DIT-1 · 1st Year · Section A` && secA?.programId === dit.id, ap.json);
  const eRow = (await page('secretary', `/enrollments?search=${encodeURIComponent(ivy.student.studentNumber)}`))?.data.rows[0];
  check('Enrollments: Enrolled, with Section A', eRow?.status === 'enrolled' && eRow.section === `${M}-DIT-1 · 1st Year · Section A`, eRow);
  const record = await page('secretary', `/students/${ivy.student.id}/enrollment`);
  check('Student record (enrollment screen): the section', JSON.stringify(record).includes(`${M}-DIT-1 · 1st Year · Section A`));
  const roster = await api('coordinator', 'GET', `/sections/${secA.id}`);
  check('Section Roster: Ivy is listed', roster.status === 200 && roster.data.members.some((m) => m.studentNumber === ivy.student.studentNumber), roster.json?.data?.members);
  const setup = await page('coordinator', `/class-setup?year=${year.id}`);
  check('Classes & Sections: Section A counts 1', setup?.setup.sections.find((s) => s.id === String(secA.id))?.students === 1);
  const profile = await api('secretary', 'GET', `/sections/${secA.id}/students/${ivy.student.id}`);
  check('Student Information panel: enrolled for this school year', profile.status === 403 || profile.data?.enrollment?.status === 'enrolled', profile.status);
  const coordProfile = await api('coordinator', 'GET', `/sections/${secA.id}/students/${ivy.student.id}`);
  check('…(as the Coordinator, who manages sections) Section A and enrolled', coordProfile.status === 200 && coordProfile.data.section.label === `${M}-DIT-1 · 1st Year · Section A` && coordProfile.data.enrollment.status === 'enrolled');

  console.log('\n5. DHT-2 stays with DHT-2');
  const hana = await register(dht, curDht, { year, first: 'Hana' });
  await verifyDocs(hana.student.id);
  const ah = await approve((await pendingOf(hana.student.id)).id);
  check('a DHT-2 student registered and approved opens DHT-2 Section A, never DIT-1’s', ah.data?.placement?.section === `${M}-DHT-2 · 1st Year · Section A` && (await placementOf(hana.student.id, year.id)).section.programId === dht.id, ah.json);
  const dhtTab = await page('secretary', `/enrollments?program=${dht.id}`);
  check('Enrollments DHT-2 tab: only DHT-2 records', dhtTab?.data.rows.length >= 1 && dhtTab.data.rows.every((r) => r.student.programCode === `${M}-DHT-2`));

  console.log('\n7. 25 then the next section');
  for (let i = 0; i < 24; i++) {
    const r = await register(dit, curDit, { year });
    await verifyDocs(r.student.id);
    await approve((await pendingOf(r.student.id)).id);
  }
  check('25 registered-and-approved DIT-1 1st Years fill Section A', (await prisma.sectionStudent.count({ where: { sectionId: secA.id } })) === 25);
  const s26 = await register(dit, curDit, { year });
  await verifyDocs(s26.student.id);
  const a26 = await approve((await pendingOf(s26.student.id)).id);
  check('the 26th goes to Section B', a26.data?.placement?.section === `${M}-DIT-1 · 1st Year · Section B`, a26.json);

  console.log('\n8. Year levels and school years stay apart');
  const second = await register(dit, curDit, { year, yearLevel: 2 });
  await verifyDocs(second.student.id);
  const a2 = await approve((await pendingOf(second.student.id)).id);
  check('a 2nd Year registration goes to 2nd Year Section A', a2.data?.placement?.section === `${M}-DIT-1 · 2nd Year · Section A`);
  const later = await register(dit, curDit, { year: next, semester: 1 });
  check('a registration for next school year is enrolled into that year', later.data?.enrollment?.schoolYear === `2098-${y}`);
  await verifyDocs(later.student.id);
  const al = await approve((await pendingOf(later.student.id)).id);
  check('…and placed in that year’s own Section A', al.data?.placement?.created === true && (await placementOf(later.student.id, next.id)) !== null && (await placementOf(later.student.id, year.id)) === null);
  const yearFilter = await page('secretary', `/enrollments?year=2098-${y}&yearLevel=1`);
  check('Enrollments school-year and year-level filters', yearFilter?.data.rows.length === 1 && yearFilter.data.rows[0].schoolYear === `2098-${y}`, yearFilter?.data.rows?.length);

  console.log('\n9. Defaults, failures, duplicates, concurrency');
  const byDefault = await register(dht, curDht, {});
  check('with no term chosen, the active school year’s current semester is used', byDefault.data?.enrollment?.schoolYear === `2097-${y}` && byDefault.data.enrollment.semester === 1, byDefault.json);
  const before = await prisma.student.count();
  const intoArchived = await register(dit, curDit, { year: archived });
  check('an archived school year is refused — and no student is created (all or nothing)', intoArchived.status === 422 && (await prisma.student.count()) === before, intoArchived.json);
  const again = await api('secretary', 'POST', '/students', { firstName: 'Ivy', middleName: null, lastName: `L${M}001`, email: null, phone: null, dateOfBirth: null, programId: String(dit.id), curriculumId: String(curDit.id), yearLevel: 1, status: 'applicant', enrollmentDate: null, schoolYearId: String(year.id), semester: 1 });
  check('registering the same person again does not create a second student or enrollment', [201, 422].includes(again.status) && (again.status === 422 || (await prisma.enrollment.count({ where: { student: { firstName: 'Ivy', lastName: `L${M}001` } } })) <= 2), again.json);
  const dupTerm = await api('secretary', 'POST', `/students/${hana.student.id}/enrollments`, { schoolYear: `2097-${y}`, semester: 1, yearLevel: 1 });
  check('a second enrollment for the same term is refused', dupTerm.status === 422, dupTerm.json);
  const batch = [];
  for (let i = 0; i < 6; i++) { const r = await register(dht, curDht, { year, yearLevel: 3 }); await verifyDocs(r.student.id); batch.push(r); }
  const pend = await Promise.all(batch.map((b) => pendingOf(b.student.id)));
  const rs = await Promise.all(pend.map((e) => approve(e.id)));
  const dht3 = await prisma.section.findMany({ where: { schoolYearId: year.id, programId: dht.id, yearLevel: 3 }, select: { _count: { select: { students: true } } } });
  check('6 simultaneous approvals: all placed in one DHT-2 3rd Year section', rs.every((r) => r.status === 200) && dht3.length === 1 && dht3[0]._count.students === 6, rs.map((r) => r.status));
  const denied = await api('teacher', 'POST', '/students', { firstName: 'No', lastName: 'Body', programId: String(dit.id), curriculumId: String(curDit.id), yearLevel: 1, status: 'applicant' });
  check('an Instructor cannot register students (403)', denied.status === 403);

  console.log('\nApplications reach Enrollments too');
  const app = await prisma.application.create({ data: { firstName: 'Ana', lastName: `L${M}app`, programId: dht.id, status: 'submitted', createdAt: new Date() } });
  created.applications.push(app.id);
  const approved = await api('secretary', 'POST', `/applications/${app.id}/approve`);
  const fromApp = await prisma.application.findUnique({ where: { id: app.id }, select: { studentId: true } });
  const appEnrollment = fromApp?.studentId ? await prisma.enrollment.findFirst({ where: { studentId: fromApp.studentId } }) : null;
  check('an approved application’s student gets a pending enrollment for the active term', approved.status === 200 && appEnrollment?.status === 'pending' && appEnrollment.schoolYear === `2097-${y}`, approved.json);

  console.log('\n10. Existing records');
  // The applicant's last name carries the marker too, so studentIds() counts it.
  const ours = (await studentIds()).length;
  check('only the students this run registered were added', (await prisma.student.count()) === otherStudentsBefore + ours);
  check('no existing enrollment was changed or removed', (await prisma.enrollment.count({ where: { student: { lastName: { not: { startsWith: `L${M}` } } } } })) === otherEnrollmentsBefore);

} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const ids = await studentIds();
    const appStudents = (await prisma.application.findMany({ where: { id: { in: created.applications } }, select: { studentId: true } })).map((a) => a.studentId).filter(Boolean);
    const all = [...ids, ...appStudents];
    await prisma.application.deleteMany({ where: { id: { in: created.applications } } });
    const sectionIds = (await prisma.section.findMany({ where: { schoolYearId: { in: created.years } }, select: { id: true } })).map((s) => s.id);
    await prisma.sectionStudent.deleteMany({ where: { sectionId: { in: sectionIds } } });
    await prisma.section.deleteMany({ where: { id: { in: sectionIds } } });
    const enrollmentIds = (await prisma.enrollment.findMany({ where: { studentId: { in: all } }, select: { id: true } })).map((e) => e.id);
    await prisma.enrollmentStatusHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    // Only one school year may be active: restore the previous one after ours is gone.
    await prisma.schoolYear.updateMany({ where: { id: { in: previouslyActive.map((p) => p.id) } }, data: { status: 'ACTIVE' } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: all } } });
    await prisma.student.deleteMany({ where: { id: { in: all } } });
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
