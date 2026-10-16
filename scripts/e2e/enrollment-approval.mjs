// End-to-end check of enrollment approval from the Enrollments page: the
// Secretary reviews, approves and rejects pending enrollments; repeated,
// conflicting and unauthorized decisions are refused by the server.
//
//   npm run build && PORT=3001 npm start
//   npm run test:enrollment            (BASE=http://host:port to point elsewhere)
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
const PASSWORD = `Enrol#Check${stamp}xY`;
const started = new Date();
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
  const u = await prisma.user.create({ data: {
    name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12),
    emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.users.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: u.email, password: PASSWORD, remember: false }) });
  const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('tdms_session='));
  if (!c) throw new Error(`login failed for ${key}`);
  cookies[key] = c.split(';')[0];
  return u;
}
async function api(who, method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers: { cookie: cookies[who], ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data };
}
const decide = (who, id, status, reason = '') => api(who, 'POST', `/enrollments/${id}/transition`, { status, reason });
const statusOf = async (id) => (await prisma.enrollment.findUnique({ where: { id: BigInt(id) } }))?.status;

try {
  console.log(`Enrollment approval e2e against ${BASE} (marker ${M})\n`);
  const secretary = await makeUser('secretary', 'secretary');
  for (const [k, r] of [['director', 'director'], ['coordinator', 'coordinator'], ['teacher', 'teacher'], ['student', 'student'], ['manager', 'assessment_center_manager']]) await makeUser(k, r);

  const program = await prisma.program.create({ data: { code: `${M}-DIT`, name: `${M} Diploma in IT`, isActive: true, createdAt: new Date() } });
  created.programs.push(program.id);
  const cur = await prisma.curriculum.create({ data: { programId: program.id, versionLabel: 'v2026', effectiveSchoolYear: '2026-2027', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);
  // A term is only opened in a school year that is set up (createEnrollment); make sure 2026-2027 is.
  if (!(await prisma.schoolYear.findUnique({ where: { label: '2026-2027' } }))) {
    created.years.push((await prisma.schoolYear.create({ data: { label: '2026-2027', startsOn: new Date('2026-06-01'), endsOn: new Date('2027-03-31'), status: 'UPCOMING', currentSemester: 1 } })).id);
  }
  const required = await prisma.credentialRequirement.findMany({ where: { isActive: true, isRequired: true, OR: [{ programId: null }, { programId: program.id }] }, select: { id: true } });

  const mkStudent = async (n, docs) => {
    const s = await prisma.student.create({ data: { studentNumber: `${M}-${n}`, firstName: `Cand${n}`, lastName: `Last${M}`, programId: program.id, curriculumId: cur.id, yearLevel: 1, status: 'applicant', createdAt: new Date() } });
    created.students.push(s.id);
    if (required.length) {
      await prisma.studentCredential.createMany({ data: required.map((r) => ({ studentId: s.id, credentialRequirementId: r.id, status: docs ? 'verified' : 'missing', createdAt: new Date(), updatedAt: new Date() })) });
    }
    return s;
  };
  const ready = await mkStudent(1, true);
  const notReady = await mkStudent(2, false);
  const toReject = await mkStudent(3, true);
  const race = await mkStudent(4, true);
  const guarded = await mkStudent(5, true);

  console.log('Creating pending enrollments');
  const enrol = async (s) => {
    const r = await api('secretary', 'POST', `/students/${s.id}/enrollments`, { schoolYear: '2026-2027', semester: 1, yearLevel: 1 });
    return r.data?.id ?? (await prisma.enrollment.findFirst({ where: { studentId: s.id }, select: { id: true } }))?.id?.toString();
  };
  const eReady = await enrol(ready);
  const eNotReady = await enrol(notReady);
  const eReject = await enrol(toReject);
  const eRace = await enrol(race);
  const eGuard = await enrol(guarded);
  check('the Secretary creates pending enrollments', [eReady, eNotReady, eReject, eRace, eGuard].every(Boolean) && (await statusOf(eReady)) === 'pending');

  console.log('\nThe Enrollments page');
  const pageData = (await api('secretary', 'GET', '/pages/enrollments?status=pending')).data;
  const mine = pageData?.data?.rows?.filter((r) => r.student.studentNumber.startsWith(M)) ?? [];
  check('the Secretary can decide on the page', pageData?.canDecide === true);
  check('pending enrollments are listed with their review details', mine.length === 5 && mine.every((r) => r.curriculum === 'v2026' && r.student.programName.includes(M)), mine.length);
  const nr = mine.find((r) => r.id === eNotReady);
  check('missing documents are shown for review', required.length === 0 || nr?.documents?.missing?.length === required.length, nr?.documents);
  const counts = Object.fromEntries((await prisma.enrollment.groupBy({ by: ['status'], _count: { _all: true } })).map((g) => [g.status, g._count._all]));
  const tabs = Object.fromEntries((pageData?.filters ?? []).map((f) => [f.value || 'all', f.count]));
  check('the filter counts match the database', tabs.pending === (counts.pending ?? 0) && tabs.all === Object.values(counts).reduce((a, b) => a + b, 0), { tabs, counts });
  check('the Director sees the page but cannot decide', (await api('director', 'GET', '/pages/enrollments')).data?.canDecide === false);

  console.log('\nApproving');
  if (required.length) {
    const blocked = await decide('secretary', eNotReady, 'enrolled');
    check('approval is refused while documents are unverified', blocked.status === 422 && (await statusOf(eNotReady)) === 'pending', blocked.json);
  }
  const ok = await decide('secretary', eReady, 'enrolled');
  check('the Secretary approves a ready enrollment', ok.status === 200, ok.json);
  const row = await prisma.enrollment.findUnique({ where: { id: BigInt(eReady) } });
  check('it is Enrolled, stamped with the approver and time', row?.status === 'enrolled' && row?.approvedBy === secretary.id && row?.approvedAt instanceof Date);
  check('the student becomes active, the record otherwise unchanged', (await prisma.student.findUnique({ where: { id: ready.id } }))?.status === 'active' && (await prisma.student.findUnique({ where: { id: ready.id } }))?.studentNumber === `${M}-1`);
  const again = await decide('secretary', eReady, 'enrolled');
  check('approving it again is refused', again.status === 409 && again.json?.code === 'ENROLLMENT_ALREADY_DECIDED', again.json);
  check('an enrolled enrollment cannot be rejected', (await decide('secretary', eReady, 'rejected', 'late')).status === 409);
  check('nothing goes back to pending', (await decide('secretary', eReady, 'pending')).status === 409 && (await statusOf(eReady)) === 'enrolled');
  const history = await prisma.enrollmentStatusHistory.count({ where: { enrollmentId: BigInt(eReady) } });
  check('one history row for one decision', history === 1, history);

  console.log('\nRejecting');
  const noReason = await decide('secretary', eReject, 'rejected', '  ');
  check('a rejection needs a reason', noReason.status === 422 && !!noReason.json?.errors?.reason, noReason.json);
  const rej = await decide('secretary', eReject, 'rejected', 'Incomplete TOR copy');
  check('the Secretary rejects with a reason', rej.status === 200 && (await statusOf(eReject)) === 'rejected', rej.json);
  check('a rejected enrollment cannot be approved', (await decide('secretary', eReject, 'enrolled')).status === 409 && (await statusOf(eReject)) === 'rejected');
  check('the student is not made active by a rejection', (await prisma.student.findUnique({ where: { id: toReject.id } }))?.status === 'applicant');
  const rejected = (await api('secretary', 'GET', '/pages/enrollments?status=rejected')).data?.data?.rows?.find((r) => r.id === eReject);
  check('the page shows who rejected it and why', rejected?.decision?.by === `${M} secretary` && rejected?.decision?.reason === 'Incomplete TOR copy', rejected?.decision);

  console.log('\nDropping');
  check('dropping needs a reason', (await decide('secretary', eReady, 'dropped')).status === 422);
  check('an enrolled enrollment can be dropped', (await decide('secretary', eReady, 'dropped', 'Transferred school')).status === 200 && (await statusOf(eReady)) === 'dropped');
  check('a dropped enrollment is final', (await decide('secretary', eReady, 'enrolled')).status === 409);

  console.log('\nTwo decisions at once');
  const [a, b] = await Promise.all([decide('secretary', eRace, 'enrolled'), decide('secretary', eRace, 'rejected', 'conflicting')]);
  const codes = [a.status, b.status].sort();
  check('exactly one of two simultaneous decisions wins', codes[0] === 200 && codes[1] === 409, [a.status, b.status]);
  check('and only one history row is written', (await prisma.enrollmentStatusHistory.count({ where: { enrollmentId: BigInt(eRace) } })) === 1);

  console.log('\nOther roles, calling the API directly');
  for (const who of ['director', 'coordinator', 'teacher', 'student', 'manager']) {
    const r = await decide(who, eGuard, 'enrolled');
    check(`the ${who} cannot approve`, r.status === 403, r.status);
    const x = await decide(who, eGuard, 'rejected', 'x');
    check(`the ${who} cannot reject`, x.status === 403, x.status);
  }
  check('the guarded enrollment is still pending', (await statusOf(eGuard)) === 'pending');

  console.log('\nA student added directly, with no document checklist (the Andy case)');
  const direct = await prisma.student.create({ data: { studentNumber: `${M}-6`, firstName: 'Andy', lastName: `Direct${M}`, programId: program.id, curriculumId: cur.id, yearLevel: 1, status: 'active', createdAt: new Date() } });
  created.students.push(direct.id);
  const eDirect = await enrol(direct);
  check('starts with no checklist rows', (await prisma.studentCredential.count({ where: { studentId: direct.id } })) === 0);
  if (required.length) check('approval is refused while nothing is verified', (await decide('secretary', eDirect, 'enrolled')).status === 422);
  const list = await api('secretary', 'GET', `/students/${direct.id}/credentials`);
  check('opening the documents creates the checklist', list.status === 200 && list.data?.length >= required.length, list.data?.length);
  check('opening it again adds nothing more', (await api('secretary', 'GET', `/students/${direct.id}/credentials`)).data?.length === list.data?.length);
  // A credential is verified from its uploaded soft copy: upload a scan, then verify it.
  const scan = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
  for (const c of list.data ?? []) {
    const form = new FormData();
    form.append('file', new Blob([scan], { type: 'application/pdf' }), `${c.requirement.name}.pdf`);
    const up = await fetch(`${BASE}/api/v1/credentials/${c.id}/file`, { method: 'POST', headers: { cookie: cookies.secretary }, body: form });
    if (up.status !== 201) check(`uploading ${c.requirement.name}`, false, await up.text());
    const v = await api('secretary', 'POST', `/credentials/${c.id}/verify`, { remarks: null });
    if (v.status !== 200) check(`verifying ${c.requirement.name}`, false, v.json);
  }
  const approveDirect = await decide('secretary', eDirect, 'enrolled');
  check('once verified, the Secretary approves it', approveDirect.status === 200 && (await statusOf(eDirect)) === 'enrolled', approveDirect.json);
  const enrolledTab = (await api('secretary', 'GET', '/pages/enrollments?status=enrolled')).data?.data?.rows ?? [];
  const pendingTab = (await api('secretary', 'GET', '/pages/enrollments?status=pending')).data?.data?.rows ?? [];
  check('it moves from Pending to Enrolled', enrolledTab.some((r) => r.id === eDirect) && !pendingTab.some((r) => r.id === eDirect));
  const viaForm = await api('secretary', 'POST', '/students', { firstName: 'Form', middleName: '', lastName: `Made${M}`, email: '', phone: '', dateOfBirth: '', programId: program.id.toString(), curriculumId: cur.id.toString(), yearLevel: 1, status: 'active', enrollmentDate: '' });
  const formId = viaForm.data?.id ?? (await prisma.student.findFirst({ where: { lastName: `Made${M}` } }))?.id?.toString();
  if (formId) created.students.push(BigInt(formId));
  check('a student created through Add Student gets the checklist at once', (await prisma.studentCredential.count({ where: { studentId: BigInt(formId) } })) >= required.length, viaForm.json?.message);

  console.log('\nAudit');
  const actions = (await prisma.auditLog.findMany({ where: { createdAt: { gte: started }, target: { contains: M } }, select: { action: true } })).map((x) => x.action);
  check('approvals, rejections and drops are in the audit log', ['ENROLLMENT_APPROVED', 'ENROLLMENT_REJECTED', 'ENROLLMENT_DROPPED'].every((x) => actions.includes(x)), [...new Set(actions)]);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const ids = created.students;
    const enrolls = (await prisma.enrollment.findMany({ where: { studentId: { in: ids } }, select: { id: true } })).map((e) => e.id);
    await prisma.enrollmentStatusHistory.deleteMany({ where: { enrollmentId: { in: enrolls } } });
    await prisma.enrollment.deleteMany({ where: { id: { in: enrolls } } });
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: ids } } });
    // Approval placed students in this program's sections; those go with it.
    await prisma.sectionStudent.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.section.deleteMany({ where: { programId: { in: created.programs } } });
    await prisma.student.deleteMany({ where: { id: { in: ids } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
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
