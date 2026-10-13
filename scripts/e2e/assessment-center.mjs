// End-to-end check of the TVET Assessment Center, against a running server.
//
//   npm run build && PORT=3001 npm start
//   npm run test:assessment            (BASE=http://host:port to point elsewhere)
//
// Drives every workflow through the real API as each role, with throwaway
// accounts, a throwaway qualification and throwaway students. Everything it
// creates carries the marker ZZE2E and is removed at the end, including the
// notifications it caused; audit rows are kept, as always.
//
// Run it against a disposable database. It only removes what it created, but
// it does create rows while it runs.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Assess#Check${stamp}xY`;
const started = new Date();
const created = { users: [], students: [], programs: [], curricula: [] };
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const cookies = { anon: '' };
async function makeUser(key, role, name) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  if (!r) throw new Error(`role ${role} is missing — run the migrations`);
  const u = await prisma.user.create({
    data: {
      name, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12),
      emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date(),
    },
  });
  created.users.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: u.email, password: PASSWORD, remember: false }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('tdms_session='));
  if (!cookie) throw new Error(`login failed for ${role}: ${res.status} ${await res.text()}`);
  cookies[key] = cookie.split(';')[0];
  return u;
}

async function api(who, method, path, body) {
  const init = { method, headers: { cookie: cookies[who] } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch(`${BASE}/api/v1${path}`, init);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data, text, headers: res.headers };
}
const page = (who, path) => api(who, 'GET', `/pages${path}`);
/** Page data with tagged values ($bigint, $date) left as they are — enough for these checks. */
const pageData = async (who, path) => (await page(who, path)).data;

async function fixtures() {
  const program = await prisma.program.create({ data: { code: `${M}-CSS`, name: `${M} Computer Systems Servicing NC II`, isActive: true, createdAt: new Date() } });
  const other = await prisma.program.create({ data: { code: `${M}-BKP`, name: `${M} Bookkeeping NC III`, isActive: true, createdAt: new Date() } });
  created.programs.push(program.id, other.id);
  const cur = await prisma.curriculum.create({ data: { programId: program.id, versionLabel: 'E2E', effectiveSchoolYear: '2026-2027', isActive: true } });
  const cur2 = await prisma.curriculum.create({ data: { programId: other.id, versionLabel: 'E2E', effectiveSchoolYear: '2026-2027', isActive: true } });
  created.curricula.push(cur.id, cur2.id);
  const mk = async (n, last, prog, curriculum) => {
    const s = await prisma.student.create({ data: { studentNumber: `${M}-${n}`, firstName: `Cand${n}`, lastName: `${last}${M}`, programId: prog, curriculumId: curriculum, status: 'active' } });
    created.students.push(s.id);
    return s;
  };
  return {
    program, other,
    s1: await mk(1, 'Abad', program.id, cur.id),
    s2: await mk(2, 'Bautista', program.id, cur.id),
    s3: await mk(3, 'Cruz', program.id, cur.id),
    s4: await mk(4, 'Dizon', other.id, cur2.id),
    s5: await mk(5, 'Esteban', program.id, cur.id),
  };
}

try {
  console.log(`Assessment Center e2e against ${BASE} (marker ${M})\n`);
  const manager = await makeUser('manager', 'assessment_center_manager', `${M} Manager`);
  await makeUser('director', 'director', `${M} Director`);
  const teacher = await makeUser('teacher', 'teacher', `${M} Assessor`);
  await makeUser('student', 'student', `${M} Student`);
  const f = await fixtures();
  const id = (x) => x.id.toString();

  console.log('\nAccess');
  check('anonymous is refused', (await api('anon', 'GET', '/assessment/results')).status === 401);
  check('a student cannot see results', (await api('student', 'GET', '/assessment/results')).status === 403);
  check('a teacher cannot see results', (await api('teacher', 'GET', '/assessment/results')).status === 403);
  check('a teacher can read the training calendar', (await api('teacher', 'GET', '/assessment/activities?from=2026-10-01&to=2026-10-31')).status === 200);
  check('a director can see results', (await api('director', 'GET', '/assessment/results')).status === 200);
  check('a director cannot create a batch', (await api('director', 'POST', '/assessment/batches', { batchNumber: `${M}-X`, programId: id(f.program), assessmentDate: '2026-10-20', assessorName: 'X' })).status === 403);
  check('the manager page is refused to a teacher', (await page('teacher', '/assessment/results')).status === 403);
  check('the calendar page opens for a teacher', (await page('teacher', '/assessment/calendar')).status === 200);

  const shell = await pageData('manager', '/app-shell');
  const hrefs = shell?.items?.map((i) => i.href) ?? [];
  check('the manager sidebar lists the Assessment Center', ['/assessment/results', '/assessment/calendar', '/assessment/reports'].every((h) => hrefs.includes(h)), hrefs);
  check('the manager sidebar has no admin screens', !hrefs.includes('/staff') && !hrefs.includes('/audit-logs'), hrefs);
  const tShell = await pageData('teacher', '/app-shell');
  const tHrefs = tShell?.items?.map((i) => i.href) ?? [];
  check('the teacher sidebar shows the calendar only', tHrefs.includes('/assessment/calendar') && !tHrefs.includes('/assessment/results'), tHrefs);
  const dash = await pageData('manager', '/dashboard');
  check('the manager gets the Assessment Center dashboard', dash?.kind === 'assessment', dash?.kind);

  console.log('\nBatches and results');
  const b1r = await api('manager', 'POST', '/assessment/batches', { batchNumber: `${M}-B1`, programId: id(f.program), assessmentDate: '2026-10-20', assessorUserId: id(teacher), venue: 'Lab 1' });
  check('the manager creates a batch', b1r.status === 201 && b1r.data?.assessorName === `${M} Assessor`, b1r.json);
  const b1 = b1r.data.id;
  check('a duplicate batch number is refused on the field', (await api('manager', 'POST', '/assessment/batches', { batchNumber: `${M}-B1`, programId: id(f.program), assessmentDate: '2026-10-21', assessorName: 'Y' })).json?.errors?.batchNumber !== undefined);
  check('a batch without an assessor is refused', (await api('manager', 'POST', '/assessment/batches', { batchNumber: `${M}-BX`, programId: id(f.program), assessmentDate: '2026-10-21' })).status === 422);

  const enrol = await api('manager', 'POST', `/assessment/batches/${b1}/candidates`, { studentIds: [id(f.s1), id(f.s2), id(f.s3), id(f.s4)] });
  check('three candidates are enrolled', enrol.data?.added === 3, enrol.json);
  check('a student of another qualification is refused, with the reason', enrol.data?.refused?.length === 1 && /Not enrolled/.test(enrol.data.refused[0].reason), enrol.data?.refused);
  check('enrolling the same candidate twice is refused', (await api('manager', 'POST', `/assessment/batches/${b1}/candidates`, { studentIds: [id(f.s1)] })).data?.refused?.[0]?.reason === 'Already in this batch.');

  let batch = (await api('manager', 'GET', `/assessment/batches/${b1}`)).data;
  const rid = (s) => batch.results.find((r) => r.studentId === id(s))?.id;
  check('new candidates are pending', batch.results.every((r) => r.status === 'PENDING' && r.official === 'PENDING'));
  check('an invalid result value is refused', (await api('manager', 'PUT', `/assessment/results/${rid(f.s1)}`, { result: 'PASSED' })).status === 422);
  check('a result is recorded as a draft', (await api('manager', 'PUT', `/assessment/results/${rid(f.s1)}`, { result: 'C' })).status === 200);
  await api('manager', 'PUT', `/assessment/results/${rid(f.s2)}`, { result: 'NYC', remarks: 'Needs more practice on cabling' });
  batch = (await api('manager', 'GET', `/assessment/batches/${b1}`)).data;
  check('a draft is reported as Pending and not counted', batch.results.find((r) => r.id === rid(f.s1))?.official === 'PENDING' && batch.batch.totals.assessed === 0 && batch.batch.totals.pending === 3, batch.batch.totals);
  check('a director cannot record a result', (await api('director', 'PUT', `/assessment/results/${rid(f.s3)}`, { result: 'C' })).status === 403);

  const early = await api('manager', 'POST', `/assessment/batches/${b1}/finalize`);
  check('finalizing with a candidate still pending is refused', early.status === 422 && /no recorded result/.test(early.json?.message ?? ''), early.json);
  check('a withdrawal needs a reason', (await api('manager', 'POST', `/assessment/results/${rid(f.s3)}/cancel`, { reason: '' })).status === 422);
  check('a pending candidate is withdrawn', (await api('manager', 'POST', `/assessment/results/${rid(f.s3)}/cancel`, { reason: 'Did not arrive' })).status === 200);
  const fin = await api('manager', 'POST', `/assessment/batches/${b1}/finalize`);
  check('the batch is finalized with totals from finalized results only', fin.status === 200 && fin.data?.assessed === 2 && fin.data?.competent === 1 && fin.data?.notYetCompetent === 1 && fin.data?.competentRate === 50, fin.json);
  check('a finalized result cannot be changed', (await api('manager', 'PUT', `/assessment/results/${rid(f.s1)}`, { result: 'NYC' })).status === 409);
  check('a finalized result cannot be cancelled', (await api('manager', 'POST', `/assessment/results/${rid(f.s2)}/cancel`, { reason: 'x' })).status === 409);
  check('a finalized batch cannot be cancelled', (await api('manager', 'POST', `/assessment/batches/${b1}/cancel`, { reason: 'x' })).status === 409);
  check('a finalized batch cannot be edited', (await api('manager', 'PUT', `/assessment/batches/${b1}`, { batchNumber: `${M}-B1`, programId: id(f.program), assessmentDate: '2026-10-22', assessorName: 'Z' })).status === 409);
  const s1row = await prisma.assessmentResult.findUnique({ where: { id: BigInt(rid(f.s1)) } });
  check('the database holds the finalized value', s1row?.status === 'FINALIZED' && s1row?.result === 'C');

  console.log('\nReassessment');
  const b2 = (await api('manager', 'POST', '/assessment/batches', { batchNumber: `${M}-B2`, programId: id(f.program), assessmentDate: '2026-11-05', assessorName: 'External Assessor' })).data.id;
  const again = await api('manager', 'POST', `/assessment/batches/${b2}/candidates`, { studentIds: [id(f.s1), id(f.s2), id(f.s5)] });
  check('a Competent candidate is not enrolled again', again.data?.refused?.some((r) => /Already Competent/.test(r.reason)), again.data);
  check('a Not Yet Competent candidate is pointed to Reassess', again.data?.refused?.some((r) => /use Reassess/.test(r.reason)), again.data);
  check('a new candidate is enrolled', again.data?.added === 1);
  check('a Competent result cannot be reassessed', (await api('manager', 'POST', `/assessment/results/${rid(f.s1)}/reassess`, { targetBatchId: b2 })).status === 409);
  const re = await api('manager', 'POST', `/assessment/results/${rid(f.s2)}/reassess`, { targetBatchId: b2 });
  check('a Not Yet Competent result is reassessed in another batch', re.status === 201, re.json);
  check('only one reassessment per result', (await api('manager', 'POST', `/assessment/results/${rid(f.s2)}/reassess`, { targetBatchId: b2 })).status === 409);
  const newRow = await prisma.assessmentResult.findUnique({ where: { id: BigInt(re.data.id) } });
  check('the reassessment is attempt 2, linked to the first', newRow?.attempt === 2 && newRow?.previousResultId?.toString() === rid(f.s2));
  await api('manager', 'PUT', `/assessment/results/${re.data.id}`, { result: 'C' });
  check('a single result is finalized', (await api('manager', 'POST', `/assessment/results/${re.data.id}/finalize`)).status === 200);
  const history = (await api('director', 'GET', `/assessment/candidates/${id(f.s2)}`)).data;
  check('the history keeps both attempts, the first unchanged', history?.history?.length === 2 && history.history[0].official === 'NYC' && history.history[1].official === 'C', history?.history);

  console.log('\nMonitoring filters');
  const nyc = (await api('director', 'GET', `/assessment/results?programId=${id(f.program)}&result=NYC`)).data;
  check('filtering by NYC shows only the NYC result', nyc?.rows?.length === 1 && nyc.rows[0].candidateId === `${M}-2`, nyc?.rows);
  const pend = (await api('director', 'GET', `/assessment/results?programId=${id(f.program)}&result=PENDING`)).data;
  check('filtering by Pending shows the unrecorded candidate', pend?.rows?.length === 1 && pend.rows[0].candidateId === `${M}-5`, pend?.rows);
  const byName = (await api('director', 'GET', `/assessment/results?candidate=Bautista${M}`)).data;
  check('filtering by candidate name finds both attempts', byName?.rows?.length === 2, byName?.rows);
  const byDate = (await api('director', 'GET', `/assessment/results?programId=${id(f.program)}&date=2026-10-20`)).data;
  check('filtering by date limits the batches', byDate?.summaries?.length === 1 && byDate.summaries[0].batchNumber === `${M}-B1`);
  const byRange = (await api('director', 'GET', `/assessment/results?programId=${id(f.program)}&from=2026-10-01&to=2026-11-30`)).data;
  check('a date range takes in both batches', byRange?.summaries?.length === 2 && byRange.overall.assessed === 3 && byRange.overall.pending === 1, byRange?.overall);
  check('filtering by assessor', (await api('director', 'GET', `/assessment/results?assessor=External&programId=${id(f.program)}`)).data?.summaries?.length === 1);
  check('a malformed filter is refused', (await api('director', 'GET', '/assessment/results?date=2026-02-31')).status === 422);

  console.log('\nCancelling a batch');
  const b3 = (await api('manager', 'POST', '/assessment/batches', { batchNumber: `${M}-B3`, programId: id(f.other), assessmentDate: '2026-11-10', assessorName: 'Someone' })).data.id;
  await api('manager', 'POST', `/assessment/batches/${b3}/candidates`, { studentIds: [id(f.s4)] });
  check('an unfinished batch is cancelled', (await api('manager', 'POST', `/assessment/batches/${b3}/cancel`, { reason: 'Venue unavailable' })).status === 200);
  const b3rows = await prisma.assessmentResult.findMany({ where: { batchId: BigInt(b3) } });
  check('its results are cancelled and kept', b3rows.length === 1 && b3rows[0].status === 'CANCELLED');

  console.log('\nReports');
  const rep = await pageData('director', `/assessment/reports?programId=${id(f.program)}`);
  check('the report covers both batches', rep?.report?.batches?.length === 2, rep?.report?.batches?.map((b) => b.batchNumber));
  check('the report counts each candidate once per batch by latest attempt', rep?.report?.totals?.assessed === 3 && rep.report.totals.competent === 2, rep?.report?.totals);
  check('the report names the center', typeof rep?.report?.center?.name === 'string' && rep.report.center.name.length > 0);
  const cancelledRep = await pageData('director', `/assessment/reports?programId=${id(f.other)}`);
  check('cancelled batches are left out of reports', cancelledRep?.report?.batches?.length === 0);
  const csv = await api('director', 'GET', `/assessment/reports/export?programId=${id(f.program)}`);
  check('the CSV downloads', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type') ?? '') && /attachment/.test(csv.headers.get('content-disposition') ?? ''));
  // text() drops a leading BOM, so look at the bytes.
  const raw = new Uint8Array(await (await fetch(`${BASE}/api/v1/assessment/reports/export?programId=${id(f.program)}`, { headers: { cookie: cookies.director } })).arrayBuffer());
  check('the CSV starts with a UTF-8 BOM', raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, [...raw.slice(0, 3)]);
  check('the CSV lists the candidates and results', csv.text.includes(`${M}-1`) && csv.text.includes('Competent (C)'));
  check('a teacher cannot export reports', (await api('teacher', 'GET', '/assessment/reports/export')).status === 403);
  const print = await page('manager', `/assessment/reports/print?programId=${id(f.program)}`);
  check('the printable report opens', print.status === 200);
  const audits = await prisma.auditLog.findMany({ where: { createdAt: { gte: started }, action: { startsWith: 'ASSESSMENT_' } }, select: { action: true } });
  const actions = new Set(audits.map((a) => a.action));
  check('every step is in the audit log', ['ASSESSMENT_BATCH_CREATED', 'ASSESSMENT_CANDIDATES_ENROLLED', 'ASSESSMENT_RESULT_RECORDED', 'ASSESSMENT_RESULT_CANCELLED', 'ASSESSMENT_BATCH_FINALIZED', 'ASSESSMENT_REASSESSMENT_CREATED', 'ASSESSMENT_RESULT_FINALIZED', 'ASSESSMENT_BATCH_CANCELLED', 'ASSESSMENT_REPORT_EXPORTED', 'ASSESSMENT_REPORT_GENERATED'].every((a) => actions.has(a)), [...actions]);

  console.log('\nTraining and assessment calendar');
  const act = (over) => ({ title: `${M} CSS training`, activityType: 'TRAINING', startsAt: '2026-10-26T00:00:00Z', endsAt: '2026-10-26T04:00:00Z', venue: 'Lab 1', assignedUserId: id(teacher), programId: id(f.program), ...over });
  const a1 = await api('manager', 'POST', '/assessment/activities', act({}));
  check('the manager schedules an activity', a1.status === 201 && a1.data?.assignedName === `${M} Assessor`, a1.json);
  const clash = await api('manager', 'POST', '/assessment/activities', act({ title: `${M} CSS assessment`, activityType: 'ASSESSMENT', startsAt: '2026-10-26T02:00:00Z', endsAt: '2026-10-26T06:00:00Z', batchId: b2 }));
  check('an overlap is answered with a conflict warning', clash.status === 409 && clash.json?.code === 'SCHEDULE_CONFLICT' && clash.json?.errors?.conflicts?.[0]?.includes('same venue') && clash.json.errors.conflicts[0].includes('same assessor/instructor'), clash.json);
  check('the warning shows local times, not ISO', !/\d{4}-\d{2}-\d{2}T/.test(clash.json?.errors?.conflicts?.[0] ?? 'T'), clash.json?.errors);
  const ack = await api('manager', 'POST', '/assessment/activities', act({ title: `${M} CSS assessment`, activityType: 'ASSESSMENT', startsAt: '2026-10-26T02:00:00Z', endsAt: '2026-10-26T06:00:00Z', batchId: b2, acknowledgeConflicts: true }));
  check('saving anyway after the warning works', ack.status === 201, ack.json);
  check('touching end-to-start is not a conflict', (await api('manager', 'POST', '/assessment/activities', act({ title: `${M} later`, startsAt: '2026-10-26T06:00:00Z', endsAt: '2026-10-26T08:00:00Z' }))).status === 201);
  check('an end before the start is refused', (await api('manager', 'POST', '/assessment/activities', act({ endsAt: '2026-10-25T00:00:00Z' }))).status === 422);
  check('a teacher cannot change the calendar', (await api('teacher', 'PUT', `/assessment/activities/${a1.data.id}`, act({ title: 'x' }))).status === 403);
  const moved = await api('manager', 'PUT', `/assessment/activities/${a1.data.id}`, act({ startsAt: '2026-10-27T00:00:00Z', endsAt: '2026-10-27T04:00:00Z', status: 'IN_PROGRESS' }));
  check('an activity is rescheduled', moved.status === 200 && moved.data?.status === 'IN_PROGRESS', moved.json);
  const listed = (await api('teacher', 'GET', '/assessment/activities?from=2026-10-26&to=2026-10-27')).data;
  check('the range lists the activities', listed?.filter((a) => a.title.includes(M)).length === 3, listed?.length);
  const notes = await prisma.notification.findMany({ where: { createdAt: { gte: started }, type: 'assessment.calendar' }, select: { userId: true } });
  const told = new Set(notes.map((n) => n.userId.toString()));
  const directorId = created.users[1].toString();
  check('the TVET office is notified of calendar changes', told.has(directorId));
  check('the assigned assessor is notified', told.has(teacher.id.toString()));
  check('the person making the change is not notified', !told.has(manager.id.toString()));
  check('an activity is deleted', (await api('manager', 'DELETE', `/assessment/activities/${ack.data.id}`)).status === 200);
  const calAudits = await prisma.auditLog.count({ where: { createdAt: { gte: started }, action: { startsWith: 'TRAINING_ACTIVITY_' } } });
  check('calendar changes are audited', calAudits >= 4, calAudits);

  const cal = await pageData('teacher', '/assessment/calendar?view=week&date=2026-10-27');
  check('the week view covers Sunday to Saturday', cal?.from === '2026-10-25' && cal?.to === '2026-10-31' && cal?.canManage === false, cal && { from: cal.from, to: cal.to });
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  // --- Cleanup: everything created, in dependency order. Audit rows are kept. --------------------
  try {
    await prisma.trainingActivity.deleteMany({ where: { title: { contains: M } } });
    const batches = await prisma.assessmentBatch.findMany({ where: { batchNumber: { startsWith: M } }, select: { id: true } });
    const ids = batches.map((b) => b.id);
    // Reassessments point at earlier results: remove the later attempts first.
    await prisma.assessmentResult.deleteMany({ where: { batchId: { in: ids }, previousResultId: { not: null } } });
    await prisma.assessmentResult.deleteMany({ where: { batchId: { in: ids } } });
    await prisma.assessmentBatch.deleteMany({ where: { id: { in: ids } } });
    const n = await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: created.users } }, { createdAt: { gte: started }, title: { contains: M } }] } });
    console.log(`\nremoved ${n.count} notification(s)`);
    await prisma.student.deleteMany({ where: { id: { in: created.students } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.modelHasRole.deleteMany({ where: { modelId: { in: created.users }, modelType: 'App\\Models\\User' } });
    const u = await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    console.log(`removed ${u.count} throwaway account(s) and all fixtures`);
  } catch (e) {
    console.log('CLEANUP ERROR', e.message);
  }
  await prisma.$disconnect();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.map((f) => ` - ${f}`).join('\n'));
process.exit(failures.length ? 1 : 0);
