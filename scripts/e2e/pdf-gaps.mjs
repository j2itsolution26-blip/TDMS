// End-to-end check of the features added from the function and role document:
// staff Personal Data Sheets, Assessment Center inventory and purchases,
// Director announcements and the Director/Admin monitoring panel.
//
//   npm run build && PORT=3001 npm start
//   npm run test:pdf-gaps            (BASE=http://host:port to point elsewhere)
//
// Throwaway accounts and records only, all carrying the marker ZZE2E, removed
// at the end with the notifications they caused. Audit rows are kept. Run it
// against a disposable database.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Gaps#Check${stamp}xY`;
const ADMIN_CODE = '602418';
const started = new Date();
const created = { users: [], students: [], programs: [], curricula: [], years: [], sections: [], classes: [], subjects: [] };
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const jars = {};
function jar() {
  const store = new Map();
  return {
    header: () => [...store].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const pair = raw.split(';')[0];
        const i = pair.indexOf('=');
        const name = pair.slice(0, i);
        const value = pair.slice(i + 1);
        if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) store.delete(name); else store.set(name, value);
      }
    },
  };
}
async function api(who, method, path, body) {
  const j = jars[who] ?? (jars[who] = jar());
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method, redirect: 'manual',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(j.header() ? { cookie: j.header() } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  j.absorb(res);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data, text };
}
const page = (who, path) => api(who, 'GET', `/pages${path}`);

async function makeUser(key, role) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: {
    name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12),
    emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.users.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  if (role === 'admin') {
    await prisma.adminAccessCode.create({ data: { adminUserId: u.id, codeHash: await bcrypt.hash(ADMIN_CODE, 12), expiresAt: new Date(Date.now() + 600e3), maxAttempts: 5 } });
  }
  const login = await api(key, 'POST', '/auth/login', { identifier: u.email, password: PASSWORD, remember: false });
  if (role === 'admin') await api(key, 'POST', '/auth/admin-access-code', { code: ADMIN_CODE });
  if (!jars[key].header().includes('tdms_session=')) throw new Error(`login failed for ${key}: ${login.status} ${login.text.slice(0, 200)}`);
  return u;
}

const pdsBody = (tag) => ({ employeeId: `EMP-${tag}-${M}`, personal: { dateOfBirth: '1988-03-01', placeOfBirth: 'Dagupan', sex: 'Female', civilStatus: 'Single', citizenship: 'Filipino', contactNumber: '09170000000', address: 'Dagupan City' }, education: [{ level: 'College', school: 'State University', degree: 'BS Education', yearGraduated: '2010' }] });

try {
  console.log(`PDF gaps e2e against ${BASE} (marker ${M})\n`);
  const director = await makeUser('director', 'director');
  const admin = await makeUser('admin', 'admin');
  const manager = await makeUser('manager', 'assessment_center_manager');
  const secretary = await makeUser('secretary', 'secretary');
  const coordinator = await makeUser('coordinator', 'coordinator');
  const teacher = await makeUser('teacher', 'teacher');
  const otherTeacher = await makeUser('teacher2', 'teacher');
  const studentUser = await makeUser('student', 'student');
  const otherStudentUser = await makeUser('student2', 'student');

  // A course, a class taught by `teacher`, and two students in different courses.
  const prog = await prisma.program.create({ data: { code: `${M}-DIT`, name: `${M} Diploma in IT`, isActive: true, createdAt: new Date() } });
  const prog2 = await prisma.program.create({ data: { code: `${M}-DHT`, name: `${M} Diploma in Hospitality`, isActive: true, createdAt: new Date() } });
  created.programs.push(prog.id, prog2.id);
  const cur = await prisma.curriculum.create({ data: { programId: prog.id, versionLabel: 'E2E', effectiveSchoolYear: '2097-2098', isActive: true } });
  const cur2 = await prisma.curriculum.create({ data: { programId: prog2.id, versionLabel: 'E2E', effectiveSchoolYear: '2097-2098', isActive: true } });
  created.curricula.push(cur.id, cur2.id);
  const s1 = await prisma.student.create({ data: { userId: studentUser.id, studentNumber: `${M}-1`, firstName: 'Ana', lastName: `Abad${M}`, programId: prog.id, curriculumId: cur.id, status: 'active' } });
  const s2 = await prisma.student.create({ data: { userId: otherStudentUser.id, studentNumber: `${M}-2`, firstName: 'Ben', lastName: `Bautista${M}`, programId: prog2.id, curriculumId: cur2.id, status: 'active' } });
  const s3 = await prisma.student.create({ data: { studentNumber: `${M}-3`, firstName: 'Carla', lastName: `Cruz${M}`, programId: prog.id, curriculumId: cur.id, status: 'dropped' } });
  created.students.push(s1.id, s2.id, s3.id);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${String(stamp).slice(-4)}`.slice(0, 20), startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id);
  const section = await prisma.section.create({ data: { schoolYearId: year.id, programId: prog.id, yearLevel: 1, name: `${M}-A` } });
  created.sections.push(section.id);
  const subject = await prisma.subject.create({ data: { code: `${M}-SUB`, title: 'E2E Subject', subjectType: 'lecture', defaultUnits: 3, isActive: true } });
  created.subjects.push(subject.id);
  const klass = await prisma.classOffering.create({ data: { schoolYearId: year.id, semester: 1, sectionId: section.id, subjectId: subject.id, instructorId: teacher.id } });
  created.classes.push(klass.id);

  console.log('\nStaff Personal Data Sheets');
  check('the Manager saves their own PDS', (await api('manager', 'PUT', '/instructor-profile', pdsBody('MGR'))).status === 200);
  check('the Secretary saves their own PDS', (await api('secretary', 'PUT', '/instructor-profile', pdsBody('SEC'))).status === 200);
  check('the Coordinator saves their own PDS', (await api('coordinator', 'PUT', '/instructor-profile', pdsBody('CRD'))).status === 200);
  check('the Instructor still saves theirs', (await api('teacher', 'PUT', '/instructor-profile', pdsBody('TCH'))).status === 200);
  check('a student cannot keep a PDS', (await api('student', 'PUT', '/instructor-profile', pdsBody('STU'))).status === 403);
  check('the Director does not keep one through this screen', (await api('director', 'PUT', '/instructor-profile', pdsBody('DIR'))).status === 403);
  const own = await page('manager', '/teaching/pds');
  check('the Manager reopens their PDS', own.status === 200 && own.text.includes(`EMP-MGR-${M}`), own.status);

  const dirList = await page('director', '/instructors');
  const dirNames = dirList.data?.rows?.map((r) => r.name) ?? [];
  check('the Director sees every staff PDS', ['manager', 'secretary', 'coordinator', 'teacher'].every((k) => dirNames.includes(`${M} ${k}`)), dirNames.filter((n) => n.includes(M)));
  const view = await page('director', `/instructors/${manager.id}`);
  check("the Director opens the Manager's PDS", view.status === 200 && view.text.includes(`EMP-MGR-${M}`));
  const adminList = await page('admin', '/instructors');
  const adminNames = adminList.data?.rows?.map((r) => r.name).filter((n) => n.includes(M)) ?? [];
  check("the Admin sees the Secretary's PDS only", adminNames.length === 1 && adminNames[0] === `${M} secretary`, adminNames);
  check("the Admin opens the Secretary's PDS", (await page('admin', `/instructors/${secretary.id}`)).text.includes(`EMP-SEC-${M}`));
  check("the Admin cannot open the Manager's PDS", (await page('admin', `/instructors/${manager.id}`)).status === 404);
  check('a Coordinator cannot open staff profiles', (await page('coordinator', '/instructors')).status === 403);
  check("an Instructor cannot open another's PDS", (await page('teacher', `/instructors/${otherTeacher.id}`)).status === 403);
  const viewed = await prisma.auditLog.count({ where: { createdAt: { gte: started }, action: 'INSTRUCTOR_PROFILE_VIEWED', target: { contains: M } } });
  check('each PDS read is audited', viewed >= 2, viewed);
  const mgrShell = await page('manager', '/app-shell');
  check('the Manager sidebar has My PDS', mgrShell.data?.items?.some((i) => i.href === '/teaching/pds'));

  console.log('\nInventory');
  const item = { category: 'CSS_NC2', name: `${M} Crimping tool`, unit: 'pcs', quantityGood: 10, quantityDefective: 2, remarks: 'Two with worn jaws' };
  const created1 = await api('manager', 'POST', '/assessment/inventory', item);
  check('the Manager adds an inventory item', created1.status === 201 && created1.data?.onHand === 12, created1.json);
  check('the same item twice in a category is refused', (await api('manager', 'POST', '/assessment/inventory', item)).json?.errors?.name !== undefined);
  check('negative quantities are refused', (await api('manager', 'POST', '/assessment/inventory', { ...item, name: `${M} x`, quantityGood: -1 })).status === 422);
  check('an unknown category is refused', (await api('manager', 'POST', '/assessment/inventory', { ...item, name: `${M} y`, category: 'WELDING' })).status === 422);
  const upd = await api('manager', 'PUT', `/assessment/inventory/${created1.data.id}`, { ...item, quantityGood: 11, quantityDefective: 1 });
  check('the counts are updated', upd.status === 200 && upd.data?.quantityGood === 11 && upd.data?.onHand === 12, upd.json);
  check('the Director can read the inventory', (await api('director', 'GET', '/assessment/inventory')).status === 200);
  check('the Director cannot change it', (await api('director', 'POST', '/assessment/inventory', { ...item, name: `${M} z` })).status === 403);
  check('an Instructor cannot see it', (await api('teacher', 'GET', '/assessment/inventory')).status === 403);
  check('a Coordinator cannot see it', (await api('coordinator', 'GET', '/assessment/inventory')).status === 403);
  const tmp = await api('manager', 'POST', '/assessment/inventory', { ...item, name: `${M} Spare`, category: 'OFFICE_SUPPLY' });
  check('an item is removed', (await api('manager', 'DELETE', `/assessment/inventory/${tmp.data.id}`)).status === 200);
  const audit = await prisma.auditLog.findFirst({ where: { createdAt: { gte: started }, action: 'INVENTORY_ITEM_UPDATED' }, orderBy: { id: 'desc' } });
  check('the update is audited with before and after', audit?.details?.before?.good === 10 && audit?.details?.after?.good === 11, audit?.details);

  console.log('\nPurchases');
  const p = await api('manager', 'POST', '/assessment/purchases', { category: 'COOKERY_NC2', itemName: `${M} Chef knives`, quantity: 6, unit: 'pcs' });
  check('the Manager records a purchase, starting as Requested', p.status === 201 && p.data?.status === 'REQUESTED', p.json);
  check('a zero quantity is refused', (await api('manager', 'POST', '/assessment/purchases', { category: 'COOKERY_NC2', itemName: 'x', quantity: 0 })).status === 422);
  check('the status moves to Ordered', (await api('manager', 'POST', `/assessment/purchases/${p.data.id}/status`, { status: 'ORDERED' })).data?.status === 'ORDERED');
  check('the same status again is refused', (await api('manager', 'POST', `/assessment/purchases/${p.data.id}/status`, { status: 'ORDERED' })).status === 422);
  check('an unknown status is refused', (await api('manager', 'POST', `/assessment/purchases/${p.data.id}/status`, { status: 'PAID' })).status === 422);
  check('the status moves to Delivered', (await api('manager', 'POST', `/assessment/purchases/${p.data.id}/status`, { status: 'DELIVERED', remarks: 'Complete' })).data?.status === 'DELIVERED');
  check('a delivered purchase is final', (await api('manager', 'POST', `/assessment/purchases/${p.data.id}/status`, { status: 'CANCELLED' })).status === 409);
  check('a delivered purchase cannot be edited', (await api('manager', 'PUT', `/assessment/purchases/${p.data.id}`, { category: 'COOKERY_NC2', itemName: 'x', quantity: 1 })).status === 409);
  const list = await api('director', 'GET', '/assessment/purchases?status=DELIVERED');
  check('the Director filters purchases by status', list.status === 200 && list.data?.purchases?.some((x) => x.id === p.data.id));
  check('the Director cannot change a purchase', (await api('director', 'POST', '/assessment/purchases', { category: 'COOKERY_NC2', itemName: 'x', quantity: 1 })).status === 403);
  const changes = await prisma.auditLog.count({ where: { createdAt: { gte: started }, action: 'PURCHASE_STATUS_CHANGED', target: { contains: M } } });
  check('each status change is audited', changes === 2, changes);

  console.log('\nAnnouncements');
  check('an Instructor cannot publish', (await api('teacher', 'POST', '/announcements', { title: 'x', body: 'x', audience: 'BOTH' })).status === 403);
  check('the Admin cannot publish', (await api('admin', 'POST', '/announcements', { title: 'x', body: 'x', audience: 'BOTH' })).status === 403);
  const toCourse = await api('director', 'POST', '/announcements', { title: `${M} DIT students`, body: 'Bring your IDs.', audience: 'STUDENTS', programId: prog.id.toString() });
  check('the Director publishes to one course', toCourse.status === 201 && toCourse.data?.recipientCount >= 1, toCourse.json);
  const toTeachers = await api('director', 'POST', '/announcements', { title: `${M} instructors of DIT`, body: 'Submit TOS.', audience: 'INSTRUCTORS', programId: prog.id.toString() });
  check('the Director publishes to the instructors of a course', toTeachers.status === 201 && toTeachers.data?.recipientCount === 1, toTeachers.json);
  const both = await api('director', 'POST', '/announcements', { title: `${M} everyone`, body: 'Foundation day.', audience: 'BOTH' });
  check('the Director publishes to instructors and students', both.status === 201);
  const n = (u) => prisma.notification.findMany({ where: { userId: u.id, type: 'announcement' }, select: { title: true } });
  const s1n = (await n(studentUser)).map((x) => x.title);
  const s2n = (await n(otherStudentUser)).map((x) => x.title);
  const t1n = (await n(teacher)).map((x) => x.title);
  const t2n = (await n(otherTeacher)).map((x) => x.title);
  check('a DIT student is notified of the DIT announcement', s1n.some((t) => t.includes(`${M} DIT students`)));
  check('a student of another course is not', !s2n.some((t) => t.includes(`${M} DIT students`)) && s2n.some((t) => t.includes(`${M} everyone`)), s2n);
  check('the DIT instructor is notified; another instructor is not', t1n.some((t) => t.includes(`${M} instructors of DIT`)) && !t2n.some((t) => t.includes(`${M} instructors of DIT`)));
  check('students are not sent instructor announcements', !s1n.some((t) => t.includes('instructors of DIT')));
  const mine = await api('student2', 'GET', '/announcements');
  check('a student reads only what is addressed to them', mine.data?.some((a) => a.title === `${M} everyone`) && !mine.data?.some((a) => a.title === `${M} DIT students`), mine.data?.map((a) => a.title));
  check('the student dashboard shows announcements', (await page('student', '/dashboard')).data?.announcements?.some((a) => a.title.includes(M)));
  check('the announcement can be withdrawn', (await api('director', 'POST', `/announcements/${both.data.id}/withdraw`)).status === 200);
  check('a withdrawn announcement disappears for readers', !(await api('student2', 'GET', '/announcements')).data?.some((a) => a.title === `${M} everyone`));
  check('withdrawing twice is refused', (await api('director', 'POST', `/announcements/${both.data.id}/withdraw`)).status === 409);
  check('publishing is audited', (await prisma.auditLog.count({ where: { createdAt: { gte: started }, action: 'ANNOUNCEMENT_PUBLISHED', target: { contains: M } } })) === 3);

  console.log('\nMonitoring');
  const dDash = await page('director', '/dashboard');
  const m = dDash.data?.monitoring;
  check('the Director dashboard has the monitoring panel', m && typeof m.staff.active === 'number' && typeof m.students.dropped === 'number', dDash.data?.kind);
  check('dropped students are counted', (m?.students?.dropped ?? 0) >= 1);
  check('courses are listed with active and dropped students', m?.perCourse?.some((c) => c.code === `${M}-DIT` && c.active === 1 && c.dropped === 1), m?.perCourse?.filter((c) => c.code.includes(M)));
  check('the inventory is summarised', (m?.supplies?.inventory?.onHand ?? 0) >= 12);
  check('the monitoring has no class records', !JSON.stringify(m ?? {}).includes('percent') && !JSON.stringify(m ?? {}).includes('gradeStatus'));
  const aDash = await page('admin', '/dashboard');
  check('the Admin dashboard has the same monitoring panel', aDash.data?.kind === 'admin' && aDash.data?.monitoring?.perCourse !== undefined, aDash.data?.kind);
  const cDash = await page('coordinator', '/dashboard');
  check('the Coordinator dashboard does not', cDash.data?.monitoring === null, cDash.data?.kind);

  console.log('\nTraining calendar for all staff');
  check('the Secretary reads the training calendar', (await api('secretary', 'GET', '/assessment/activities?from=2026-10-01&to=2026-10-31')).status === 200);
  check('the Secretary cannot change it', (await api('secretary', 'POST', '/assessment/activities', { title: 'x', activityType: 'TRAINING', startsAt: '2026-10-26T00:00:00Z', endsAt: '2026-10-26T04:00:00Z' })).status === 403);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    await prisma.announcement.deleteMany({ where: { title: { contains: M } } });
    await prisma.inventoryItem.deleteMany({ where: { name: { contains: M } } });
    await prisma.purchaseRequest.deleteMany({ where: { itemName: { contains: M } } });
    await prisma.classOffering.deleteMany({ where: { id: { in: created.classes } } });
    await prisma.section.deleteMany({ where: { id: { in: created.sections } } });
    await prisma.subject.deleteMany({ where: { id: { in: created.subjects } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    const n = await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: created.users } }, { createdAt: { gte: started }, title: { contains: M } }] } });
    console.log(`\nremoved ${n.count} notification(s)`);
    await prisma.student.deleteMany({ where: { id: { in: created.students } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.instructorProfile.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.adminAccessCode.deleteMany({ where: { adminUserId: { in: created.users } } });
    await prisma.adminLoginChallenge.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
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
