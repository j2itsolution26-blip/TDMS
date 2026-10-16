// End-to-end check of curriculum mapping and class scheduling, through the
// real endpoints: required/elective mappings, classes only for subjects
// mapped to the section's program/year level/semester, room, instructor and
// section conflicts (consecutive classes allowed), inactive rooms,
// instructors and subjects refused, cancelling freeing a slot, the dry run,
// simultaneous bookings, rooms, and permissions.
//
//   npm run build && PORT=3001 npm start
//   npm run test:scheduling            (BASE=http://host:port to point elsewhere)
//
// Throwaway records only (marker ZZE2E), in a throwaway school year; removed
// at the end. Run it against a disposable database.
import './_guard.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Sc#Check${stamp}xY`;
const created = { users: [], programs: [], curricula: [], years: [], subjects: [], rooms: [] };
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const cookies = {};
const users = {};
async function makeUser(key, role, status = 'ACTIVE') {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: { name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12), emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.users.push(u.id);
  users[key] = u;
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  if (role !== 'teacher') {
    const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: u.email, password: PASSWORD, remember: false }) });
    const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('tdms_session='));
    if (!c) throw new Error(`login failed for ${key}`);
    cookies[key] = c.split(';')[0];
  }
  if (status !== 'ACTIVE') await prisma.user.update({ where: { id: u.id }, data: { status } });
  return u;
}
async function api(who, method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers: { cookie: cookies[who], ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data };
}
const meet = (dayOfWeek, startTime, endTime, roomId) => ({ dayOfWeek, startTime, endTime, ...(roomId ? { roomId: String(roomId) } : {}) });
const classBody = (section, subject, { semester = 1, instructor = null, room = null, schedules = [] } = {}) => ({
  sectionId: String(section.id), subjectId: String(subject.id), semester,
  instructorId: instructor ? String(instructor.id) : null, roomId: room ? String(room.id) : null, passingGrade: 75, schedules,
});
const create = (body, who = 'coord') => api(who, 'POST', '/classes', body);

try {
  console.log(`Class scheduling e2e against ${BASE} (marker ${M})\n`);
  await makeUser('coord', 'coordinator');
  await makeUser('director', 'director');
  await makeUser('secretary', 'secretary');
  const i1 = await makeUser('ivan', 'teacher');
  const i2 = await makeUser('jane', 'teacher');
  const iOff = await makeUser('gone', 'teacher', 'INACTIVE');

  const dit = await prisma.program.create({ data: { code: `${M}-DIT`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  const dht = await prisma.program.create({ data: { code: `${M}-DHT`, name: 'Diploma in Hospitality Technology', isActive: true, createdAt: new Date() } });
  created.programs.push(dit.id, dht.id);
  const cur = await prisma.curriculum.create({ data: { programId: dit.id, versionLabel: `${M} v1`, effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  const curH = await prisma.curriculum.create({ data: { programId: dht.id, versionLabel: `${M} h1`, effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id, curH.id);
  const subj = async (code, isActive = true) => { const s = await prisma.subject.create({ data: { code: `${M}-${code}`, title: `${code} title`, subjectType: 'lecture', defaultUnits: 3, isActive, createdAt: new Date() } }); created.subjects.push(s.id); return s; };
  const s1 = await subj('S1'); const s2 = await subj('S2'); const s3 = await subj('S3'); const s4 = await subj('S4'); const sOff = await subj('OFF');
  const year = await prisma.schoolYear.create({ data: { label: `2097-${String(stamp).slice(-4)}`, startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id);
  const sec = async (programId, yearLevel, name) => prisma.section.create({ data: { schoolYearId: year.id, programId, yearLevel, name } });
  const y1a = await sec(dit.id, 1, 'A'); const y1b = await sec(dit.id, 1, 'B'); const y2a = await sec(dit.id, 2, 'A'); const h1a = await sec(dht.id, 1, 'A');

  console.log('Rooms');
  const r1 = await api('coord', 'POST', '/rooms', { code: `${M}-lab1`.slice(0, 30), name: 'Computer Lab 1', type: 'LABORATORY', capacity: 30, isActive: true });
  check('a Coordinator adds a room; the code is stored upper-case', r1.status === 201 && r1.data.code === `${M}-LAB1`.slice(0, 30), r1.json);
  const room1 = await prisma.room.findUnique({ where: { code: r1.data.code } }); created.rooms.push(room1.id);
  const dupRoom = await api('coord', 'POST', '/rooms', { code: room1.code.toLowerCase(), name: 'Again', type: 'LECTURE' });
  check('a duplicate room code is refused', dupRoom.status === 422, dupRoom.json);
  const room2 = await prisma.room.create({ data: { code: `${M}-R2`.slice(0, 30), name: 'Room 2', type: 'LECTURE' } }); created.rooms.push(room2.id);
  const roomOff = await prisma.room.create({ data: { code: `${M}-OLD`.slice(0, 30), name: 'Closed room', type: 'LECTURE' } }); created.rooms.push(roomOff.id);
  const deact = await api('coord', 'PUT', `/rooms/${roomOff.id}`, { code: roomOff.code, name: roomOff.name, type: 'LECTURE', isActive: false });
  check('a room is deactivated, not deleted', deact.status === 200 && (await prisma.room.findUnique({ where: { id: roomOff.id } })).isActive === false);

  console.log('\nCurriculum mapping');
  const map = (curriculum, subject, yearLevel, semester, extra = {}) => api('coord', 'POST', `/curricula/${curriculum.id}/subjects`, { subjectId: String(subject.id), yearLevel, semester, units: 3, ...extra });
  const m1 = await map(cur, s1, 1, 1);
  const m2 = await map(cur, s2, 1, 1, { isRequired: false });
  await map(cur, s3, 2, 1); await map(cur, s4, 1, 1); await map(cur, sOff, 1, 1);
  const summer = await map(curH, s1, 1, 3);
  check('mapping by program, year level and semester; elective flag kept', [200, 201].includes(m1.status) && [200, 201].includes(m2.status) && (await prisma.curriculumSubject.findFirst({ where: { curriculumId: cur.id, subjectId: s2.id } })).isRequired === false, [m1.json, m2.json]);
  check('the Summer term (3) can be mapped', [200, 201].includes(summer.status), summer.json);
  const dupMap = await map(cur, s1, 1, 2);
  check('a subject is mapped once per curriculum', dupMap.status === 422);
  await prisma.subject.update({ where: { id: sOff.id }, data: { isActive: false } });

  console.log('\nScheduling rules');
  const c1 = await create(classBody(y1a, s1, { instructor: i1, room: room1, schedules: [meet(1, '08:00', '10:00')] }));
  check('a mapped subject is scheduled: Mon 8–10, Lab 1, Ivan', c1.status === 201, c1.json);
  const cls1 = await prisma.classOffering.findFirst({ where: { sectionId: y1a.id, subjectId: s1.id } });
  check('…and linked to its curriculum entry', cls1?.curriculumSubjectId !== null && cls1?.status === 'ACTIVE');
  const unmapped = await create(classBody(y1a, s3, { schedules: [meet(2, '08:00', '09:00')] }));
  check('a subject mapped to 2nd Year cannot be scheduled for a 1st Year section', unmapped.status === 422 && unmapped.json?.code === 'SUBJECT_NOT_MAPPED' && /Map it under Subjects/.test(unmapped.json.message), unmapped.json);
  const otherProgram = await create(classBody(h1a, s2, { schedules: [meet(2, '08:00', '09:00')] }));
  check('a DIT subject cannot be scheduled for a DHT section', otherProgram.status === 422 && otherProgram.json?.code === 'SUBJECT_NOT_MAPPED');
  const roomClash = await create(classBody(y1b, s2, { instructor: i2, room: room1, schedules: [meet(1, '09:00', '11:00')] }));
  check('room conflict: Lab 1 Mon 9–11 overlaps 8–10, refused with who has it', roomClash.status === 422 && roomClash.json?.code === 'SCHEDULE_CONFLICT' && /Room .* is already booked Monday 8:00 AM–10:00 AM by .*S1/.test(roomClash.json.message), roomClash.json);
  const consecutive = await create(classBody(y1b, s2, { instructor: i2, room: room1, schedules: [meet(1, '10:00', '12:00')] }));
  check('consecutive: Lab 1 Mon 10–12 right after 8–10 is allowed', consecutive.status === 201, consecutive.json);
  const instrClash = await create(classBody(y2a, s3, { instructor: i1, room: room2, schedules: [meet(1, '09:00', '09:30')] }));
  check('instructor conflict: Ivan already teaches Mon 8–10', instrClash.status === 422 && /already teaches/.test(instrClash.json?.message ?? ''), instrClash.json);
  const sectionClash = await create(classBody(y1a, s4, { instructor: i2, room: room2, schedules: [meet(1, '08:30', '09:00')] }));
  check('section conflict: 1st Year A already has S1 Mon 8–10', sectionClash.status === 422 && /This section already has/.test(sectionClash.json?.message ?? ''), sectionClash.json);
  const self = await create(classBody(y1a, s4, { schedules: [meet(2, '08:00', '10:00'), meet(2, '09:00', '11:00')] }));
  check('a class whose own meetings overlap is refused', self.status === 422 && /overlaps meeting 1/.test(self.json?.message ?? ''), self.json);
  const backwards = await create(classBody(y1a, s4, { schedules: [meet(3, '10:00', '09:00')] }));
  check('a meeting that ends before it starts is refused', backwards.status === 422, backwards.json);
  const offRoom = await create(classBody(y1a, s4, { room: roomOff, schedules: [meet(3, '08:00', '09:00')] }));
  check('an inactive room cannot be scheduled', offRoom.status === 422 && /inactive/.test(offRoom.json?.message ?? ''), offRoom.json);
  const offMeetingRoom = await create(classBody(y1a, s4, { schedules: [meet(3, '08:00', '09:00', roomOff.id)] }));
  check('…nor named on a single meeting', offMeetingRoom.status === 422);
  const offInstr = await create(classBody(y1a, s4, { instructor: iOff, schedules: [meet(3, '08:00', '09:00')] }));
  check('an inactive instructor cannot be assigned', offInstr.status === 422, offInstr.json);
  const offSubj = await create(classBody(y1a, sOff, { schedules: [meet(3, '08:00', '09:00')] }));
  check('an inactive subject cannot be scheduled even though it is mapped', offSubj.status === 422);
  const otherDay = await create(classBody(y1a, s4, { instructor: i1, room: room1, schedules: [meet(2, '08:00', '10:00')] }));
  check('the same room, instructor and time on another day is fine', otherDay.status === 201, otherDay.json);

  console.log('\nDry run, cancelling, editing');
  const dry = await api('coord', 'POST', '/classes/check', { sectionId: String(y2a.id), semester: 1, instructorId: String(i2.id), roomId: String(room1.id), schedules: [meet(1, '11:00', '12:30')] });
  check('the dry run lists the conflicts (room and instructor) without writing', dry.status === 200 && dry.data.conflicts.map((c) => c.kind).sort().join() === 'instructor,room' && (await prisma.classOffering.count({ where: { sectionId: y2a.id } })) === 0, dry.json);
  const dryClear = await api('coord', 'POST', '/classes/check', { sectionId: String(y2a.id), semester: 1, roomId: String(room1.id), schedules: [meet(1, '12:00', '13:00')] });
  check('…and an empty list when the slot is free', dryClear.data?.conflicts.length === 0);
  const cancel = await api('coord', 'PUT', `/classes/${cls1.id}`, { instructorId: String(i1.id), roomId: String(room1.id), passingGrade: 75, status: 'CANCELLED', schedules: [meet(1, '08:00', '10:00')] });
  check('cancelling a class', cancel.status === 200 && (await prisma.classOffering.findUnique({ where: { id: cls1.id } })).status === 'CANCELLED', cancel.json);
  const takeSlot = await create(classBody(y2a, s3, { instructor: i1, room: room1, schedules: [meet(1, '08:00', '10:00')] }));
  check('…frees its room, instructor and time for another class', takeSlot.status === 201, takeSlot.json);
  const reactivate = await api('coord', 'PUT', `/classes/${cls1.id}`, { instructorId: String(i1.id), roomId: String(room1.id), passingGrade: 75, status: 'ACTIVE', schedules: [meet(1, '08:00', '10:00')] });
  check('reactivating it now conflicts and is refused', reactivate.status === 422 && reactivate.json?.code === 'SCHEDULE_CONFLICT');
  const move = await api('coord', 'PUT', `/classes/${cls1.id}`, { instructorId: String(i1.id), roomId: String(room2.id), passingGrade: 75, status: 'ACTIVE', schedules: [meet(4, '13:00', '15:00')] });
  check('…moved to Thursday afternoon in Room 2, it is active again', move.status === 200 && (await prisma.classOffering.findUnique({ where: { id: cls1.id } })).status === 'ACTIVE', move.json);
  const editSelf = await api('coord', 'PUT', `/classes/${cls1.id}`, { instructorId: String(i1.id), roomId: String(room2.id), passingGrade: 80, status: 'ACTIVE', schedules: [meet(4, '13:00', '15:00')] });
  check('editing a class does not conflict with itself', editSelf.status === 200, editSelf.json);
  const inUse = await api('coord', 'DELETE', `/curricula/${cur.id}/subjects/${cls1.curriculumSubjectId}`);
  check('a mapping a class teaches cannot be removed (409, says what to do)', inUse.status === 409 && /Classes & Sections/.test(inUse.json?.message ?? ''), inUse.json);

  console.log('\nSimultaneous bookings');
  const sA = await subj('P1'); const sB = await subj('P2');
  await map(cur, sA, 2, 1); await map(cur, sB, 1, 1);
  const [ra, rb] = await Promise.all([
    create(classBody(y2a, sA, { room: room2, schedules: [meet(5, '08:00', '10:00')] })),
    create(classBody(y1b, sB, { room: room2, schedules: [meet(5, '09:00', '11:00')] })),
  ]);
  const fri = await prisma.classSchedule.count({ where: { dayOfWeek: 5, class: { schoolYearId: year.id }, OR: [{ roomId: room2.id }, { class: { roomId: room2.id } }] } });
  check('two bookings for one room at once: exactly one succeeds, the other is told why', [ra.status, rb.status].sort().join() === '201,422' && fri === 1, [ra.status, rb.status, fri]);

  console.log('\nPermissions');
  const dirCreate = await create(classBody(y1b, s4, { schedules: [meet(6, '08:00', '09:00')] }), 'director');
  const dirPage = await api('director', 'GET', `/pages/class-setup?year=${year.id}`);
  check('the Director sees Classes & Sections read-only, and cannot schedule (403)', dirCreate.status === 403 && dirPage.status === 200 && dirPage.data.canManage === false && dirPage.data.setup.classes.length > 0, [dirCreate.status, dirPage.status, dirPage.data?.canManage]);
  const coordPage = await api('coord', 'GET', `/pages/class-setup?year=${year.id}`);
  check('the Coordinator can manage; the page data carries rooms, mappings and each class’s room and status', coordPage.data?.canManage === true && coordPage.data.setup.rooms.some((r) => r.code === room1.code) && coordPage.data.setup.mappings.some((m) => m.subjectId === String(s2.id) && m.isRequired === false) && coordPage.data.setup.classes.some((c) => c.status === 'ACTIVE' && c.roomCode === room2.code));
  for (const who of ['secretary']) {
    const a = await create(classBody(y1b, s4, { schedules: [meet(6, '08:00', '09:00')] }), who);
    const b = await api(who, 'POST', '/rooms', { code: 'X1', name: 'X', type: 'LECTURE' });
    const c = await api(who, 'POST', '/classes/check', { sectionId: String(y1b.id), semester: 1, schedules: [] });
    const d = await api(who, 'GET', `/pages/class-setup?year=${year.id}`);
    check(`${who}: cannot schedule, add rooms, dry-run or open Classes & Sections (403)`, [a.status, b.status, c.status, d.status].every((s) => s === 403), [a.status, b.status, c.status, d.status]);
  }
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const classIds = (await prisma.classOffering.findMany({ where: { schoolYearId: { in: created.years } }, select: { id: true } })).map((c) => c.id);
    await prisma.classSchedule.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.classOffering.deleteMany({ where: { id: { in: classIds } } });
    await prisma.section.deleteMany({ where: { schoolYearId: { in: created.years } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    await prisma.curriculumSubject.deleteMany({ where: { curriculumId: { in: created.curricula } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.subject.deleteMany({ where: { id: { in: created.subjects } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.room.deleteMany({ where: { id: { in: created.rooms } } });
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
