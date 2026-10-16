// End-to-end check of the Secretary dashboard's data, through the real page loader.
//
//   npm run build && PORT=3001 npm start
//   node scripts/e2e/secretary-dashboard.mjs     (BASE=http://host:port to point elsewhere)
//
// What it guards: every figure is a real count and the link on it opens a list
// showing the same records; drafts are not "received"; every application
// status (rejected included) is in the status breakdown; the work queue gives
// each stream's oldest waiting item; the calendar lists only what is still to
// come; students are counted per program; and a role sees only the panels its
// permissions allow — the same workspace, served to a Processing Officer,
// leaves applications out.
//
// Throwaway records only (marker ZZE2E…), removed at the end unless KEEP=1
// (to look at the page with data in it). Run it against a disposable
// database — never production.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Sd#Check${stamp}xY`;
const DAY = 86_400_000;
const created = { users: [], programs: [], curricula: [], events: [] };
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
async function page(who, p) {
  const res = await fetch(`${BASE}/api/v1/pages${p}`, { headers: { cookie: cookies[who] } });
  return { status: res.status, data: (await res.json().catch(() => null))?.data };
}
const ago = (days) => new Date(Date.now() - days * DAY);
const dayKey = (d) => d.toISOString().slice(0, 10);

try {
  console.log(`Secretary dashboard e2e against ${BASE} (marker ${M})\n`);
  await makeUser('secretary', 'secretary');
  await makeUser('po', 'processing_officer');
  await makeUser('coordinator', 'coordinator');

  const dit = await prisma.program.create({ data: { code: `${M}-DIT`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  const dht = await prisma.program.create({ data: { code: `${M}-DHT`, name: 'Diploma in Hospitality Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(dit.id, dht.id);
  const cur = await prisma.curriculum.create({ data: { programId: dit.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);

  // Applications in every state. One submitted ten days ago is the oldest waiting.
  const app = (status, submittedDaysAgo, n) => prisma.application.create({ data: {
    firstName: `Ana${n}`, lastName: `L${M}${n}`, programId: dit.id, status,
    submittedAt: submittedDaysAgo === null ? null : ago(submittedDaysAgo), createdAt: ago(submittedDaysAgo ?? 0),
  } });
  await app('draft', null, 1);
  await app('submitted', 10, 2);
  await app('submitted', 1, 3);
  await app('under_review', 2, 4);
  await app('rejected', 3, 5);
  await app('returned', 4, 6);

  // Students: one complete, one missing contact details; a pending enrollment and a document to verify.
  const s1 = await prisma.student.create({ data: { studentNumber: `${M}-1`, firstName: 'Ben', lastName: `S${M}`, programId: dit.id, curriculumId: cur.id, email: `${M.toLowerCase()}-s1@example.test`, phone: '0917 000 0000', dateOfBirth: new Date('2005-01-01'), createdAt: new Date() } });
  await prisma.student.create({ data: { studentNumber: `${M}-2`, firstName: 'Cara', lastName: `S${M}`, programId: dit.id, curriculumId: cur.id, createdAt: ago(20) } });
  await prisma.enrollment.create({ data: { studentId: s1.id, curriculumId: cur.id, schoolYear: '2097-2098', semester: 1, yearLevel: 1, status: 'pending', createdAt: ago(8) } });
  const req = await prisma.credentialRequirement.findFirst({ where: { isActive: true } });
  if (req) await prisma.studentCredential.create({ data: { studentId: s1.id, credentialRequirementId: req.id, status: 'submitted', submittedAt: ago(2), createdAt: ago(2) } });

  // The calendar: one entry to come, one already over.
  const soon = await prisma.calendarEvent.create({ data: { title: `${M} Enrollment period`, type: 'ENROLLMENT', startsOn: new Date(`${dayKey(new Date(Date.now() + 5 * DAY))}T00:00:00Z`), endsOn: new Date(`${dayKey(new Date(Date.now() + 9 * DAY))}T00:00:00Z`) } });
  const past = await prisma.calendarEvent.create({ data: { title: `${M} Orientation`, type: 'EVENT', startsOn: new Date(`${dayKey(ago(12))}T00:00:00Z`), endsOn: new Date(`${dayKey(ago(10))}T00:00:00Z`) } });
  created.events.push(soon.id, past.id);

  console.log('Secretary');
  const res = await page('secretary', '/dashboard');
  check('the dashboard loads (200)', res.status === 200, res.status);
  const w = res.data?.workspace;
  check('it is the Secretary workspace', w?.kind === 'secretary', res.data?.kind);
  const metric = (key) => w?.metrics.find((m) => m.key === key);

  const fresh = metric('new-applications');
  check('New Applications links to the list from 7 days ago', /^\/applications\?from=\d{4}-\d{2}-\d{2}$/.test(fresh?.href ?? ''), fresh?.href);
  const freshList = await page('secretary', fresh.href);
  check('…which holds exactly as many applications as the figure says', freshList.data?.total === fresh.value, { figure: fresh.value, list: freshList.data?.total });
  const ours = await page('secretary', `${fresh.href}&search=${M}`);
  // Submitted 1–4 days ago, whatever has happened to them since; not the draft, not the one from 10 days ago.
  check('…four of ours: not the draft, not the one from 10 days ago', ours.data?.total === 4, ours.data?.total);

  const pendingApps = metric('pending-applications');
  check('with both submitted and under-review waiting, Pending Applications opens the whole list', pendingApps?.href === '/applications', pendingApps?.href);

  const statuses = Object.fromEntries((w?.pipeline ?? []).map((s) => [s.key, s.value]));
  check('the status breakdown has every application status', ['draft', 'submitted', 'under_review', 'approved', 'returned', 'rejected'].every((k) => k in statuses), Object.keys(statuses));
  check('…rejected and drafts are counted', statuses.rejected >= 1 && statuses.draft >= 1, statuses);
  for (const s of w?.pipeline ?? []) {
    const list = await page('secretary', s.href);
    if (list.data?.total !== s.value) { check(`the ${s.label} link lists ${s.value}`, false, list.data?.total); break; }
  }
  check('every status link opens a list of exactly that many', !failures.some((f) => f.includes('link lists')));

  const queue = Object.fromEntries((w?.queue ?? []).map((q) => [q.key, q]));
  check('the work queue has applications, enrollment, documents and records, in tabs', ['applications', 'enrollments', 'documents', 'incomplete'].every((k) => queue[k]?.group), Object.keys(queue));
  check('new registrations are a figure, not queue work', !queue.registrations && !!metric('registrations'));
  const oldestApp = queue.applications?.oldestAt ? (Date.now() - new Date(queue.applications.oldestAt).getTime()) / DAY : null;
  check('the applications row knows its oldest waiting item (10 days or older)', oldestApp !== null && oldestApp >= 9.9, queue.applications?.oldestAt);
  check('…as does pending enrollment (8 days or older)', queue.enrollments?.oldestAt && (Date.now() - new Date(queue.enrollments.oldestAt).getTime()) / DAY >= 7.9, queue.enrollments?.oldestAt);
  check('incomplete records are counted', queue.incomplete?.count >= 1, queue.incomplete);

  const titles = (w?.events ?? []).map((e) => e.title);
  check('the upcoming calendar entry is listed', titles.includes(soon.title), titles);
  check('…and the one already over is not', !titles.includes(past.title), titles);
  check('…soonest first', (w?.events ?? []).every((e, i, a) => i === 0 || a[i - 1].startsOn <= e.startsOn));

  const row = (w?.enrollmentByProgram ?? []).find((r) => r.code === dit.code);
  check('students are counted per program', row?.students === 2, row);
  check('…and a program with none shows zero, not nothing', (w?.enrollmentByProgram ?? []).find((r) => r.code === dht.code)?.students === 0);
  check('the Secretary may add a student', w?.canAddStudent === true);
  check('recent activity is drawn from the records', Array.isArray(w?.activity) && w.activity.length > 0, w?.activity?.length);

  console.log('\nProcessing Officer');
  const po = await page('po', '/dashboard');
  const pw = po.data?.workspace;
  check('the same workspace, under their own title', pw?.kind === 'secretary' && po.data?.common?.roleLabel !== 'TVET Secretary', po.data?.common?.roleLabel);
  check('no application figures, breakdown or queue row (they may not view applications)', pw?.pipeline === null && !pw?.metrics.some((m) => m.key.includes('applications')) && !pw?.queue.some((q) => q.key === 'applications'), { pipeline: pw?.pipeline, metrics: pw?.metrics.map((m) => m.key) });
  check('the calendar is still listed', Array.isArray(pw?.events));

  console.log('\nCoordinator');
  const co = await page('coordinator', '/dashboard');
  check('a Coordinator keeps their own workspace', co.data?.workspace?.kind === 'coordinator', co.data?.workspace?.kind);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  if (process.env.KEEP === '1') {
    console.log(`\nKEEP=1: records left in place. Sign in as ${M.toLowerCase()}-secretary@example.test / ${PASSWORD}`);
  } else {
    try {
      const students = (await prisma.student.findMany({ where: { programId: { in: created.programs } }, select: { id: true } })).map((s) => s.id);
      const enrollmentIds = (await prisma.enrollment.findMany({ where: { studentId: { in: students } }, select: { id: true } })).map((e) => e.id);
      await prisma.enrollmentStatusHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
      await prisma.studentCredential.deleteMany({ where: { studentId: { in: students } } });
      await prisma.student.deleteMany({ where: { id: { in: students } } });
      await prisma.application.deleteMany({ where: { programId: { in: created.programs } } });
      await prisma.calendarEvent.deleteMany({ where: { id: { in: created.events } } });
      await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
      await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
      await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
      await prisma.modelHasRole.deleteMany({ where: { modelId: { in: created.users } } });
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    } catch (e) {
      console.log('cleanup failed:', e.message);
    }
  }
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
}
