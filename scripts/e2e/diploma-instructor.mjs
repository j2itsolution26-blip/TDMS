// End-to-end check of the Diploma Instructor module, against a running server.
//
//   npm run build && FILE_STORAGE=local PORT=3001 npm start
//   npm run test:instructor            (BASE=http://host:port to point elsewhere)
//   SHOTS=<folder> npm run test:instructor   also saves screenshots (needs Chrome)
//
// It drives every workflow through the real API as each role, with throwaway
// accounts and records in the ACTIVE school year. Everything it creates carries
// the marker ZZE2E and is removed at the end, including notifications it
// caused; audit rows are kept, as always. School-year archiving is exercised
// on a throwaway year (2098-2099) only — the real active year is never touched.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Instr#Check${stamp}xY`;
const started = new Date();
const created = { users: [], students: [], program: null, subject: null, curriculum: null, sections: [], years: [] };
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const cookies = {};
async function makeUser(role, name) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({
    data: {
      name, email: `${M.toLowerCase()}-${role}-${created.users.length}@example.test`, password: await bcrypt.hash(PASSWORD, 12),
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
  return { id: u.id, cookie: cookie.split(';')[0] };
}

async function api(who, method, path, body) {
  const init = { method, headers: { cookie: cookies[who] } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data, text };
}
// A screen's content now comes from its page loader (the React app renders
// it), so "what the page shows" is the loader's JSON for the same path, plus
// the app shell's (sidebar, header) — as the server-rendered HTML once
// included the layout around every page.
const page = async (who, path) => {
  const headers = { cookie: cookies[who] };
  const res = await fetch(`${BASE}/api/v1/pages${path}`, { headers });
  const shell = await fetch(`${BASE}/api/v1/pages/app-shell`, { headers });
  return { status: res.status, html: `${await res.text()}
${await shell.text()}` };
};
const TZ = 'Asia/Manila';
function localNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const tomorrow = (day) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

try {
  const year = await prisma.schoolYear.findFirst({ where: { status: 'ACTIVE' } });
  if (!year) throw new Error('no active school year');
  const now = localNow();
  // Keep the meeting inside today, whatever the hour.
  const start = Math.max(0, Math.min(now.minutes - 30, 22 * 60));
  const end = Math.min(start + 120, 23 * 60 + 59);

  // --- Fixtures -------------------------------------------------------------------------
  created.program = await prisma.program.create({ data: { code: M, name: `Diploma ${M}`, isActive: true, createdAt: new Date() } });
  created.curriculum = await prisma.curriculum.create({ data: { programId: created.program.id, versionLabel: `${M}-C`, effectiveSchoolYear: year.label, isActive: true, createdAt: new Date() } });
  created.subject = await prisma.subject.create({ data: { code: `${M}-DB`, title: `Database Management ${M}`, subjectType: 'lecture', defaultUnits: 3, isActive: true, createdAt: new Date() } });
  await prisma.curriculumSubject.create({ data: { curriculumId: created.curriculum.id, subjectId: created.subject.id, yearLevel: 1, semester: year.currentSemester, units: 3, createdAt: new Date() } });
  const mkStudent = async (i, first, last) => {
    const s = await prisma.student.create({
      data: { studentNumber: `${M}-${i}`, firstName: first, lastName: `${last} ${M}`, programId: created.program.id, curriculumId: created.curriculum.id, yearLevel: 1, status: 'active', qrToken: randomBytes(24).toString('hex'), createdAt: new Date() },
    });
    created.students.push(s.id);
    return s;
  };
  const s1 = await mkStudent(1, 'James', 'Tan');
  const s2 = await mkStudent(2, 'Maria', 'Cruz');
  const s3 = await mkStudent(3, 'Juan', 'Santos');
  const outsider = await mkStudent(4, 'Olive', 'Outside');

  const instr = await makeUser('teacher', `Ines Instructor ${M}`); cookies.instr = instr.cookie;
  const other = await makeUser('teacher', `Oscar Otherclass ${M}`); cookies.other = other.cookie;
  cookies.coord = (await makeUser('coordinator', `Cora Coordinator ${M}`)).cookie;
  cookies.dir = (await makeUser('director', `Dino Director ${M}`)).cookie;
  cookies.sec = (await makeUser('secretary', `Sara Secretary ${M}`)).cookie;
  const stu = await makeUser('student', `James Tan ${M}`); cookies.stu = stu.cookie;
  await prisma.student.update({ where: { id: s1.id }, data: { userId: stu.id } });

  // --- Role name --------------------------------------------------------------------------
  console.log('\nRole name');
  const dash = await page('instr', '/dashboard');
  check('instructor dashboard loads', dash.status === 200, dash.status);
  check('header shows "Diploma Instructor", not "Teacher"', dash.html.includes('Diploma Instructor') && !/>Teacher</.test(dash.html));

  // --- Class setup (Coordinator) -----------------------------------------------------------
  console.log('\nClass setup');
  const sec = await api('coord', 'POST', '/api/v1/sections', { schoolYearId: year.id.toString(), programId: created.program.id.toString(), yearLevel: 1, name: `A-${M}` });
  check('coordinator creates a section', sec.status === 201, sec.json);
  const sectionId = sec.data?.id;
  created.sections.push(BigInt(sectionId));
  const roster = await api('coord', 'POST', `/api/v1/sections/${sectionId}/students`, { studentIds: [s1, s2, s3].map((s) => s.id.toString()) });
  check('coordinator adds three students to the section', roster.status === 200 && roster.data?.added === 3, roster.json);
  const clsBody = { sectionId, subjectId: created.subject.id.toString(), semester: year.currentSemester, instructorId: instr.id.toString(), room: '204', schedules: [{ dayOfWeek: now.dow, startTime: hhmm(start), endTime: hhmm(end), room: '204' }] };
  check('a Director cannot create classes', (await api('dir', 'POST', '/api/v1/classes', clsBody)).status === 403);
  check('an Instructor cannot create classes', (await api('instr', 'POST', '/api/v1/classes', clsBody)).status === 403);
  const cls = await api('coord', 'POST', '/api/v1/classes', clsBody);
  check('coordinator creates the class and assigns the instructor', cls.status === 201, cls.json);
  const classId = cls.data?.id;
  const instrNotes = await prisma.notification.findMany({ where: { userId: instr.id } });
  check('the instructor is notified of the assignment', instrNotes.length > 0, instrNotes.map((n) => n.title));

  // --- Dashboard and scoping ---------------------------------------------------------------
  console.log('\nDashboard and access');
  const d2 = await page('instr', '/dashboard');
  check("today's class appears on the dashboard", d2.html.includes(`Database Management ${M}`));
  check('the class shows as LIVE now', /LIVE/.test(d2.html));
  const mine = await page('instr', `/teaching/classes/${classId}`);
  check('instructor opens own class', mine.status === 200 && mine.html.includes('James'), mine.status);
  const theirs = await page('other', `/teaching/classes/${classId}`);
  check("another instructor cannot open it", !theirs.html.includes(`Tan ${M}`), theirs.status);
  check("another instructor's API reads are refused", [403, 404].includes((await api('other', 'GET', `/api/v1/classes/${classId}/grades`)).status));
  const studentsPage = await page('instr', '/teaching/students');
  check('instructor sees assigned students only', studentsPage.html.includes(`Tan ${M}`) && !studentsPage.html.includes(`Outside ${M}`));
  check('instructor cannot read the office student list (API 403)', (await api('instr', 'GET', '/api/v1/students')).status === 403);
  check('instructor cannot export audit logs (API 403)', (await api('instr', 'GET', '/api/v1/audit-logs/export')).status === 403);
  check('instructor is not shown office student records', !(await page('instr', '/students')).html.includes(`Outside ${M}`));

  // --- QR attendance ------------------------------------------------------------------------
  console.log('\nQR attendance');
  const ses = await api('instr', 'POST', '/api/v1/attendance/sessions', { classId, meetingDate: now.day, startTime: hhmm(start), endTime: hhmm(end) });
  check('instructor starts an attendance session', ses.status === 201, ses.json);
  const sessionId = ses.data?.id;
  check("another instructor cannot open a session for it", [403, 404].includes((await api('other', 'POST', '/api/v1/attendance/sessions', { classId, meetingDate: now.day, startTime: hhmm(start), endTime: hhmm(end) })).status));
  const scan1 = await api('instr', 'POST', `/api/v1/attendance/sessions/${sessionId}/scan`, { code: s1.qrToken });
  check('QR scan records TIME IN', scan1.status === 200 && /in/i.test(JSON.stringify(scan1.data?.event ?? scan1.data)), scan1.json);
  check('the confirmation names the student and number', JSON.stringify(scan1.data).includes('James') && JSON.stringify(scan1.data).includes(`${M}-1`));
  check('scan result is TIME_IN', scan1.data?.result === 'TIME_IN', scan1.data?.result);
  const dup = await api('instr', 'POST', `/api/v1/attendance/sessions/${sessionId}/scan`, { code: s1.qrToken });
  check('an immediate rescan is a duplicate, not a time-out', dup.data?.result === 'ALREADY_IN', dup.data?.result);
  // Pretend the student arrived three minutes ago, so the next scan is a real time-out.
  await prisma.attendanceRecord.updateMany({ where: { sessionId: BigInt(sessionId), studentId: s1.id }, data: { timeIn: new Date(Date.now() - 3 * 60_000) } });
  const scan2 = await api('instr', 'POST', `/api/v1/attendance/sessions/${sessionId}/scan`, { code: s1.qrToken });
  check('a later scan records TIME OUT', scan2.data?.result === 'TIME_OUT' && Boolean(scan2.data?.timeOut), scan2.data);
  const scan3 = await api('instr', 'POST', `/api/v1/attendance/sessions/${sessionId}/scan`, { code: s1.qrToken });
  check('a scan after time-out is refused as complete', scan3.data?.result === 'ALREADY_COMPLETE', scan3.data?.result);
  const recs = await prisma.attendanceRecord.count({ where: { sessionId: BigInt(sessionId), studentId: s1.id } });
  check('exactly one attendance record for the student', recs === 1, recs);
  const byNumber = await api('instr', 'POST', `/api/v1/attendance/sessions/${sessionId}/scan`, { code: `${M}-2` });
  check('typing a student ID works when a card will not scan', byNumber.status === 200, byNumber.json);
  const out = await api('instr', 'POST', `/api/v1/attendance/sessions/${sessionId}/scan`, { code: outsider.qrToken });
  check('a student not in the class is refused', out.status >= 400, out.json);
  check('another instructor cannot scan into this session', [403, 404].includes((await api('other', 'POST', `/api/v1/attendance/sessions/${sessionId}/scan`, { code: s2.qrToken })).status));
  const view = await api('instr', 'GET', `/api/v1/attendance/sessions/${sessionId}`);
  const counts = view.data?.counts ?? view.data;
  check('live list: 2 of 3 in (late, as the meeting began 30 min ago), 1 not yet', view.status === 200 && counts.present + counts.late === 2 && counts.late === 2 && counts.notYet === 1, counts);
  const stuNotes = await prisma.notification.findMany({ where: { userId: stu.id }, orderBy: { id: 'asc' } });
  check('the student is notified of time in and time out', stuNotes.filter((n) => /attendance|time-out|time out/i.test(n.title)).length >= 2, stuNotes.map((n) => n.title));
  const closed = await api('instr', 'POST', `/api/v1/attendance/sessions/${sessionId}/close`);
  check('closing the session marks the rest absent', closed.status === 200 && closed.data?.absent === 1, closed.json);
  check('the student sees their attendance', (await page('stu', '/my/attendance')).html.includes(`Database Management ${M}`));

  // --- Quiz: scheduled window, online attempt, release ---------------------------------------
  console.log('\nQuiz');
  const quizBody = { classId, kind: 'QUIZ', title: `Quiz 1 ${M}`, instructions: 'Choose the best answer.', date: now.day, startTime: hhmm(Math.max(0, now.minutes - 5)), endTime: hhmm(Math.min(now.minutes + 60, 23 * 60 + 59)), durationMinutes: 30, totalItems: 5, totalPoints: 5, passingScore: 3, onlineEnabled: true };
  const quiz = await api('instr', 'POST', '/api/v1/assessments', quizBody);
  check('instructor creates a quiz with exact date and times', quiz.status === 201, quiz.json);
  const quizId = quiz.data?.id;
  const key = await api('instr', 'PUT', `/api/v1/assessments/${quizId}/key`, { items: ['A', 'B', 'C', 'D', 'A'].map((answer, i) => ({ number: i + 1, prompt: `Question ${i + 1}`, choices: ['A', 'B', 'C', 'D'], answer, points: 1 })) });
  check('answer key saved', key.status === 200 && key.data?.items === 5, key.json);
  check('publishing works', (await api('instr', 'POST', `/api/v1/assessments/${quizId}/status`, { action: 'publish' })).status === 200);
  const started1 = await api('stu', 'POST', `/api/v1/my/assessments/${quizId}/start`);
  check('the student can start the quiz inside its window', started1.status === 200, started1.json);
  const submit = await api('stu', 'POST', `/api/v1/my/assessments/${quizId}/submit`, { answers: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'B' }, final: true });
  check('the student hands in', submit.status === 200, submit.json);
  const quizScore = await prisma.assessmentScore.findFirst({ where: { assessmentId: BigInt(quizId), studentId: s1.id } });
  check('scored automatically against the key: 4 / 5', Number(quizScore?.points) === 4, quizScore?.points);
  const again = await api('stu', 'POST', `/api/v1/my/assessments/${quizId}/submit`, { answers: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' }, final: true });
  check('a handed-in attempt cannot be resubmitted', again.status >= 400, again.json);
  const beforeRelease = await page('stu', `/my/assessments/${quizId}`);
  check('the student does not see an unreleased score', !/4\s*\/\s*5/.test(beforeRelease.html.replace(/<[^>]+>/g, ' ')));
  const later = await api('instr', 'POST', '/api/v1/assessments', { ...quizBody, title: `Quiz 2 ${M}`, date: tomorrow(now.day) });
  await api('instr', 'PUT', `/api/v1/assessments/${later.data?.id}/key`, { items: [{ number: 1, answer: 'A', points: 1 }] });
  await api('instr', 'POST', `/api/v1/assessments/${later.data?.id}/status`, { action: 'publish' });
  check("a quiz outside its window cannot be started", (await api('stu', 'POST', `/api/v1/my/assessments/${later.data?.id}/start`)).status >= 400);
  check('release before finalize is refused', (await api('instr', 'POST', `/api/v1/assessments/${quizId}/status`, { action: 'release' })).status >= 400);
  check('finalize', (await api('instr', 'POST', `/api/v1/assessments/${quizId}/status`, { action: 'finalize' })).status === 200);
  check('release', (await api('instr', 'POST', `/api/v1/assessments/${quizId}/status`, { action: 'release' })).status === 200);
  const afterRelease = await page('stu', `/my/assessments/${quizId}`);
  // The screen prints "{points} / {totalPoints}"; the loader must now carry 4 of 5.
  check('the student now sees 4 / 5', /"points":4\b/.test(afterRelease.html) && /"totalPoints":5\b/.test(afterRelease.html), afterRelease.html.slice(0, 300));
  check('the student is notified of the released score', (await prisma.notification.count({ where: { userId: stu.id, title: { contains: 'Quiz 1' } } })) > 0);

  // --- Examination and sheet checking ----------------------------------------------------------
  console.log('\nExamination and checking');
  check('an exam needs its type', (await api('instr', 'POST', '/api/v1/assessments', { ...quizBody, kind: 'EXAM', title: `Final ${M}` })).status === 422);
  const exam = await api('instr', 'POST', '/api/v1/assessments', { ...quizBody, kind: 'EXAM', examType: 'FINAL', title: `Final Examination ${M}`, date: tomorrow(now.day), totalItems: 5, totalPoints: 5, onlineEnabled: false });
  check('instructor schedules a final examination', exam.status === 201, exam.json);
  const examId = exam.data?.id;
  await api('instr', 'PUT', `/api/v1/assessments/${examId}/key`, { items: ['A', 'B', 'C', 'D', 'A'].map((answer, i) => ({ number: i + 1, answer, points: 1 })) });
  await api('instr', 'POST', `/api/v1/assessments/${examId}/status`, { action: 'publish' });
  check('the student sees the scheduled exam', (await page('stu', '/my/assessments')).html.includes(`Final Examination ${M}`));
  const sheet = await api('instr', 'POST', `/api/v1/assessments/${examId}/check`, { code: s2.qrToken, answers: 'ABCDD' });
  check('checking a sheet identifies the student by QR and scores 4 / 5', sheet.status === 200 && JSON.stringify(sheet.data).includes('Maria') && JSON.stringify(sheet.data).match(/"score"\s*:\s*4\b|"points"\s*:\s*4\b/), sheet.json);
  check('checking the same student again is refused without "replace"', (await api('instr', 'POST', `/api/v1/assessments/${examId}/check`, { code: s2.qrToken, answers: 'ABCDA' })).status >= 400);
  const redo = await api('instr', 'POST', `/api/v1/assessments/${examId}/check`, { code: s2.qrToken, answers: 'ABCDA', replace: true });
  check('with "replace" the new sheet counts (5 / 5)', redo.status === 200 && Number((await prisma.assessmentScore.findFirst({ where: { assessmentId: BigInt(examId), studentId: s2.id } }))?.points) === 5, redo.json);
  check('checking an outsider is refused', (await api('instr', 'POST', `/api/v1/assessments/${examId}/check`, { code: outsider.qrToken, answers: 'ABCDA' })).status >= 400);
  check("another instructor cannot check this exam", [403, 404].includes((await api('other', 'POST', `/api/v1/assessments/${examId}/check`, { code: s3.qrToken, answers: 'ABCDA' })).status));

  // --- Online activity scores -------------------------------------------------------------------
  console.log('\nOnline activity');
  const act = await api('instr', 'POST', '/api/v1/assessments', { classId, kind: 'ACTIVITY', title: `SQL Practice 01 ${M}`, totalPoints: 20 });
  check('instructor creates an online activity', act.status === 201, act.json);
  const actId = act.data?.id;
  const sc = await api('instr', 'PUT', `/api/v1/assessments/${actId}/scores`, { scores: [[s1, 18], [s2, 20], [s3, 16]].map(([s, p]) => ({ studentId: s.id.toString(), points: p })) });
  check('scores entered', sc.status === 200 && sc.data?.saved === 3, sc.json);
  check('a score above the total is refused', (await api('instr', 'PUT', `/api/v1/assessments/${actId}/scores`, { scores: [{ studentId: s1.id.toString(), points: 25 }] })).status >= 400);
  check('a score for an outsider is refused', (await api('instr', 'PUT', `/api/v1/assessments/${actId}/scores`, { scores: [{ studentId: outsider.id.toString(), points: 5 }] })).status >= 400);
  check('edit a score', (await api('instr', 'PUT', `/api/v1/assessments/${actId}/scores`, { scores: [{ studentId: s3.id.toString(), points: 17 }] })).status === 200);
  await api('instr', 'POST', `/api/v1/assessments/${actId}/status`, { action: 'finalize' });
  check('release the activity', (await api('instr', 'POST', `/api/v1/assessments/${actId}/status`, { action: 'release' })).status === 200);
  check('scores are locked once released', (await api('instr', 'PUT', `/api/v1/assessments/${actId}/scores`, { scores: [{ studentId: s3.id.toString(), points: 1 }] })).status >= 400);

  // --- Gradebook ---------------------------------------------------------------------------------
  console.log('\nGradebook');
  const gb = await api('instr', 'GET', `/api/v1/classes/${classId}/grades`);
  check('gradebook loads with the class students', gb.status === 200 && JSON.stringify(gb.data).includes(`Tan ${M}`), gb.status);
  check('released quiz and activity scores appear in it', JSON.stringify(gb.data).includes(`Quiz 1 ${M}`) && JSON.stringify(gb.data).includes(`SQL Practice 01 ${M}`));
  check('weights must add to 100', (await api('instr', 'PUT', `/api/v1/classes/${classId}/weights`, { QUIZ: 50, EXAM: 50, ACTIVITY: 50, PT: 0 })).status === 422);
  const csv = await fetch(`${BASE}/api/v1/classes/${classId}/grades/export`, { headers: { cookie: cookies.instr } });
  const csvText = await csv.text();
  check('gradebook exports as CSV', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type') ?? '') && csvText.includes(`${M}-1`), csv.status);
  check('grades cannot be finalized while an assessment is in draft', (await api('instr', 'POST', `/api/v1/classes/${classId}/grades/status`, { action: 'finalize' })).json?.code === 'ASSESSMENTS_IN_DRAFT');
  for (const id of [examId, later.data?.id]) await api('instr', 'POST', `/api/v1/assessments/${id}/status`, { action: 'finalize' });
  check('finalize grades', (await api('instr', 'POST', `/api/v1/classes/${classId}/grades/status`, { action: 'finalize' })).status === 200);
  check('release grades', (await api('instr', 'POST', `/api/v1/classes/${classId}/grades/status`, { action: 'release' })).status === 200);
  check('the student sees released grades', (await page('stu', '/my/grades')).html.includes(`Database Management ${M}`));

  // --- Documents (Lesson plan, TOS, PT) ---------------------------------------------------------
  console.log('\nLesson plans, TOS and PT');
  const pdf = new Blob([Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')], { type: 'application/pdf' });
  const docIds = {};
  let storageMissing = false;
  for (const kind of ['LESSON_PLAN', 'TOS', 'PT']) {
    const form = new FormData();
    form.append('data', JSON.stringify({ kind, classId, title: `${kind} ${M}`, documentDate: now.day, details: { topic: 'Normalization', coverage: 'Units 1-3', totalItems: '50', task: 'ERD build', criteria: 'Accuracy', rubric: 'Four levels' } }));
    form.append('file', pdf, `${kind.toLowerCase()}.pdf`);
    let r = await api('instr', 'POST', '/api/v1/documents', form);
    if (r.status === 503 && r.json?.code === 'STORAGE_NOT_CONFIGURED') {
      storageMissing = true;
      check(`${kind}: without file storage configured, upload is refused with a clear message`, /not configured/i.test(r.json?.message ?? ''), r.json);
      const bare = new FormData();
      bare.append('data', form.get('data'));
      r = await api('instr', 'POST', '/api/v1/documents', bare);
    }
    check(`${kind}: created`, r.status === 201, r.json);
    docIds[kind] = r.data?.id;
    check(`${kind}: submitted`, (await api('instr', 'POST', `/api/v1/documents/${docIds[kind]}/submit`)).status === 200);
  }
  const bad = new FormData();
  bad.append('data', JSON.stringify({ kind: 'TOS', classId, title: `Bad ${M}` }));
  bad.append('file', new Blob([Buffer.from('MZ-not-a-pdf')], { type: 'application/pdf' }), 'evil.pdf');
  { const b = await api('instr', 'POST', '/api/v1/documents', bad); check('a file whose content is not what its name says is refused', b.status >= 400 && b.status !== 503, b.json); }
  check('coordinator sees the submissions', (await page('coord', '/academic-reviews')).html.includes(`LESSON_PLAN ${M}`));
  check('director sees the submissions', (await page('dir', '/academic-reviews')).html.includes(`TOS ${M}`));
  check('secretary cannot review documents', (await api('sec', 'POST', `/api/v1/documents/${docIds.TOS}/review`, { action: 'start' })).status === 403);
  check('coordinator starts review', (await api('coord', 'POST', `/api/v1/documents/${docIds.LESSON_PLAN}/review`, { action: 'start' })).status === 200);
  check('coordinator approves', (await api('coord', 'POST', `/api/v1/documents/${docIds.LESSON_PLAN}/review`, { action: 'approve' })).status === 200);
  check('director returns the TOS with a note', (await api('dir', 'POST', `/api/v1/documents/${docIds.TOS}/review`, { action: 'return', note: 'Add the item distribution.' })).status === 200);
  check('the instructor is notified the TOS was returned', (await prisma.notification.count({ where: { userId: instr.id, createdAt: { gte: started }, title: { contains: 'returned', mode: 'insensitive' } } })) > 0);
  if (!storageMissing) {
    const dl = await fetch(`${BASE}/api/v1/documents/${docIds.PT}/file`, { headers: { cookie: cookies.coord } });
    check('coordinator can download a submitted file', dl.status === 200 && (await dl.text()).startsWith('%PDF'), dl.status);
  }
  check("another instructor cannot download it", (await fetch(`${BASE}/api/v1/documents/${docIds.PT}/file`, { headers: { cookie: cookies.other } })).status >= 400);

  // --- Status recommendation --------------------------------------------------------------------
  console.log('\nStudent status recommendation');
  const req = await api('instr', 'POST', '/api/v1/status-requests', { classId, studentId: s3.id.toString(), requestedStatus: 'transferred', reason: 'Transferred to another institution.' });
  check('instructor submits a status recommendation', req.status === 201, req.json);
  check('the student record is NOT changed yet', (await prisma.student.findUnique({ where: { id: s3.id } })).status === 'active');
  const officeNotes = await prisma.notification.findMany({ where: { createdAt: { gte: started }, user: { email: { startsWith: M.toLowerCase() } }, title: { contains: 'status', mode: 'insensitive' } }, select: { user: { select: { name: true } } } });
  const who = officeNotes.map((n) => n.user.name).join(' ');
  check('director, coordinator and secretary are notified', ['Dino', 'Cora', 'Sara'].every((n) => who.includes(n)), who);
  check('an outsider recommendation is refused', (await api('instr', 'POST', '/api/v1/status-requests', { classId, studentId: outsider.id.toString(), requestedStatus: 'dropped', reason: 'x' })).status >= 400);
  check('the instructor cannot decide it', (await api('instr', 'POST', `/api/v1/status-requests/${req.data?.id}/decide`, { decision: 'APPROVED' })).status === 403);
  check('secretary sees it', (await page('sec', '/status-requests')).html.includes(`Santos ${M}`));
  check('secretary approves it', (await api('sec', 'POST', `/api/v1/status-requests/${req.data?.id}/decide`, { decision: 'APPROVED', note: 'Confirmed.' })).status === 200);
  check('only now the student is transferred', (await prisma.student.findUnique({ where: { id: s3.id } })).status === 'transferred');

  // --- Learning support, badges ------------------------------------------------------------------
  console.log('\nLearning support and badges');
  const ls = await api('instr', 'POST', '/api/v1/learning-supports', { classId, studentId: s2.id.toString(), difficulty: 'Joins across three tables', evidence: 'Quiz 1: 2/5', interventions: ['Tutorial session', 'Additional practice exercises'], followUpOn: tomorrow(now.day) });
  check('instructor records a learning support recommendation', ls.status === 201, ls.json);
  check('coordinator can monitor it', (await page('coord', '/learning-support')).html.includes(`Cruz ${M}`));
  check('secretary cannot', !(await page('sec', '/learning-support')).html.includes(`Cruz ${M}`));
  const badge = await api('instr', 'POST', '/api/v1/badges', { classId, studentId: s1.id.toString(), badge: 'EXCELLENT_PERFORMANCE', reason: 'Top score in Quiz 1', awardedOn: now.day });
  check('instructor awards a badge', badge.status === 201, badge.json);
  check('the student sees the badge', (await page('stu', '/my/badges')).html.includes('Top score in Quiz 1'));
  check('a badge for an outsider is refused', (await api('instr', 'POST', '/api/v1/badges', { classId, studentId: outsider.id.toString(), badge: 'EXCELLENT_PERFORMANCE', reason: 'x', awardedOn: now.day })).status >= 400);

  // --- PDS -----------------------------------------------------------------------------------------
  console.log('\nInstructor profile (PDS)');
  const pds = await api('instr', 'PUT', '/api/v1/instructor-profile', { employeeId: `EMP-${M}`, personal: { dateOfBirth: '1990-04-02', placeOfBirth: 'Dagupan', sex: 'Female', civilStatus: 'Single', citizenship: 'Filipino', contactNumber: '09170000000', address: 'Dagupan City' }, education: [{ level: 'College', school: 'State University', degree: 'BS IT', yearGraduated: '2011' }], training: [{ title: 'TM1', type: 'Training', provider: 'TESDA', from: '2020-01-01', to: '2020-01-10', hours: '80', certificate: 'Yes' }] });
  check('instructor saves the PDS', pds.status === 200, pds.json);
  const pdsPage = await page('instr', '/teaching/pds');
  // The screen computes "Profile completion NN%" from the saved PDS (shared/lib/pds.ts); the loader must carry it.
  check('profile completion is shown', pdsPage.status === 200 && pdsPage.html.includes(`EMP-${M}`) && pdsPage.html.includes('Dagupan'), pdsPage.status);
  const dirView = await page('dir', `/instructors/${instr.id}`);
  check('director can view the instructor profile', dirView.status === 200 && dirView.html.includes(`EMP-${M}`), dirView.status);
  check('coordinator cannot', !(await page('coord', `/instructors/${instr.id}`)).html.includes(`EMP-${M}`));

  // --- Calendar ------------------------------------------------------------------------------------
  console.log('\nSchool calendar');
  const ev = await api('coord', 'POST', '/api/v1/calendar', { title: `Midterm week ${M}`, type: 'EXAM_PERIOD', startsOn: tomorrow(now.day), endsOn: tomorrow(now.day), notify: false });
  check('coordinator adds a calendar event', ev.status === 201, ev.json);
  const calPage = await page('instr', `/calendar?month=${tomorrow(now.day).slice(0, 7)}`);
  check('the instructor sees it', calPage.html.includes(`Midterm week ${M}`));
  check('the instructor cannot change the calendar', (await api('instr', 'POST', '/api/v1/calendar', { title: 'x', type: 'EVENT', startsOn: now.day, endsOn: now.day })).status === 403);
  if (ev.data?.id) await api('coord', 'DELETE', `/api/v1/calendar/${ev.data.id}`);

  // --- School year archive (on a throwaway year, never the real one) ------------------------------
  console.log('\nSchool year lifecycle');
  const yLabel = '2098-2099';
  const ny = await api('dir', 'POST', '/api/v1/school-years', { label: yLabel, startsOn: '2098-06-01', endsOn: '2099-05-31' });
  check('director creates a new school year', ny.status === 201, ny.json);
  const yId = ny.data?.id; if (yId) created.years.push(BigInt(yId));
  check('activating it is refused while another year is active', (await api('dir', 'POST', `/api/v1/school-years/${yId}/activate`)).status === 409);
  const ys = await api('coord', 'POST', '/api/v1/sections', { schoolYearId: yId, programId: created.program.id.toString(), yearLevel: 1, name: `Y-${M}` });
  created.sections.push(BigInt(ys.data?.id));
  await api('coord', 'POST', `/api/v1/sections/${ys.data?.id}/students`, { studentIds: [s1.id.toString()] });
  const yc = await api('coord', 'POST', '/api/v1/classes', { sectionId: ys.data?.id, subjectId: created.subject.id.toString(), semester: 1, instructorId: instr.id.toString(), schedules: [] });
  const ya = await api('instr', 'POST', '/api/v1/assessments', { classId: yc.data?.id, kind: 'ACTIVITY', title: `Old activity ${M}`, totalPoints: 10 });
  await api('instr', 'PUT', `/api/v1/assessments/${ya.data?.id}/scores`, { scores: [{ studentId: s1.id.toString(), points: 7 }] });
  const checks = await api('dir', 'GET', `/api/v1/school-years/${yId}/archive`);
  check('pre-archive checks list outstanding work', checks.status === 200 && checks.data?.checks?.find((c) => c.key === 'assessments')?.count >= 1, checks.data?.checks);
  check('archiving without acknowledging is refused', (await api('dir', 'POST', `/api/v1/school-years/${yId}/archive`, { acknowledge: false, createNext: false })).status === 409);
  check('a coordinator cannot archive', (await api('coord', 'POST', `/api/v1/school-years/${yId}/archive`, { acknowledge: true, createNext: false })).status === 403);
  const arch = await api('dir', 'POST', `/api/v1/school-years/${yId}/archive`, { acknowledge: true, createNext: false });
  check('director archives it', arch.status === 200, arch.json);
  check('its data is still there', (await prisma.assessmentScore.count({ where: { assessmentId: BigInt(ya.data?.id) } })) === 1);
  check('archived scores cannot be modified', (await api('instr', 'PUT', `/api/v1/assessments/${ya.data?.id}/scores`, { scores: [{ studentId: s1.id.toString(), points: 9 }] })).status === 409);
  check('no new assessment in an archived year', (await api('instr', 'POST', '/api/v1/assessments', { classId: yc.data?.id, kind: 'ACTIVITY', title: 'x', totalPoints: 5 })).status === 409);
  check('the real active year is untouched', (await prisma.schoolYear.findUnique({ where: { id: year.id } })).status === 'ACTIVE');

  // --- Other roles still work -----------------------------------------------------------------------
  console.log('\nOther roles');
  for (const role of ['coord', 'dir', 'sec', 'stu']) {
    const r = await page(role, '/dashboard');
    check(`${role} dashboard still renders`, r.status === 200 && !/Application error|Unable to load/.test(r.html), r.status);
  }

  if (process.env.SHOTS) {
    const { spawn } = await import('node:child_process');
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const OUT = process.env.SHOTS; mkdirSync(OUT, { recursive: true });
    // Fresh data worth looking at: a new open session with one scan, in the real class.
    const s2ses = await api('instr', 'POST', '/api/v1/attendance/sessions', { classId, meetingDate: now.day, startTime: hhmm(Math.min(now.minutes + 1, 23 * 60)), endTime: hhmm(Math.min(now.minutes + 90, 23 * 60 + 59)) });
    if (s2ses.data?.id) await api('instr', 'POST', `/api/v1/attendance/sessions/${s2ses.data.id}/scan`, { code: s2.qrToken });
    const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${OUT}/profile`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
    let version; for (let i = 0; i < 40; i++) { try { version = await (await fetch('http://127.0.0.1:9337/json/version')).json(); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    const ws = new WebSocket(version.webSocketDebuggerUrl); let mid = 0; const pend = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    await new Promise((r) => (ws.onopen = r));
    const send = (method, params = {}, sessionId) => new Promise((res) => { const id = ++mid; pend.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
    const shot = async (who, path, name, width = 1440, mobile = false) => {
      const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
      const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s('Network.enable'); await s('Page.enable');
      await s('Network.setCookie', { name: 'tdms_session', value: cookies[who].split('=')[1], domain: 'localhost', path: '/', httpOnly: true });
      await s('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
      await s('Page.navigate', { url: `${BASE}${path}` }); await new Promise((r) => setTimeout(r, 4500));
      const h = (await s('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })).result.result.value;
      await s('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 3600), deviceScaleFactor: 1, mobile }); await new Promise((r) => setTimeout(r, 400));
      const r = await s('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
      await send('Target.closeTarget', { targetId });
    };
    await shot('instr', '/dashboard', 'instructor-dashboard');
    if (s2ses.data?.id) await shot('instr', `/teaching/attendance/${s2ses.data.id}`, 'attendance-scanner', 390, true);
    await shot('instr', `/teaching/gradebook?class=${classId}`, 'gradebook');
    await shot('instr', `/teaching/classes/${classId}`, 'class-record');
    await shot('stu', '/my/qr', 'student-qr', 390, true);
    await shot('coord', '/class-setup', 'class-setup');
    ws.close(); chrome.kill();
    if (s2ses.data?.id) await api('instr', 'POST', `/api/v1/attendance/sessions/${s2ses.data.id}/close`);
  }
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  // --- Cleanup: everything created, in dependency order. Audit rows are kept. --------------------
  try {
    const classes = await prisma.classOffering.findMany({ where: { sectionId: { in: created.sections.filter(Boolean) } }, select: { id: true } });
    const classIds = classes.map((c) => c.id);
    const sessions = await prisma.attendanceSession.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
    const assessments = await prisma.assessment.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
    await prisma.attendanceRecord.deleteMany({ where: { sessionId: { in: sessions.map((s) => s.id) } } });
    await prisma.attendanceSession.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.assessmentScore.deleteMany({ where: { assessmentId: { in: assessments.map((a) => a.id) } } });
    await prisma.assessmentItem.deleteMany({ where: { assessmentId: { in: assessments.map((a) => a.id) } } });
    await prisma.assessment.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.classGrade.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.studentBadge.deleteMany({ where: { studentId: { in: created.students } } });
    await prisma.academicDocument.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.studentStatusRequest.deleteMany({ where: { studentId: { in: created.students } } });
    await prisma.learningSupport.deleteMany({ where: { studentId: { in: created.students } } });
    await prisma.classSchedule.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.classOffering.deleteMany({ where: { id: { in: classIds } } });
    await prisma.sectionStudent.deleteMany({ where: { sectionId: { in: created.sections.filter(Boolean) } } });
    await prisma.section.deleteMany({ where: { id: { in: created.sections.filter(Boolean) } } });
    await prisma.calendarEvent.deleteMany({ where: { title: { contains: M } } });
    // Notifications this run caused: to the throwaway accounts, and any that name the run's marker.
    const n1 = await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    const n2 = await prisma.notification.deleteMany({ where: { createdAt: { gte: started }, OR: [{ title: { contains: M } }, { body: { contains: M } }, { title: { contains: '2098-2099' } }] } });
    console.log(`\nremoved ${n1.count + n2.count} notification(s)`);
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: created.students } } });
    await prisma.student.deleteMany({ where: { id: { in: created.students } } });
    if (created.curriculum) {
      await prisma.curriculumSubject.deleteMany({ where: { curriculumId: created.curriculum.id } });
      await prisma.curriculum.delete({ where: { id: created.curriculum.id } });
    }
    if (created.subject) await prisma.subject.delete({ where: { id: created.subject.id } });
    if (created.program) await prisma.program.delete({ where: { id: created.program.id } });
    await prisma.instructorProfile.deleteMany({ where: { userId: { in: created.users } } });
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
process.exit(0);
