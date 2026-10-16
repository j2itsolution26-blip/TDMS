// End-to-end check of Applications: record (draft) → documents → submit →
// review → approve / return / reject, through the real endpoints.
//
//   npm run build && FILE_STORAGE=local PORT=3001 npm start
//   npm run test:applications            (BASE=http://host:port to point elsewhere)
//
// What it guards: drafts stay drafts; submission needs every required field
// and document; uploads are checked and never verify anything by themselves;
// approval needs verified documents, creates or links ONE student, carries the
// documents over and opens ONE pending enrollment for the chosen school year;
// a decided application cannot be decided again; only permitted roles act.
//
// Throwaway records only (marker ZZE2E…), removed at the end. Run it against a
// disposable database — never production.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Ap#Check${stamp}xY`;
const created = { users: [], programs: [], curricula: [], years: [], requirements: [] };
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
async function api(who, method, p, body) {
  const res = await fetch(`${BASE}/api/v1${p}`, { method, headers: { ...(who ? { cookie: cookies[who] } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data, text, headers: res.headers };
}
async function upload(who, appId, reqId, name, bytes, type = 'application/pdf') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), name);
  const res = await fetch(`${BASE}/api/v1/applications/${appId}/documents/${reqId}`, { method: 'POST', headers: { cookie: cookies[who] }, body: form });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, data: json?.data };
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const page = async (who, p) => (await api(who, 'GET', `/pages${p}`)).data;
const setDoc = (who, appId, reqId, status, remarks) => api(who, 'POST', `/applications/${appId}/documents/${reqId}/status`, { status, ...(remarks ? { remarks } : {}) });

let n = 0;
function person(over = {}) {
  n += 1;
  return {
    firstName: `Ana${n}`, middleName: '', lastName: `L${M}${String(n).padStart(3, '0')}`, suffix: '',
    email: `${M.toLowerCase()}-applicant${n}@example.test`, phone: '0917 123 4567', dateOfBirth: '2005-03-14',
    address: 'Purok 1, Barangay Centro, Dagupan City', emergencyContactName: 'Maria', emergencyContactPhone: '0918 765 4321',
    highestEducation: 'senior_high', previousSchool: 'Dagupan City NHS', yearGraduated: '2024', educationNotes: 'ICT strand',
    ...over,
  };
}

try {
  console.log(`Applications workflow e2e against ${BASE} (marker ${M})\n`);
  await makeUser('secretary', 'secretary');
  await makeUser('reviewer', 'secretary');
  await makeUser('director', 'director');
  await makeUser('teacher', 'teacher');
  await makeUser('po', 'processing_officer');

  const dit = await prisma.program.create({ data: { code: `${M}-DIT-1`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  const dht = await prisma.program.create({ data: { code: `${M}-DHT-2`, name: 'Diploma in Hospitality Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(dit.id, dht.id);
  for (const p of [dit, dht]) created.curricula.push((await prisma.curriculum.create({ data: { programId: p.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } })).id);
  // A requirement of DIT's own, besides the global ones; and an optional one.
  const own = await prisma.credentialRequirement.create({ data: { programId: dit.id, name: `${M} Medical certificate`, isRequired: true, isActive: true, createdAt: new Date() } });
  const optional = await prisma.credentialRequirement.create({ data: { programId: dit.id, name: `${M} Barangay clearance`, isRequired: false, isActive: true, createdAt: new Date() } });
  const dhtOnly = await prisma.credentialRequirement.create({ data: { programId: dht.id, name: `${M} Food handler's permit`, isRequired: true, isActive: true, createdAt: new Date() } });
  created.requirements.push(own.id, optional.id, dhtOnly.id);
  const y = String(stamp).slice(-4);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${y}`, startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING', currentSemester: 2 } });
  const archived = await prisma.schoolYear.create({ data: { label: `2096-${y}`, startsOn: new Date('2096-06-01'), endsOn: new Date('2097-03-31'), status: 'ARCHIVED' } });
  created.years.push(year.id, archived.id);
  const ditReqs = await prisma.credentialRequirement.findMany({ where: { isActive: true, OR: [{ programId: null }, { programId: dit.id }] }, select: { id: true, isRequired: true } });
  const requiredDit = ditReqs.filter((r) => r.isRequired);

  console.log('Access');
  check('signed out: 401', (await api(null, 'GET', '/applications')).status === 401);
  check('an Instructor cannot list applications (403)', (await api('teacher', 'GET', '/applications')).status === 403);
  check('an Instructor cannot record one (403)', (await api('teacher', 'POST', '/applications', person({ programId: String(dit.id) }))).status === 403);
  check('a Director may open the list (view only)', (await api('director', 'GET', '/applications')).status === 200);
  check('a Processing Officer cannot open the page (403)', (await api('po', 'GET', '/pages/applications')).status === 403);
  const pg = await page('secretary', '/applications');
  check('the page lists both programs from the database and the school years', pg?.programs.some((p) => p.id === String(dit.id)) && pg.programs.some((p) => p.id === String(dht.id)) && pg.schoolYears.some((s) => s.id === String(year.id)));

  console.log('\nRecording a draft');
  const bad = await api('secretary', 'POST', '/applications', { ...person(), firstName: ' ', email: 'not-an-email', phone: 'abc', programId: String(dit.id) });
  check('names, email and phone are validated on the server (422 with field errors)', bad.status === 422 && bad.json?.errors?.firstName && bad.json.errors.email && bad.json.errors.phone, bad.json);
  check('an unknown program is refused', (await api('secretary', 'POST', '/applications', { ...person(), programId: '999999999' })).status === 422);
  check('an archived school year is refused', (await api('secretary', 'POST', '/applications', { ...person(), programId: String(dit.id), schoolYearId: String(archived.id) })).status === 422);
  const minimal = await api('secretary', 'POST', '/applications', { firstName: 'Draft', lastName: `L${M}draft`, programId: String(dit.id), email: '', phone: '', dateOfBirth: '', address: '', schoolYearId: '' });
  check('a draft needs only the names and the program', minimal.status === 201 && minimal.data?.status === 'draft' && /^APP-\d{4}-\d{4,}$/.test(minimal.data.applicationNumber), minimal.json);
  const minimalSubmit = await api('secretary', 'POST', `/applications/${minimal.data.id}/submit`);
  check('…and cannot be submitted incomplete: 422 naming every missing field and document', minimalSubmit.status === 422 && ['email', 'phone', 'dateOfBirth', 'address', 'schoolYearId', 'highestEducation', 'previousSchool'].every((k) => minimalSubmit.json?.errors?.[k]) && requiredDit.every((r) => minimalSubmit.json.errors[`documents.${r.id}`]), minimalSubmit.json);
  check('…and stays a draft', (await prisma.application.findUnique({ where: { id: BigInt(minimal.data.id) } })).status === 'draft');

  const ana = person({ programId: String(dit.id), schoolYearId: String(year.id) });
  const a1 = await api('secretary', 'POST', '/applications', ana);
  check('a full application is recorded as a draft', a1.status === 201 && a1.data.status === 'draft', a1.json);
  const id1 = a1.data.id;
  const dup = await api('secretary', 'POST', '/applications', { ...ana, email: ana.email.toUpperCase() });
  check('the same applicant cannot get a second open application (409, any letter case)', dup.status === 409 && dup.json?.code === 'DUPLICATE_APPLICATION', dup.json);
  const twice = await Promise.all([0, 1].map(() => api('secretary', 'POST', '/applications', person({ email: `${M.toLowerCase()}-race@example.test`, programId: String(dit.id) }))));
  check('two simultaneous saves of one applicant record exactly one', twice.filter((r) => r.status === 201).length === 1 && twice.filter((r) => r.status === 409).length === 1, twice.map((r) => r.status));
  const listed = await page('secretary', `/applications?search=${encodeURIComponent(a1.data.applicationNumber)}`);
  check('the draft appears in the list at once (search by number)', listed?.rows.length === 1 && listed.rows[0].status === 'draft' && listed.rows[0].documents.total === ditReqs.length && listed.rows[0].documents.handedIn === 0, listed?.rows);

  console.log('\nDocuments');
  const req0 = requiredDit[0].id;
  check('a disallowed file type is refused', (await upload('secretary', id1, req0, 'run.exe', Buffer.from('MZ....'), 'application/octet-stream')).status === 422);
  check('a file whose content does not match its type is refused', (await upload('secretary', id1, req0, 'fake.pdf', Buffer.from('not a pdf at all'))).status === 422);
  check('a file over 4 MB is refused', (await upload('secretary', id1, req0, 'big.pdf', Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024 + 10)]))).status === 422);
  check('an Instructor cannot upload (403)', (await upload('teacher', id1, req0, 'a.pdf', PDF)).status === 403);
  const up = await upload('secretary', id1, req0, 'birth-certificate.pdf', PDF);
  check('a valid PDF is accepted and becomes Submitted — not Verified', up.status === 201 && up.data?.status === 'submitted', up.json);
  check('a requirement of another program cannot be attached (404)', (await upload('secretary', id1, dhtOnly.id, 'a.pdf', PDF)).status === 404);
  check('verifying a document with nothing handed in is refused', (await setDoc('secretary', id1, requiredDit[1].id, 'verified')).status === 422);
  check('rejecting needs a reason', (await setDoc('secretary', id1, req0, 'rejected')).status === 422);
  for (const r of requiredDit.slice(1)) await setDoc('secretary', id1, r.id, 'submitted');
  const doc = await prisma.applicationDocument.findFirst({ where: { applicationId: BigInt(id1), credentialRequirementId: req0 } });
  check('the stored file has an unguessable key and no public URL is returned', /^applications\/\d+\/[0-9a-f]{32}\.pdf$/.test(doc.fileKey) && !JSON.stringify(up.json).includes(doc.fileKey));
  const dl = await fetch(`${BASE}/api/v1/application-documents/${doc.id}/file`, { headers: { cookie: cookies.secretary } });
  check('the file downloads through the authorized route', dl.status === 200 && (await dl.text()).startsWith('%PDF'));
  check('…but not for an Instructor (403)', (await fetch(`${BASE}/api/v1/application-documents/${doc.id}/file`, { headers: { cookie: cookies.teacher } })).status === 403);

  console.log('\nSubmission and review');
  const sub = await api('secretary', 'POST', `/applications/${id1}/submit`);
  check('with every required document handed in it is submitted (optional ones never block)', sub.status === 200 && sub.data?.status === 'submitted', sub.json);
  check('submitting twice is refused (409)', (await api('secretary', 'POST', `/applications/${id1}/submit`)).status === 409);
  const row = (await page('secretary', `/applications?status=submitted&program=${dit.id}&year=${year.id}`))?.rows.find((r) => r.id === id1);
  check('it is listed under Submitted, filtered by program and school year, with a submission date', row?.submittedAt && row.documents.handedIn === requiredDit.length, row);
  const today = new Date().toISOString().slice(0, 10);
  check('…and by submission date', (await page('secretary', `/applications?from=${today}&to=${today}&search=${M}`))?.rows.some((r) => r.id === id1) && !(await page('secretary', `/applications?from=2000-01-01&to=2000-01-02&search=${M}`))?.rows.length);
  check('…and by phone and email search', (await page('secretary', `/applications?search=09171234567`))?.rows.some((r) => r.id === id1) && (await page('secretary', `/applications?search=${encodeURIComponent(ana.email)}`))?.rows.length === 1);
  const counts = (await page('secretary', '/applications'))?.counts;
  check('the counts include it', counts && counts.submitted >= 1 && counts.total >= 3 && counts.draft >= 2, counts);
  const review = await api('reviewer', 'POST', `/applications/${id1}/review`);
  const reviewed = await prisma.application.findUnique({ where: { id: BigInt(id1) }, include: { reviewer: true } });
  check('Start review: Under Review, with the reviewer recorded', review.status === 200 && reviewed.status === 'under_review' && reviewed.reviewer?.name === `${M} reviewer`, review.json);
  const early = await api('reviewer', 'POST', `/applications/${id1}/approve`);
  check('approval is refused while required documents are unverified', early.status === 422 && early.json?.code === 'DOCUMENTS_NOT_VERIFIED', early.json);
  check('…and nothing was created', (await prisma.student.count({ where: { lastName: ana.lastName } })) === 0 && (await prisma.application.findUnique({ where: { id: BigInt(id1) } })).status === 'under_review');
  const rej = await setDoc('reviewer', id1, req0, 'rejected', 'Blurred copy');
  check('a document can be rejected with remarks', rej.status === 200 && (await prisma.applicationDocument.findFirst({ where: { applicationId: BigInt(id1), credentialRequirementId: req0 } })).remarks === 'Blurred copy');
  for (const r of requiredDit) await setDoc('reviewer', id1, r.id, 'submitted');
  for (const r of requiredDit) await setDoc('reviewer', id1, r.id, 'verified');
  const detail = (await api('reviewer', 'GET', `/applications/${id1}`)).data;
  check('the detail shows every required document verified, by whom, and nothing blocking approval', detail.approvalProblems.length === 0 && detail.requirements.filter((r) => r.isRequired).every((r) => r.status === 'verified' && r.verifiedBy === `${M} reviewer`), detail.requirements);
  check('verified documents are locked against replacement', (await upload('secretary', id1, req0, 'again.pdf', PDF)).status === 409);

  console.log('\nApproval');
  const ok1 = await api('reviewer', 'POST', `/applications/${id1}/approve`, { remarks: 'Complete requirements' });
  const st = ok1.data ? await prisma.student.findUnique({ where: { id: BigInt(ok1.data.studentId) }, include: { enrollments: true, credentials: true } }) : null;
  check('approval creates the student in the application’s program, as an applicant', ok1.status === 200 && !ok1.data.linked && st?.programId === dit.id && st.status === 'applicant' && st.email === ana.email, ok1.json);
  check('…opens ONE pending enrollment for the chosen school year and its current semester', st?.enrollments.length === 1 && st.enrollments[0].status === 'pending' && st.enrollments[0].schoolYear === year.label && st.enrollments[0].semester === 2);
  const verifiedCreds = st?.credentials.filter((c) => requiredDit.some((r) => r.id === c.credentialRequirementId) && c.status === 'verified').length;
  check('…carries the verified documents into the student’s checklist (file included)', verifiedCreds === requiredDit.length && st.credentials.some((c) => c.filePath === doc.fileKey));
  const after = await prisma.application.findUnique({ where: { id: BigInt(id1) } });
  check('…and stores the status, reviewer, decision date and remarks', after.status === 'approved' && after.reviewedAt && after.notes === 'Complete requirements' && String(after.studentId) === ok1.data.studentId);
  const again = await api('reviewer', 'POST', `/applications/${id1}/approve`);
  check('approving again is refused and creates nothing (409)', again.status === 409 && (await prisma.student.count({ where: { lastName: ana.lastName } })) === 1, again.json);
  check('an approved application can no longer be edited (409)', (await api('secretary', 'PUT', `/applications/${id1}`, ana)).status === 409);
  check('nor returned or rejected', (await api('reviewer', 'POST', `/applications/${id1}/return`, { reason: 'x' })).status === 409 && (await api('reviewer', 'POST', `/applications/${id1}/reject`, { reason: 'x' })).status === 409);
  const inEnroll = await page('secretary', `/enrollments?search=${encodeURIComponent(ok1.data.studentNumber)}`);
  check('the new student is in Enrollments as Pending (not enrolled)', inEnroll?.data.rows.length === 1 && inEnroll.data.rows[0].status === 'pending', inEnroll?.data.rows);
  check('the decision is in the audit log', (await prisma.auditLog.count({ where: { action: 'application.approved', target: `Application ${a1.data.applicationNumber}` } })) === 1);

  console.log('\nThe same person applies again: link, never duplicate');
  const a2 = await api('secretary', 'POST', '/applications', { ...ana, firstName: ana.firstName.toUpperCase() });
  check('a new application is allowed once the first is decided', a2.status === 201, a2.json);
  const id2 = a2.data.id;
  for (const r of requiredDit) { await setDoc('secretary', id2, r.id, 'submitted'); await setDoc('secretary', id2, r.id, 'verified'); }
  await api('secretary', 'POST', `/applications/${id2}/submit`);
  const d2 = (await api('reviewer', 'GET', `/applications/${id2}`)).data;
  check('the review shows the existing student as a possible match', d2.possibleStudents.some((s) => s.id === ok1.data.studentId), d2.possibleStudents);
  const blind = await api('reviewer', 'POST', `/applications/${id2}/approve`);
  check('approving without choosing is refused (409 STUDENT_MATCH) and changes nothing', blind.status === 409 && blind.json?.code === 'STUDENT_MATCH' && (await prisma.application.findUnique({ where: { id: BigInt(id2) } })).status === 'submitted', blind.json);
  const linked = await api('reviewer', 'POST', `/applications/${id2}/approve`, { studentId: ok1.data.studentId });
  check('linking the existing student is refused when it was already admitted through another application', linked.status === 409 && linked.json?.code === 'ALREADY_ADMITTED', linked.json);
  // An older student record (no application) for someone applying now: link it.
  const legacy = await prisma.student.create({ data: { studentNumber: `${M}-OLD`, firstName: 'Ben', lastName: `L${M}old`, email: `${M.toLowerCase()}-ben@example.test`, dateOfBirth: new Date('2004-01-02'), programId: dit.id, curriculumId: created.curricula[0], yearLevel: 1, status: 'applicant', createdAt: new Date() } });
  await prisma.enrollment.create({ data: { studentId: legacy.id, curriculumId: created.curricula[0], schoolYear: year.label, schoolYearId: year.id, semester: 2, yearLevel: 1, status: 'pending', createdAt: new Date() } });
  const ben = await api('secretary', 'POST', '/applications', person({ firstName: 'Ben', lastName: `L${M}old`, email: `${M.toLowerCase()}-ben@example.test`, dateOfBirth: '2004-01-02', programId: String(dit.id), schoolYearId: String(year.id) }));
  for (const r of requiredDit) { await setDoc('secretary', ben.data.id, r.id, 'submitted'); await setDoc('secretary', ben.data.id, r.id, 'verified'); }
  await api('secretary', 'POST', `/applications/${ben.data.id}/submit`);
  const benOk = await api('reviewer', 'POST', `/applications/${ben.data.id}/approve`, { studentId: String(legacy.id) });
  check('linking an existing student reuses it — no new student record', benOk.status === 200 && benOk.data.linked && benOk.data.studentId === String(legacy.id) && (await prisma.student.count({ where: { lastName: `L${M}old` } })) === 1, benOk.json);
  check('…and its existing enrollment for that term is kept, not duplicated', benOk.data?.enrollment?.created === false && (await prisma.enrollment.count({ where: { studentId: legacy.id } })) === 1, benOk.json);

  console.log('\nReturn, resubmit, reject');
  const a3 = await api('secretary', 'POST', '/applications', person({ programId: String(dit.id), schoolYearId: String(year.id) }));
  const id3 = a3.data.id;
  for (const r of requiredDit) await setDoc('secretary', id3, r.id, 'submitted');
  await api('secretary', 'POST', `/applications/${id3}/submit`);
  check('returning needs a reason', (await api('reviewer', 'POST', `/applications/${id3}/return`, { reason: ' ' })).status === 422);
  const ret = await api('reviewer', 'POST', `/applications/${id3}/return`, { reason: 'Upload a clearer birth certificate.' });
  check('returned with the reason stored', ret.status === 200 && (await prisma.application.findUnique({ where: { id: BigInt(id3) } })).notes === 'Upload a clearer birth certificate.');
  check('a returned application can be edited and resubmitted', (await api('secretary', 'PUT', `/applications/${id3}`, person({ programId: String(dit.id), schoolYearId: String(year.id), email: `${M.toLowerCase()}-a3@example.test` }))).status === 200 && (await api('secretary', 'POST', `/applications/${id3}/submit`)).data?.status === 'submitted');
  const rj = await api('reviewer', 'POST', `/applications/${id3}/reject`, { reason: 'Does not meet the requirements.' });
  check('rejected, final: no student, no enrollment', rj.status === 200 && !(await prisma.application.findUnique({ where: { id: BigInt(id3) } })).studentId && (await api('reviewer', 'POST', `/applications/${id3}/approve`)).status === 409);
  check('a Director can view an application but not decide it (403)', (await api('director', 'GET', `/applications/${minimal.data.id}`)).status === 200 && (await api('director', 'POST', `/applications/${minimal.data.id}/review`)).status === 403);
  check('an Instructor cannot decide (403)', (await api('teacher', 'POST', `/applications/${minimal.data.id}/reject`, { reason: 'x' })).status === 403);

  console.log('\nTwo reviewers approve at once');
  const a4 = await api('secretary', 'POST', '/applications', person({ programId: String(dht.id), schoolYearId: String(year.id) }));
  const dhtReqs = await prisma.credentialRequirement.findMany({ where: { isActive: true, isRequired: true, OR: [{ programId: null }, { programId: dht.id }] } });
  for (const r of dhtReqs) { await setDoc('secretary', a4.data.id, r.id, 'submitted'); await setDoc('secretary', a4.data.id, r.id, 'verified'); }
  await api('secretary', 'POST', `/applications/${a4.data.id}/submit`);
  const both = await Promise.all([api('reviewer', 'POST', `/applications/${a4.data.id}/approve`), api('secretary', 'POST', `/applications/${a4.data.id}/approve`)]);
  const a4App = await prisma.application.findUnique({ where: { id: BigInt(a4.data.id) } });
  check('exactly one approval succeeds; one student, one enrollment', both.filter((r) => r.status === 200).length === 1 && both.filter((r) => r.status === 409).length === 1
    && (await prisma.student.count({ where: { email: a4App.email } })) === 1 && (await prisma.enrollment.count({ where: { studentId: a4App.studentId } })) === 1, both.map((r) => r.status));
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const apps = await prisma.application.findMany({ where: { programId: { in: created.programs } }, select: { id: true, studentId: true } });
    const students = (await prisma.student.findMany({ where: { OR: [{ programId: { in: created.programs } }, { id: { in: apps.map((a) => a.studentId).filter(Boolean) } }] }, select: { id: true } })).map((s) => s.id);
    await prisma.application.deleteMany({ where: { id: { in: apps.map((a) => a.id) } } });
    for (const a of apps) await rm(path.join(process.cwd(), '.data', 'uploads', 'applications', String(a.id)), { recursive: true, force: true });
    const enrollmentIds = (await prisma.enrollment.findMany({ where: { studentId: { in: students } }, select: { id: true } })).map((e) => e.id);
    await prisma.enrollmentStatusHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: students } } });
    await prisma.student.deleteMany({ where: { id: { in: students } } });
    await prisma.credentialRequirement.deleteMany({ where: { id: { in: created.requirements } } });
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
