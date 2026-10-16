// End-to-end check of students without an enrollment, and of the reconciliation
// that places enrolled students who have no section.
//
//   npm run build && PORT=3001 npm start
//   node scripts/e2e/enrollment-gaps.mjs     (BASE=http://host:port to point elsewhere)
//
// What it guards:
//   * a student record with no enrollment is real data, not a hidden row: it is
//     absent from Enrollments, and the Students filter, the Enrollments notice
//     and the Secretary's work queue all say how many, matching the database;
//   * every Enrollments status count equals the rows that status lists;
//   * opening an enrollment through the existing per-student action is the fix;
//   * scripts/reconcile-enrollments.ts previews without writing, then with --apply
//     places enrolled-but-unplaced students in approval order, Section A until it
//     holds 25, then B; leaves existing placements alone; skips a student who is
//     no longer active; gives one seat for two semesters; ignores archived years;
//     and a second run finds nothing to do.
//
// Throwaway records only (marker ZZE2E…), removed at the end. A disposable database only.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Gp#Check${stamp}xY`;
const created = { users: [], programs: [], curricula: [], years: [] };
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

let n = 0;
async function student(program, curriculum, { status = 'active', yearLevel = 1 } = {}) {
  n += 1;
  return prisma.student.create({ data: { studentNumber: `${M}-${n}`, firstName: `S${n}`, lastName: `L${M}`, programId: program.id, curriculumId: curriculum.id, yearLevel, status, createdAt: new Date(), updatedAt: new Date() } });
}
const enrolled = (s, curriculum, year, { semester = 1, approvedAt }) => prisma.enrollment.create({
  data: { studentId: s.id, curriculumId: curriculum.id, schoolYear: year.label, schoolYearId: year.id, semester, yearLevel: s.yearLevel, status: 'enrolled', approvedAt, createdAt: approvedAt, updatedAt: approvedAt },
});
function reconcile(...args) {
  // tsx's own CLI under this Node: no shell, so nothing is concatenated into a command line.
  return execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'server/tsconfig.json', 'scripts/reconcile-enrollments.ts', ...args], { env: process.env, encoding: 'utf8' });
}
const placementOf = async (s, year) => (await prisma.sectionStudent.findUnique({ where: { schoolYearId_studentId: { schoolYearId: year.id, studentId: s.id } }, select: { section: { select: { name: true } } } }))?.section.name ?? null;

try {
  console.log(`Enrollment gaps e2e against ${BASE} (marker ${M})\n`);
  await makeUser('secretary', 'secretary');

  const b = 2100 + (stamp % 800);
  const year = await prisma.schoolYear.create({ data: { label: `${b}-${b + 1}`, startsOn: new Date(`${b}-06-01`), endsOn: new Date(`${b + 1}-03-31`), status: 'UPCOMING', currentSemester: 1 } });
  const archived = await prisma.schoolYear.create({ data: { label: `${b - 1}-${b}`, startsOn: new Date(`${b - 1}-06-01`), endsOn: new Date(`${b}-03-31`), status: 'ARCHIVED', currentSemester: 2 } });
  created.years.push(year.id, archived.id);
  const prog = await prisma.program.create({ data: { code: `${M}-DIT`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(prog.id);
  const cur = await prisma.curriculum.create({ data: { programId: prog.id, versionLabel: 'v1', effectiveSchoolYear: year.label, isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);

  console.log('Students without an enrollment');
  const withOne = await student(prog, cur);
  await prisma.enrollment.create({ data: { studentId: withOne.id, curriculumId: cur.id, schoolYear: year.label, schoolYearId: year.id, semester: 1, yearLevel: 1, status: 'pending', createdAt: new Date(), updatedAt: new Date() } });
  const without = await student(prog, cur, { status: 'applicant' });
  const dbCount = () => prisma.student.count({ where: { enrollments: { none: {} } } });

  const list = await page('secretary', `/students?enrollment=none&search=${M}`);
  check('the Not enrolled filter lists the student with no enrollment', list?.rows.some((r) => r.id === String(without.id)));
  check('…and not the one with an enrollment', !list?.rows.some((r) => r.id === String(withOne.id)));
  check('the page count matches the database', list?.withoutEnrollment === (await dbCount()), { page: list?.withoutEnrollment, db: await dbCount() });
  const all = await page('secretary', `/students?search=${M}`);
  check('every row says whether it has an enrollment', all?.rows.find((r) => r.id === String(without.id))?.hasEnrollment === false && all?.rows.find((r) => r.id === String(withOne.id))?.hasEnrollment === true);
  check('an unknown enrollment filter value is ignored', (await page('secretary', `/students?enrollment=bogus&search=${M}`))?.filters.enrollment === '');

  const enr = await page('secretary', `/enrollments?search=${M}`);
  check('Enrollments lists only real enrollment records', enr?.data.rows.length === 1 && enr.data.rows[0].student.id === String(withOne.id), enr?.data.rows.map((r) => r.student.id));
  check('…and says how many student records have none', enr?.withoutEnrollment === (await dbCount()));
  const full = await page('secretary', '/enrollments');
  for (const f of full?.filters ?? []) {
    const tab = await page('secretary', `/enrollments${f.value ? `?status=${f.value}` : ''}`);
    check(`the ${f.label} count (${f.count}) equals the records it lists`, tab?.data.total === f.count, { count: f.count, rows: tab?.data.total });
  }
  const dash = await page('secretary', '/dashboard');
  const row = dash?.workspace?.queue.find((q) => q.key === 'not-enrolled');
  check('the Secretary’s work queue counts them and links to the filter', row?.count === (await dbCount()) && row?.href === '/students?enrollment=none', row);

  const opened = await api('secretary', 'POST', `/students/${without.id}/enrollments`, { schoolYear: year.label, semester: 1, yearLevel: 1 });
  check('opening an enrollment through the existing action fixes it', opened.status === 201, opened.json);
  check('…the student leaves the Not enrolled list', !(await page('secretary', `/students?enrollment=none&search=${M}`))?.rows.some((r) => r.id === String(without.id)));
  check('…and appears in Enrollments as pending', (await page('secretary', `/enrollments?search=${M}&status=pending`))?.data.rows.some((r) => r.student.id === String(without.id)));

  console.log('\nReconciliation of enrolled students without a section');
  // Section A already holds 24 (one of them enrolled, placed before this run).
  const sectionA = await prisma.section.create({ data: { schoolYearId: year.id, programId: prog.id, yearLevel: 1, name: 'A' } });
  const seated = [];
  for (let i = 0; i < 24; i += 1) {
    const s = await student(prog, cur);
    await prisma.sectionStudent.create({ data: { sectionId: sectionA.id, studentId: s.id, schoolYearId: year.id } });
    seated.push(s);
  }
  await enrolled(seated[0], cur, year, { approvedAt: new Date('2026-01-01T00:00:00Z') });
  // Three enrolled, unplaced — approved in this order.
  const first = await student(prog, cur); await enrolled(first, cur, year, { approvedAt: new Date('2026-02-01T00:00:00Z') });
  const second = await student(prog, cur); await enrolled(second, cur, year, { approvedAt: new Date('2026-02-02T00:00:00Z') });
  const third = await student(prog, cur); await enrolled(third, cur, year, { approvedAt: new Date('2026-02-03T00:00:00Z'), semester: 1 });
  await enrolled(third, cur, year, { approvedAt: new Date('2026-02-10T00:00:00Z'), semester: 2 }); // both semesters: one seat
  const droppedOut = await student(prog, cur, { status: 'dropped' }); await enrolled(droppedOut, cur, year, { approvedAt: new Date('2026-02-04T00:00:00Z') });
  const oldYear = await student(prog, cur); await enrolled(oldYear, cur, archived, { approvedAt: new Date('2025-02-01T00:00:00Z') });

  const placementsBefore = await prisma.sectionStudent.count();
  const preview = reconcile();
  check('the preview names the database it reads', /^Database: /m.test(preview));
  check('the preview changes nothing', (await prisma.sectionStudent.count()) === placementsBefore);
  const ours = (out) => out.split('\n').filter((l) => / student #(\d+)/.test(l) && [first, second, third, droppedOut, oldYear, seated[0]].some((s) => l.includes(`student #${s.id} `)));
  const lines = ours(preview);
  const order = lines.map((l) => [first, second, third, droppedOut].findIndex((s) => l.includes(`student #${s.id} `)));
  check('it lists the unplaced enrolled students in approval order', JSON.stringify(order) === '[0,1,2,3]', lines);
  check('…one line for a student enrolled in both semesters', lines.filter((l) => l.includes(`student #${third.id} `)).length === 1);
  check('…not a student already in a section', !lines.some((l) => l.includes(`student #${seated[0].id} `)));
  check('…not an archived school year', !lines.some((l) => l.includes(`student #${oldYear.id} `)));
  check('…and marks the inactive student as to be skipped', lines.some((l) => l.includes(`student #${droppedOut.id} `) && l.includes('will be skipped')));
  check('…and never prints names', !preview.includes(`L${M}`));

  const applied = reconcile('--apply');
  check('the first goes to Section A (its 25th seat)', (await placementOf(first, year)) === 'A', applied);
  check('the second opens Section B (A is full)', (await placementOf(second, year)) === 'B');
  check('the third joins Section B', (await placementOf(third, year)) === 'B');
  check('Section A holds exactly 25', (await prisma.sectionStudent.count({ where: { sectionId: sectionA.id } })) === 25);
  check('the student who is no longer active is skipped, not placed', (await placementOf(droppedOut, year)) === null && /skipped: student record is dropped/.test(applied));
  check('the existing placement is untouched', (await placementOf(seated[0], year)) === 'A');
  check('the archived year is untouched', (await prisma.sectionStudent.count({ where: { schoolYearId: archived.id } })) === 0);
  check('each placement is in the audit log', (await prisma.auditLog.count({ where: { actor: 'System (enrollment reconciliation)', target: { contains: M } } })) === 3);

  const placementsAfter = await prisma.sectionStudent.count();
  const again = reconcile('--apply');
  check('a second run places nobody', (await prisma.sectionStudent.count()) === placementsAfter && !ours(again).some((l) => /placed in/.test(l)), ours(again));
  check('…and creates no extra section', (await prisma.section.count({ where: { schoolYearId: year.id, programId: prog.id } })) === 2);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const students = (await prisma.student.findMany({ where: { programId: { in: created.programs } }, select: { id: true } })).map((s) => s.id);
    const enrollmentIds = (await prisma.enrollment.findMany({ where: { studentId: { in: students } }, select: { id: true } })).map((e) => e.id);
    await prisma.enrollmentStatusHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await prisma.sectionStudent.deleteMany({ where: { studentId: { in: students } } });
    await prisma.section.deleteMany({ where: { programId: { in: created.programs } } });
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: students } } });
    await prisma.notification.deleteMany({ where: { href: '/dashboard', title: { contains: M } } }).catch(() => {});
    await prisma.student.deleteMany({ where: { id: { in: students } } });
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
