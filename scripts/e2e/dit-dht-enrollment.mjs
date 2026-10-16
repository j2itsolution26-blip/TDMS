// End-to-end check of DIT/DHT student management and enrollment, through the
// real endpoints and page loaders: registering a student under a diploma
// program, the Students filters, the Enrollments program tabs and search,
// automatic section assignment on approval, program/year-level/school-year
// separation, the 25-seat limit, pending and rejected enrollments taking no
// seat, duplicate terms refused, authorization, and the seat freed again when
// an enrollment is dropped or a student is transferred.
//
//   npm run build && PORT=3001 npm start
//   npm run test:dit-dht               (BASE=http://host:port to point elsewhere)
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
const PASSWORD = `Dd#Check${stamp}xY`;
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
const page = async (who, path) => (await api(who, 'GET', `/pages${path}`)).data;

let required = [];
let n = 0;
async function verifyDocs(studentId) {
  if (required.length) await prisma.studentCredential.createMany({ data: required.map((r) => ({ studentId, credentialRequirementId: r.id, status: 'verified', verifiedAt: new Date(), createdAt: new Date() })), skipDuplicates: true });
  await prisma.studentCredential.updateMany({ where: { studentId }, data: { status: 'verified', verifiedAt: new Date() } });
}
/** A student straight in the database, documents verified, with a pending enrollment for the term. */
async function pendingStudent(program, curriculum, yearLevel, year, semester = 1) {
  n += 1;
  const st = await prisma.student.create({ data: { studentNumber: `${M}-${String(n).padStart(3, '0')}`, firstName: `S${n}`, lastName: `Last${M}`, programId: program.id, curriculumId: curriculum.id, yearLevel, status: 'applicant', createdAt: new Date() } });
  created.students.push(st.id);
  await verifyDocs(st.id);
  const e = await prisma.enrollment.create({ data: { studentId: st.id, curriculumId: curriculum.id, schoolYear: year.label, schoolYearId: year.id, semester, yearLevel, status: 'pending', createdAt: new Date() } });
  return { student: st, enrollment: e };
}
const approve = (who, id) => api(who, 'POST', `/enrollments/${id}/transition`, { status: 'enrolled', reason: '' });
const seats = (sectionId) => prisma.sectionStudent.count({ where: { sectionId } });
const placementOf = (studentId, yearId) => prisma.sectionStudent.findUnique({ where: { schoolYearId_studentId: { schoolYearId: yearId, studentId } }, select: { section: { select: { id: true, name: true, yearLevel: true, programId: true } } } });

try {
  console.log(`DIT/DHT enrollment e2e against ${BASE} (marker ${M})\n`);
  await makeUser('admin', 'admin');
  await makeUser('secretary', 'secretary');
  await makeUser('teacher', 'teacher');
  required = await prisma.credentialRequirement.findMany({ where: { isActive: true, isRequired: true, programId: null }, select: { id: true } });

  const dit = await prisma.program.create({ data: { code: `${M}-DIT-1`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  const dht = await prisma.program.create({ data: { code: `${M}-DHT-2`, name: 'Diploma in Hospitality Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(dit.id, dht.id);
  const curDit = await prisma.curriculum.create({ data: { programId: dit.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  const curDht = await prisma.curriculum.create({ data: { programId: dht.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(curDit.id, curDht.id);
  const y = String(stamp).slice(-4);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${y}`, startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  const next = await prisma.schoolYear.create({ data: { label: `2098-${y}`, startsOn: new Date('2098-06-01'), endsOn: new Date('2099-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id, next.id);

  console.log('1–2. Registering under a diploma program');
  const body = (programId, curriculumId, first) => ({ firstName: first, middleName: null, lastName: `Reg${M}`, email: null, phone: null, dateOfBirth: null, programId: String(programId), curriculumId: String(curriculumId), yearLevel: 1, status: 'applicant', enrollmentDate: null });
  const rDit = await api('secretary', 'POST', '/students', body(dit.id, curDit.id, 'Ivy'));
  const rDht = await api('secretary', 'POST', '/students', body(dht.id, curDht.id, 'Hana'));
  const ivy = await prisma.student.findFirst({ where: { lastName: `Reg${M}`, firstName: 'Ivy' } });
  const hana = await prisma.student.findFirst({ where: { lastName: `Reg${M}`, firstName: 'Hana' } });
  if (ivy) created.students.push(ivy.id);
  if (hana) created.students.push(hana.id);
  check('a DIT-1 and a DHT-2 student are registered with their program', [200, 201].includes(rDit.status) && [200, 201].includes(rDht.status) && ivy?.programId === dit.id && hana?.programId === dht.id, [rDit.json, rDht.json]);
  check('…each gets its own unique student number', ivy && hana && ivy.studentNumber !== hana.studentNumber);
  const mixed = await api('secretary', 'POST', '/students', body(dit.id, curDht.id, 'Mix'));
  check('a curriculum of the other program is refused at registration', mixed.status === 422, mixed.json);
  const listDit = await page('secretary', `/students?program=${dit.id}&search=Reg${M}`);
  const listDht = await page('secretary', `/students?program=${dht.id}&search=Reg${M}`);
  check('Students filtered by DIT-1 shows only Ivy, by DHT-2 only Hana — with code and name', listDit?.rows.map((r) => r.fullName).join() === `Ivy Reg${M}` && listDht?.rows.map((r) => r.fullName).join() === `Hana Reg${M}` && listDit.rows[0].program.code === `${M}-DIT-1` && listDit.rows[0].program.name === 'Diploma in Information Technology', [listDit?.rows, listDht?.rows]);
  const byStatus = await page('secretary', `/students?status=graduated&search=Reg${M}`);
  const byYear = await page('secretary', `/students?yearLevel=2&search=Reg${M}`);
  check('Students filters by status and year level', byStatus?.rows.length === 0 && byYear?.rows.length === 0 && (await page('secretary', `/students?status=applicant&yearLevel=1&search=Reg${M}`))?.rows.length === 2);
  check('the filters come back in the page data (kept through paging)', listDit?.filters?.program === String(dit.id));

  console.log('\n3. Enrolling and approving: the program comes from the student');
  const en = await api('secretary', 'POST', `/students/${ivy.id}/enrollments`, { schoolYear: year.label, semester: 1, yearLevel: 1, curriculumId: String(curDht.id) });
  const ivyEnrollment = await prisma.enrollment.findFirst({ where: { studentId: ivy.id, schoolYear: year.label } });
  check('the enrollment takes Ivy’s own DIT-1 curriculum, even when another is sent', [200, 201].includes(en.status) && ivyEnrollment?.curriculumId === curDit.id, en.json);
  const dup = await api('secretary', 'POST', `/students/${ivy.id}/enrollments`, { schoolYear: year.label, semester: 1, yearLevel: 1 });
  check('a second enrollment for the same term is refused', dup.status === 422, dup.json);
  await verifyDocs(ivy.id);
  const ap = await approve('secretary', ivyEnrollment.id);
  check('approval places Ivy in DIT-1 · 1st Year · Section A and says so', ap.status === 200 && ap.data?.placement?.section === `${M}-DIT-1 · 1st Year · Section A`, ap.json);
  const ivyRecord = await page('secretary', `/students/${ivy.id}/enrollment`);
  check('the student’s enrollment record shows the section', JSON.stringify(ivyRecord ?? {}).includes(`${M}-DIT-1 · 1st Year · Section A`), Object.keys(ivyRecord ?? {}));

  console.log('\nEnrollments page: program tabs, search, section');
  const hEn = await api('secretary', 'POST', `/students/${hana.id}/enrollments`, { schoolYear: year.label, semester: 1, yearLevel: 1 });
  check('Hana’s enrollment is created (pending)', [200, 201].includes(hEn.status));
  const eDit = await page('secretary', `/enrollments?program=${dit.id}&year=${year.label}&search=Reg${M}`);
  const eDht = await page('secretary', `/enrollments?program=${dht.id}&year=${year.label}&search=Reg${M}`);
  const eAll = await page('secretary', `/enrollments?year=${year.label}&search=Reg${M}`);
  check('DIT-1 tab: only Ivy’s enrollment, with its section', eDit?.data.rows.length === 1 && eDit.data.rows[0].student.name.startsWith('Ivy') && eDit.data.rows[0].section === `${M}-DIT-1 · 1st Year · Section A`, eDit?.data.rows);
  check('DHT-2 tab: only Hana’s pending enrollment, no section yet', eDht?.data.rows.length === 1 && eDht.data.rows[0].student.name.startsWith('Hana') && eDht.data.rows[0].section === null);
  const tabs = Object.fromEntries((eAll?.programTabs ?? []).map((t) => [t.label, t.count]));
  check('program tab counts for the search: All 2, DIT-1 1, DHT-2 1', tabs['All Programs'] === 2 && tabs[`${M}-DIT-1`] === 1 && tabs[`${M}-DHT-2`] === 1, eAll?.programTabs);
  const statusCounts = Object.fromEntries((eDht?.filters ?? []).map((f) => [f.value || 'all', f.count]));
  check('status counts follow the program tab (DHT-2: 1 pending, 0 enrolled)', statusCounts.pending === 1 && statusCounts.enrolled === 0, statusCounts);
  const byNumber = await page('secretary', `/enrollments?year=${year.label}&search=${encodeURIComponent(ivy.studentNumber)}`);
  check('search by student number finds the enrollment', byNumber?.data.rows.length === 1 && byNumber.data.rows[0].student.studentNumber === ivy.studentNumber);

  console.log('\n4–7. Capacity and separation');
  const secA = (await placementOf(ivy.id, year.id)).section;
  for (let i = 0; i < 24; i++) {
    const p = await pendingStudent(dit, curDit, 1, year);
    await prisma.sectionStudent.create({ data: { sectionId: secA.id, studentId: p.student.id, schoolYearId: year.id } });
  }
  const pendingOnly = await pendingStudent(dit, curDit, 1, year);
  const rejected = await pendingStudent(dit, curDit, 1, year);
  await api('secretary', 'POST', `/enrollments/${rejected.enrollment.id}/transition`, { status: 'rejected', reason: 'Incomplete' });
  check('7. pending and rejected enrollments occupy no seat (A has exactly 25)', (await seats(secA.id)) === 25 && !(await placementOf(pendingOnly.student.id, year.id)) && !(await placementOf(rejected.student.id, year.id)));
  const s26 = await pendingStudent(dit, curDit, 1, year);
  const r26 = await approve('secretary', s26.enrollment.id);
  check('4. the 26th DIT-1 1st Year student goes to Section B', r26.data?.placement?.section === `${M}-DIT-1 · 1st Year · Section B`, r26.json);
  await verifyDocs(hana.id);
  const hEnr = await prisma.enrollment.findFirst({ where: { studentId: hana.id, schoolYear: year.label } });
  const rh = await approve('secretary', hEnr.id);
  const ph = await placementOf(hana.id, year.id);
  check('5. Hana (DHT-2) opens DHT-2 Section A — DIT-1 B had 24 seats but is never shared', rh.data?.placement?.section === `${M}-DHT-2 · 1st Year · Section A` && ph.section.programId === dht.id);
  const second = await pendingStudent(dit, curDit, 2, year);
  const nextYear = await pendingStudent(dit, curDit, 1, next);
  const [r2, rn] = [await approve('secretary', second.enrollment.id), await approve('secretary', nextYear.enrollment.id)];
  check('6. a 2nd Year student and a next-school-year student each get their own Section A', r2.data?.placement?.section === `${M}-DIT-1 · 2nd Year · Section A` && rn.data?.placement?.created === true && (await placementOf(nextYear.student.id, next.id)) !== null && (await placementOf(nextYear.student.id, year.id)) === null);

  console.log('\n8. Concurrency, authorization');
  const batch = [];
  for (let i = 0; i < 8; i++) batch.push(await pendingStudent(dht, curDht, 3, year));
  const rs = await Promise.all(batch.map((b) => approve('secretary', b.enrollment.id)));
  const dht3 = await prisma.section.findMany({ where: { schoolYearId: year.id, programId: dht.id, yearLevel: 3 }, select: { _count: { select: { students: true } } } });
  check('8 simultaneous DHT-2 3rd Year approvals: all placed, one section of 8', rs.every((r) => r.status === 200) && dht3.length === 1 && dht3[0]._count.students === 8, { statuses: rs.map((r) => r.status), dht3 });
  const t1 = await api('teacher', 'POST', `/enrollments/${pendingOnly.enrollment.id}/transition`, { status: 'enrolled', reason: '' });
  const t2 = await api('teacher', 'POST', '/students', body(dit.id, curDit.id, 'Nope'));
  const t3 = await api('teacher', 'GET', `/pages/enrollments?program=${dit.id}`);
  check('an Instructor cannot approve, register students or open Enrollments (403)', t1.status === 403 && t2.status === 403 && t3.status === 403, [t1.status, t2.status, t3.status]);
  check('…and the pending enrollment is untouched', (await prisma.enrollment.findUnique({ where: { id: pendingOnly.enrollment.id } })).status === 'pending');

  console.log('\n9. Drops and transfers free the seat; the pages agree');
  const drop = await api('secretary', 'POST', `/enrollments/${s26.enrollment.id}/transition`, { status: 'dropped', reason: 'Withdrew' });
  check('dropping the enrollment frees the seat in Section B and says which', drop.status === 200 && drop.data?.released?.[0] === `${M}-DIT-1 · 1st Year · Section B` && !(await placementOf(s26.student.id, year.id)), drop.json);
  const afterDrop = await page('secretary', `/enrollments?program=${dit.id}&status=dropped&search=${encodeURIComponent(s26.student.studentNumber)}`);
  check('Enrollments shows it dropped, with no section', afterDrop?.data.rows.length === 1 && afterDrop.data.rows[0].status === 'dropped' && afterDrop.data.rows[0].section === null);
  // A student with two enrolled terms keeps the seat when only one is dropped.
  const twoTerms = await pendingStudent(dit, curDit, 2, year);
  await approve('secretary', twoTerms.enrollment.id);
  const t2nd = await prisma.enrollment.create({ data: { studentId: twoTerms.student.id, curriculumId: curDit.id, schoolYear: year.label, schoolYearId: year.id, semester: 2, yearLevel: 2, status: 'pending', createdAt: new Date() } });
  await approve('secretary', t2nd.id);
  const dropOne = await api('secretary', 'POST', `/enrollments/${t2nd.id}/transition`, { status: 'dropped', reason: 'Second semester only' });
  check('dropping one of two enrolled terms keeps the seat', dropOne.status === 200 && (dropOne.data?.released ?? []).length === 0 && (await placementOf(twoTerms.student.id, year.id)) !== null);
  // Transfer through an approved status request.
  await prisma.schoolYear.update({ where: { id: year.id }, data: { status: 'ACTIVE' } }).catch(() => null);
  const req = await prisma.studentStatusRequest.create({ data: { studentId: second.student.id, currentStatus: 'active', requestedStatus: 'transferred', reason: 'Moved to another school', requestedBy: created.users[2] } });
  const dec = await api('secretary', 'POST', `/status-requests/${req.id}/decide`, { decision: 'APPROVED', note: '' });
  check('an approved transfer frees the student’s seat in the running school year', dec.status === 200 && (await prisma.student.findUnique({ where: { id: second.student.id } })).status === 'transferred' && !(await placementOf(second.student.id, year.id)), dec.json);
  const studentsAfter = await page('secretary', `/students?status=transferred&search=${encodeURIComponent(second.student.studentNumber)}`);
  check('Students shows the student as transferred', studentsAfter?.rows.length === 1 && studentsAfter.rows[0].status === 'transferred');
  check('historical enrollment records are kept (dropped and transferred students’ enrollments still exist)', (await prisma.enrollment.count({ where: { studentId: { in: [s26.student.id, second.student.id] } } })) === 2);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    await prisma.schoolYear.updateMany({ where: { id: { in: created.years } }, data: { status: 'UPCOMING' } });
    const sectionIds = (await prisma.section.findMany({ where: { schoolYearId: { in: created.years } }, select: { id: true } })).map((s) => s.id);
    await prisma.sectionStudent.deleteMany({ where: { sectionId: { in: sectionIds } } });
    await prisma.section.deleteMany({ where: { id: { in: sectionIds } } });
    const enrollmentIds = (await prisma.enrollment.findMany({ where: { studentId: { in: created.students } }, select: { id: true } })).map((e) => e.id);
    await prisma.enrollmentStatusHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await prisma.studentStatusRequest.deleteMany({ where: { studentId: { in: created.students } } });
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
