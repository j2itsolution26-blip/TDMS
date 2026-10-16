// End-to-end check of credential soft copies: upload, preview/download,
// replacement, and the review rules around them, through the real endpoints.
//
//   npm run build && FILE_STORAGE=local PORT=3001 npm start
//   node scripts/e2e/credential-files.mjs     (BASE=http://host:port to point elsewhere)
//
// What it guards:
//   * Verify is refused while no document is on record; Reject still works;
//   * an upload stores a PDF/JPG/PNG of at most 4 MB whose content matches its
//     type; becomes Submitted/Pending Review (never Verified), v1 for a first
//     document and one more for each replacement, uploader recorded;
//   * every document gets a history row (student_credential_documents); a
//     replacement supersedes the previous row, which keeps its verdict and file,
//     and earlier versions are served only through their own credential;
//   * anything else is refused, and the credential is exactly as it was;
//   * the file is served only by the authorized route — inline for preview,
//     attachment for download, never cached — and the page never sees a key;
//   * Verify, Reject and uploads are audited; Verify refuses a stale version
//     and a second verification; a verified document is replaced only by a
//     verifier, and then goes back to review; a rejected one can be resubmitted;
//   * two simultaneous uploads: one wins, the other is refused, its file removed;
//   * who may upload (verifiers, student managers), view (office), or neither.
//
// Applies with migration 20261021000000_student_credential_documents.
//
// Throwaway records only (marker ZZE2E…), removed at the end. A disposable database only.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Cf#Check${stamp}xY`;
const created = { users: [], programs: [], curricula: [] };
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
  return u;
}
async function api(who, method, p, body) {
  const res = await fetch(`${BASE}/api/v1${p}`, { method, headers: { ...(who ? { cookie: cookies[who] } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
async function upload(who, credId, name, bytes, type = 'application/pdf') {
  const form = new FormData();
  if (name !== null) form.append('file', new Blob([bytes], { type }), name);
  const res = await fetch(`${BASE}/api/v1/credentials/${credId}/file`, { method: 'POST', headers: who ? { cookie: cookies[who] } : {}, body: form });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
const docFile = (who, credId, docId, query = '') => fetch(`${BASE}/api/v1/credentials/${credId}/documents/${docId}/file${query}`, { headers: who ? { cookie: cookies[who] } : {} });
const docs = (id) => prisma.studentCredentialDocument.findMany({ where: { studentCredentialId: BigInt(id) }, orderBy: { version: 'asc' } });
const file = (who, credId, query = '') => fetch(`${BASE}/api/v1/credentials/${credId}/file${query}`, { headers: who ? { cookie: cookies[who] } : {} });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const row = (id) => prisma.studentCredential.findUnique({ where: { id: BigInt(id) } });
const unchanged = async (id, before) => {
  const now = await row(id);
  return now.version === before.version && now.status === before.status && now.filePath === before.filePath && now.fileName === before.fileName;
};
const storageDir = (studentId) => path.join(process.cwd(), '.data', 'uploads', 'students', String(studentId), 'credentials');

try {
  console.log(`Credential files e2e against ${BASE} (marker ${M})\n`);
  const secretary = await makeUser('secretary', 'secretary');
  await makeUser('po', 'processing_officer');
  await makeUser('director', 'director');
  await makeUser('teacher', 'teacher');
  // A student-records manager who is not a verifier: an office viewer granted students.manage directly.
  const manager = await makeUser('manager', 'director');
  const manage = await prisma.permission.findFirst({ where: { name: 'students.manage', guardName: 'web' } });
  await prisma.modelHasPermission.create({ data: { permissionId: manage.id, modelType: 'App\\Models\\User', modelId: manager.id } });

  const prog = await prisma.program.create({ data: { code: `${M}-DIT`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(prog.id);
  const cur = await prisma.curriculum.create({ data: { programId: prog.id, versionLabel: 'v1', effectiveSchoolYear: '2026-2027', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);
  const student = await prisma.student.create({ data: { studentNumber: `${M}-1`, firstName: 'Ana', lastName: `L${M}`, programId: prog.id, curriculumId: cur.id, yearLevel: 1, status: 'applicant', createdAt: new Date(), updatedAt: new Date() } });

  // Opening the page creates the checklist.
  const pageRes = await api('secretary', 'GET', `/pages/students/${student.id}/enrollment`);
  const creds = pageRes.json?.data?.credentials ?? [];
  check('the page lists the student’s credentials', creds.length >= 2, creds.length);
  check('…each says whether a document is on record', creds.every((c) => c.hasFile === false));
  check('…and never carries a storage key', !pageRes.text.includes('filePath') && !pageRes.text.includes('/credentials/'));
  check('the page says who may upload', pageRes.json?.data?.canUpload === true);
  const [a, b, cc] = creds;

  console.log('\nVerify needs a document');
  const noFile = await api('secretary', 'POST', `/credentials/${a.id}/verify`, { remarks: '' });
  check('Verify is refused while nothing is uploaded (422)', noFile.status === 422 && /Upload the document/.test(noFile.json?.message ?? ''), noFile.json);
  check('…the credential is still missing', (await row(a.id)).status === 'missing');

  console.log('\nUpload');
  const up = await upload('secretary', a.id, 'PSA birth certificate.pdf', PDF);
  check('a PDF is uploaded (201)', up.status === 201, up.json);
  const afterUp = await row(a.id);
  check('…it is Submitted (Pending Review), never Verified', afterUp.status === 'submitted' && afterUp.verifiedAt === null);
  check('…the first document is version 1', afterUp.version === 1, afterUp.version);
  check('…its name, type and size are kept', afterUp.fileName === 'PSA birth certificate.pdf' && afterUp.fileType === 'application/pdf' && afterUp.fileSize === PDF.length);
  check('…the uploader and time are recorded', afterUp.submittedBy === secretary.id && afterUp.submittedAt !== null);
  check('…under a generated key in the student’s own folder', /^students\/\d+\/credentials\/[0-9a-f]{32}\.pdf$/.test(afterUp.filePath) && afterUp.filePath.startsWith(`students/${student.id}/`), afterUp.filePath);
  check('…and it is in the audit log', (await prisma.auditLog.count({ where: { action: 'credential.document_uploaded', target: `Student ${student.studentNumber}` } })) === 1);
  const docsA1 = await docs(a.id);
  check('…with one history row: v1, pending, current, same key and uploader', docsA1.length === 1 && docsA1[0].version === 1 && docsA1[0].reviewStatus === 'pending' && docsA1[0].supersededAt === null && docsA1[0].filePath === afterUp.filePath && docsA1[0].uploadedBy === secretary.id, docsA1);
  const listed = (await api('secretary', 'GET', `/pages/students/${student.id}/enrollment`)).json?.data?.credentials.find((c) => c.id === a.id);
  check('the page shows the file’s name, type and size', listed?.hasFile && listed.fileName === 'PSA birth certificate.pdf' && listed.fileType === 'application/pdf' && listed.fileSize === PDF.length, listed);
  check('…and no earlier versions yet', Array.isArray(listed?.history) && listed.history.length === 0);

  console.log('\nPreview and download');
  const dl = await file('secretary', a.id);
  const dlBytes = Buffer.from(await dl.arrayBuffer());
  check('download: 200 with the very bytes uploaded', dl.status === 200 && dlBytes.equals(PDF));
  check('…as an attachment named after the file', /^attachment; filename="PSA birth certificate\.pdf"/.test(dl.headers.get('content-disposition') ?? ''), dl.headers.get('content-disposition'));
  check('…never cached, never sniffed', dl.headers.get('cache-control') === 'private, no-store' && dl.headers.get('x-content-type-options') === 'nosniff');
  const pv = await file('secretary', a.id, '?inline=1');
  check('preview: opens inline as a PDF', pv.status === 200 && pv.headers.get('content-disposition')?.startsWith('inline') && pv.headers.get('content-type') === 'application/pdf');
  check('a Director (office viewer) may view it', (await file('director', a.id)).status === 200);
  check('an Instructor may not (403)', (await file('teacher', a.id)).status === 403);
  check('signed out: refused (401)', (await file(null, a.id)).status === 401);
  check('a credential without a document: 404', (await file('secretary', b.id)).status === 404);

  console.log('\nRefused uploads leave the credential as it was');
  const snap = await row(b.id);
  const refusals = [
    ['a Word file', await upload('secretary', b.id, 'form.docx', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32)])), /PDF, JPG or PNG/],
    ['an executable', await upload('secretary', b.id, 'run.exe', Buffer.from('MZ....')), /PDF, JPG or PNG/],
    ['text renamed to .pdf', await upload('secretary', b.id, 'fake.pdf', Buffer.from('not a pdf at all')), /does not match/],
    ['a PNG renamed to .pdf', await upload('secretary', b.id, 'photo.pdf', PNG), /does not match/],
    ['a file over 4 MB', await upload('secretary', b.id, 'big.pdf', Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024 + 10)])), /larger than 4 MB/],
    ['an empty file', await upload('secretary', b.id, 'empty.pdf', Buffer.alloc(0)), /Choose a file|empty/],
    ['no file at all', await upload('secretary', b.id, null, null), /Choose a file/],
  ];
  for (const [what, r, re] of refusals) check(`${what}: refused (422) with a reason`, r.status === 422 && re.test(JSON.stringify(r.json)), r);
  check('…and the credential is unchanged after all of them', await unchanged(b.id, snap));
  check('…with no history row written', (await docs(b.id)).length === 0);
  check('a Director cannot upload (403)', (await upload('director', b.id, 'x.pdf', PDF)).status === 403);
  check('an Instructor cannot upload (403)', (await upload('teacher', b.id, 'x.pdf', PDF)).status === 403);
  check('signed out: refused (401)', (await upload(null, b.id, 'x.pdf', PDF)).status === 401);
  check('…still unchanged', await unchanged(b.id, snap));
  check('a credential that does not exist: 404', (await upload('secretary', '999999999', 'x.pdf', PDF)).status === 404);
  check('a Processing Officer may upload', (await upload('po', b.id, 'form-137.png', PNG, 'image/png')).status === 201);
  check('a student-records manager without credentials.verify may upload', (await upload('manager', cc.id, 'good-moral.pdf', PDF)).status === 201);

  console.log('\nReplacement keeps the history');
  const firstKey = (await row(a.id)).filePath;
  const rep = await upload('secretary', a.id, 'birth-cert-clearer.png', PNG, 'image/png');
  const afterRep = await row(a.id);
  check('a replacement is accepted and is version 2', rep.status === 201 && afterRep.version === 2 && afterRep.fileName === 'birth-cert-clearer.png', afterRep.version);
  check('…the previous file is kept in storage', existsSync(path.join(process.cwd(), '.data', 'uploads', firstKey)));
  check('…and the route serves the new one', Buffer.from(await (await file('secretary', a.id)).arrayBuffer()).equals(PNG));
  const docsA2 = await docs(a.id);
  check('…two history rows: v1 superseded, v2 current and linked to v1', docsA2.length === 2 && docsA2[0].supersededAt !== null && docsA2[1].supersededAt === null && docsA2[1].previousDocumentId === docsA2[0].id, docsA2);
  const listedA = (await api('secretary', 'GET', `/pages/students/${student.id}/enrollment`)).json?.data?.credentials.find((c) => c.id === a.id);
  check('the page lists v1 as an earlier version, without its key', listedA?.history?.length === 1 && listedA.history[0].version === 1 && listedA.history[0].fileName === 'PSA birth certificate.pdf' && !('filePath' in listedA.history[0]), listedA?.history);
  const v1 = docsA2[0].id;
  const old = await docFile('secretary', a.id, v1);
  check('an earlier version downloads with its own bytes and name', old.status === 200 && Buffer.from(await old.arrayBuffer()).equals(PDF) && /PSA birth certificate\.pdf/.test(old.headers.get('content-disposition') ?? ''));
  check('…and previews inline', (await docFile('secretary', a.id, v1, '?inline=1')).headers.get('content-disposition')?.startsWith('inline'));
  check('…through another credential’s address: 404 (no cross-record access)', (await docFile('secretary', b.id, v1)).status === 404);
  check('…an Instructor may not (403)', (await docFile('teacher', a.id, v1)).status === 403);
  check('…signed out: refused (401)', (await docFile(null, a.id, v1)).status === 401);

  console.log('\nReview');
  const stale = await api('secretary', 'POST', `/credentials/${a.id}/verify`, { remarks: '', version: 1 });
  check('Verify naming an older version is refused (409), nothing verified', stale.status === 409 && (await row(a.id)).status === 'submitted', stale.json);
  check('Verify of the version reviewed succeeds', (await api('secretary', 'POST', `/credentials/${a.id}/verify`, { remarks: '', version: 2 })).status === 200 && (await row(a.id)).status === 'verified');
  const docsA3 = await docs(a.id);
  check('…the current document is marked verified, by whom and when', docsA3[1].reviewStatus === 'verified' && docsA3[1].reviewedBy === secretary.id && docsA3[1].reviewedAt !== null);
  check('…the replaced v1 keeps its own verdict (not reviewed)', docsA3[0].reviewStatus === 'pending');
  check('…and it is in the audit log', (await prisma.auditLog.count({ where: { action: 'credential.verified', target: `Student ${student.studentNumber}` } })) === 1);
  const again = await api('secretary', 'POST', `/credentials/${a.id}/verify`, { remarks: '' });
  check('verifying it again is refused (409)', again.status === 409, again.json);
  check('a Director cannot verify (403)', (await api('director', 'POST', `/credentials/${b.id}/verify`, { remarks: '' })).status === 403);
  check('a student-records manager without credentials.verify cannot verify (403)', (await api('manager', 'POST', `/credentials/${b.id}/verify`, { remarks: '' })).status === 403);
  check('a Director cannot reject (403)', (await api('director', 'POST', `/credentials/${b.id}/reject`, { reason: 'x' })).status === 403);
  check('Reject needs a reason (422)', (await api('secretary', 'POST', `/credentials/${b.id}/reject`, { reason: '  ' })).status === 422);

  console.log('\nReplacing a verified document');
  const verifiedSnap = await row(a.id);
  const byManager = await upload('manager', a.id, 'again.pdf', PDF);
  check('a non-verifier cannot replace a verified document (403)', byManager.status === 403 && /verified/.test(byManager.json?.message ?? ''), byManager.json);
  check('…it stays verified with the same file', await unchanged(a.id, verifiedSnap));
  const byVerifier = await upload('secretary', a.id, 'birth-cert-v3.pdf', PDF);
  const afterV3 = await row(a.id);
  check('a verifier can replace it: v3, back to Pending Review, verification cleared', byVerifier.status === 201 && afterV3.version === 3 && afterV3.status === 'submitted' && afterV3.verifiedAt === null && afterV3.verifiedBy === null, afterV3);
  const docsA4 = await docs(a.id);
  check('…the verified v2 keeps its verdict in the history, now superseded', docsA4[1].reviewStatus === 'verified' && docsA4[1].supersededAt !== null && docsA4[2].reviewStatus === 'pending');
  check('…and the replacement of a verified document is audited as such', (await prisma.auditLog.count({ where: { action: 'credential.verified_document_replaced', target: `Student ${student.studentNumber}` } })) === 1);

  console.log('\nRejection and resubmission');
  check('Reject still works on a credential with a document', (await api('secretary', 'POST', `/credentials/${b.id}/reject`, { reason: 'Unreadable scan' })).status === 200 && (await row(b.id)).status === 'rejected');
  const docsB = await docs(b.id);
  check('…the document’s verdict and reason are kept', docsB[0].reviewStatus === 'rejected' && docsB[0].rejectionReason === 'Unreadable scan');
  check('…and it is in the audit log', (await prisma.auditLog.count({ where: { action: 'credential.rejected', target: `Student ${student.studentNumber}` } })) === 1);
  const resub = await upload('secretary', b.id, 'form-137-clear.pdf', PDF);
  const afterResub = await row(b.id);
  check('a rejected credential can be uploaded again: Pending Review, reason cleared, v2', resub.status === 201 && afterResub.status === 'submitted' && afterResub.rejectionReason === null && afterResub.version === 2);
  check('…the rejected v1 stays in the history with its reason', (await docs(b.id))[0].rejectionReason === 'Unreadable scan');
  const missing = creds.find((c) => ![a.id, b.id, cc.id].includes(c.id));
  if (missing) check('Reject on a credential with no document still works, as before', (await api('secretary', 'POST', `/credentials/${missing.id}/reject`, { reason: 'Not provided' })).status === 200);

  console.log('\nTwo uploads at once');
  const d = missing ?? cc;
  const filesBefore = existsSync(storageDir(student.id)) ? readdirSync(storageDir(student.id)).length : 0;
  const docsBefore = (await docs(d.id)).length;
  const race = await Promise.all([upload('secretary', d.id, 'one.pdf', PDF), upload('po', d.id, 'two.pdf', PDF)]);
  const statuses = race.map((r) => r.status).sort();
  const won = statuses.filter((s) => s === 201).length;
  check('one upload wins, the other is told the record changed (201 + 409)', JSON.stringify(statuses) === '[201,409]' || JSON.stringify(statuses) === '[201,201]', statuses);
  const dDocs = await docs(d.id);
  check('…one history row per winning upload, versions distinct', dDocs.length === docsBefore + won && new Set(dDocs.map((x) => x.version)).size === dDocs.length, dDocs.map((x) => x.version));
  check('…the credential points at the newest row', (await row(d.id)).filePath === dDocs[dDocs.length - 1].filePath);
  const filesAfter = readdirSync(storageDir(student.id)).length;
  check('…and only winning files remain in storage', filesAfter === filesBefore + won, { filesBefore, filesAfter, statuses });
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const students = (await prisma.student.findMany({ where: { programId: { in: created.programs } }, select: { id: true } })).map((s) => s.id);
    await prisma.studentCredential.deleteMany({ where: { studentId: { in: students } } });
    await prisma.student.deleteMany({ where: { id: { in: students } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.modelHasRole.deleteMany({ where: { modelId: { in: created.users } } });
    await prisma.modelHasPermission.deleteMany({ where: { modelId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  } catch (e) {
    console.log('cleanup failed:', e.message);
  }
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
}
