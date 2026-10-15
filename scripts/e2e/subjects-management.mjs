// End-to-end check of Subjects Management, through the real endpoints and
// page loaders: creating DIT and DHT subjects in their curriculum term (one
// transaction), hours by type, several prerequisites, mapping one subject in
// two curricula without duplicating it, changing a mapping, the history lock,
// laboratory rooms and room seats, a student's My Classes, and permissions.
//
//   npm run build && PORT=3001 npm start
//   npm run test:subjects               (BASE=http://host:port to point elsewhere)
//
// Throwaway records only (marker ZZE2E); removed at the end. Run it against
// a disposable database.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Sb#Check${stamp}xY`;
const created = { users: [], programs: [], curricula: [], years: [], rooms: [], students: [] };
let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}`); return; }
  failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const cookies = {};
async function makeUser(key, role, login = true) {
  const r = await prisma.role.findFirst({ where: { name: role, guardName: 'web' } });
  const u = await prisma.user.create({ data: { name: `${M} ${key}`, email: `${M.toLowerCase()}-${key}@example.test`, password: await bcrypt.hash(PASSWORD, 12), emailVerifiedAt: new Date(), status: 'ACTIVE', isActive: true, mustChangePassword: false, createdAt: new Date() } });
  created.users.push(u.id);
  await prisma.modelHasRole.create({ data: { roleId: r.id, modelType: 'App\\Models\\User', modelId: u.id } });
  if (login) {
    const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: u.email, password: PASSWORD, remember: false }) });
    const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('tdms_session='));
    if (!c) throw new Error(`login failed for ${key}`);
    cookies[key] = c.split(';')[0];
  }
  return u;
}
async function api(who, method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers: { cookie: cookies[who], ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, data: json?.data };
}
const page = async (who, path) => (await api(who, 'GET', `/pages${path}`)).data;
const subjectBody = (code, extra = {}) => ({ code, title: `${code} title`, subjectType: 'lecture', defaultUnits: 3, isActive: true, description: null, remarks: null, ...extra });

try {
  console.log(`Subjects Management e2e against ${BASE} (marker ${M})\n`);
  await makeUser('coord', 'coordinator');
  await makeUser('director', 'director');
  await makeUser('secretary', 'secretary');
  const teacher = await makeUser('teacher', 'teacher');

  const dit = await prisma.program.create({ data: { code: `${M}-DIT`, name: 'Diploma in Information Technology', isActive: true, createdAt: new Date() } });
  const dht = await prisma.program.create({ data: { code: `${M}-DHT`, name: 'Diploma in Hospitality Technology', isActive: true, createdAt: new Date() } });
  const bare = await prisma.program.create({ data: { code: `${M}-NOC`, name: 'No curriculum yet', isActive: true, createdAt: new Date() } });
  created.programs.push(dit.id, dht.id, bare.id);
  const curDit = await prisma.curriculum.create({ data: { programId: dit.id, versionLabel: `${M} DIT v1`, effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  const curDht = await prisma.curriculum.create({ data: { programId: dht.id, versionLabel: `${M} DHT v1`, effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(curDit.id, curDht.id);
  const place = (programId, yearLevel, semester, extra = {}) => ({ placement: { programId: String(programId), yearLevel, semester, isRequired: true, prerequisiteSubjectIds: [], ...extra } });

  console.log('Creating subjects in their curriculum term');
  const c1 = await api('coord', 'POST', '/subjects', { ...subjectBody(`${M}-PROG1`, { subjectType: 'laboratory', lectureHours: 2, labHours: 3, recommendedClassSize: 25 }), ...place(dit.id, 1, 1) });
  const prog1 = await prisma.subject.findUnique({ where: { code: `${M}-PROG1` } });
  check('a DIT laboratory subject is created and placed in 1st Year · 1st Semester', c1.status === 201 && (await prisma.curriculumSubject.count({ where: { curriculumId: curDit.id, subjectId: prog1?.id, yearLevel: 1, semester: 1 } })) === 1, c1.json);
  check('…lecture hours are dropped for a laboratory subject; lab hours and class size kept', prog1?.lectureHours === null && Number(prog1?.labHours) === 3 && prog1?.recommendedClassSize === 25);
  const c2 = await api('coord', 'POST', '/subjects', { ...subjectBody(`${M}-MATH1`, { subjectType: 'lecture_laboratory', lectureHours: 2, labHours: 1 }), ...place(dit.id, 1, 1, { isRequired: false }) });
  const math1 = await prisma.subject.findUnique({ where: { code: `${M}-MATH1` } });
  check('a Lecture and Laboratory subject keeps both hours, placed as an elective', c2.status === 201 && Number(math1?.lectureHours) === 2 && Number(math1?.labHours) === 1 && (await prisma.curriculumSubject.findFirst({ where: { subjectId: math1?.id } }))?.isRequired === false);
  const c3 = await api('coord', 'POST', '/subjects', { ...subjectBody(`${M}-PROG2`), ...place(dit.id, 1, 2, { prerequisiteSubjectIds: [String(prog1.id), String(math1.id)] }) });
  const prog2 = await prisma.subject.findUnique({ where: { code: `${M}-PROG2` } });
  const prog2Entry = await prisma.curriculumSubject.findFirst({ where: { subjectId: prog2?.id }, include: { prerequisites: true } });
  check('several prerequisites are recorded (PROG1 and MATH1 for PROG2)', c3.status === 201 && prog2Entry?.prerequisites.length === 2, c3.json);
  const hrm = await api('director', 'POST', '/subjects', { ...subjectBody(`${M}-HRM1`), ...place(dht.id, 1, 1) });
  check('a DHT subject is created by the Director (who manages subjects) in DHT 1st Year', hrm.status === 201 && (await prisma.curriculumSubject.count({ where: { curriculumId: curDht.id } })) === 1, hrm.json);

  console.log('\nRefusals leave nothing half-saved');
  const before = await prisma.subject.count();
  const noPlace = await api('coord', 'POST', '/subjects', subjectBody(`${M}-X1`));
  check('a new subject needs its program, year level and semester', noPlace.status === 422);
  const noCur = await api('coord', 'POST', '/subjects', { ...subjectBody(`${M}-X2`), ...place(bare.id, 1, 1) });
  check('a program with no curriculum is refused with what to do', noCur.status === 422 && /no active curriculum/.test(noCur.json?.message ?? ''), noCur.json);
  const badPrereq = await api('coord', 'POST', '/subjects', { ...subjectBody(`${M}-X3`), ...place(dht.id, 1, 2, { prerequisiteSubjectIds: [String(prog1.id)] }) });
  check('a prerequisite from another program’s curriculum is refused', badPrereq.status === 422 && /already in this curriculum/.test(JSON.stringify(badPrereq.json)), badPrereq.json);
  const dupCode = await api('coord', 'POST', '/subjects', { ...subjectBody(`${M}-PROG1`), ...place(dit.id, 2, 1) });
  check('a duplicate subject code is refused', dupCode.status === 422 && /already in use/.test(JSON.stringify(dupCode.json)));
  const badHours = await api('coord', 'POST', '/subjects', { ...subjectBody(`${M}-X4`, { lectureHours: -1 }), ...place(dit.id, 1, 1) });
  check('negative hours are refused', badHours.status === 422);
  check('…and none of those refusals created a subject (all or nothing)', (await prisma.subject.count()) === before);

  console.log('\nOne subject, two curricula; changing a mapping');
  const reuse = await api('coord', 'POST', `/curricula/${curDht.id}/subjects`, { subjectId: String(math1.id), yearLevel: 2, semester: 1, units: 2, isRequired: true });
  check('MATH1 is mapped into DHT too — still one subject record', [200, 201].includes(reuse.status) && (await prisma.subject.count({ where: { code: `${M}-MATH1` } })) === 1 && (await prisma.curriculumSubject.count({ where: { subjectId: math1.id } })) === 2, reuse.json);
  const dupMap = await api('coord', 'POST', `/curricula/${curDit.id}/subjects`, { subjectId: String(math1.id), yearLevel: 2, semester: 2, units: 2 });
  check('a subject is mapped once per curriculum', dupMap.status === 422);
  const editMap = await api('coord', 'PUT', `/curricula/${curDit.id}/subjects/${prog2Entry.id}`, { units: 4, isRequired: false, prerequisiteSubjectIds: [String(prog1.id)] });
  const after = await prisma.curriculumSubject.findUnique({ where: { id: prog2Entry.id }, include: { prerequisites: true } });
  check('a mapping’s units, required flag and prerequisites change', editMap.status === 200 && Number(after.units) === 4 && after.isRequired === false && after.prerequisites.length === 1 && after.prerequisiteSubjectId === prog1.id, editMap.json);
  const selfPre = await api('coord', 'PUT', `/curricula/${curDit.id}/subjects/${prog2Entry.id}`, { units: 4, isRequired: true, prerequisiteSubjectIds: [String(prog2.id)] });
  check('a subject cannot be its own prerequisite', selfPre.status === 422);

  console.log('\nThe Subjects page data');
  const pg = await page('coord', `/subjects?search=${M}-P`);
  const ditMap = pg?.map.find((p) => p.id === String(dit.id));
  const y1s1 = ditMap?.curriculum.entries.filter((e) => e.yearLevel === 1 && e.semester === 1).map((e) => e.subject.code).sort();
  check('the map: DIT 1st Year 1st Semester has MATH1 and PROG1; 2nd Semester PROG2', JSON.stringify(y1s1) === JSON.stringify([`${M}-MATH1`, `${M}-PROG1`]) && ditMap.curriculum.entries.some((e) => e.semester === 2 && e.subject.code === `${M}-PROG2`), y1s1);
  check('…with hours, type and prerequisites', ditMap?.curriculum.entries.find((e) => e.subject.code === `${M}-PROG2`)?.prerequisites.map((p) => p.code).join() === `${M}-PROG1` && ditMap.curriculum.entries.find((e) => e.subject.code === `${M}-PROG1`)?.subject.labHours === 3);
  check('the catalogue search finds PROG1 and PROG2 only, with where each is used', pg?.rows.map((r) => r.code).sort().join() === `${M}-PROG1,${M}-PROG2` && pg.rows[0].usage.length === 1);

  console.log('\nEditing and the history lock');
  const edit = await api('coord', 'PUT', `/subjects/${math1.id}`, subjectBody(`${M}-MATH1`, { title: 'Discrete Mathematics', subjectType: 'lecture', lectureHours: 3, labHours: 2, remarks: 'Core' }));
  const m1 = await prisma.subject.findUnique({ where: { id: math1.id } });
  check('editing: retitled, now a lecture subject — its laboratory hours are dropped', edit.status === 200 && m1.title === 'Discrete Mathematics' && Number(m1.lectureHours) === 3 && m1.labHours === null && m1.remarks === 'Core', edit.json);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${String(stamp).slice(-4)}`, startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id);
  const secA = await prisma.section.create({ data: { schoolYearId: year.id, programId: dit.id, yearLevel: 1, name: 'A' } });
  const secB = await prisma.section.create({ data: { schoolYearId: year.id, programId: dit.id, yearLevel: 1, name: 'B' } });
  await prisma.classOffering.create({ data: { schoolYearId: year.id, semester: 1, sectionId: secB.id, subjectId: math1.id, gradeStatus: 'FINALIZED' } });
  const lockCode = await api('coord', 'PUT', `/subjects/${math1.id}`, subjectBody(`${M}-MATH9`, { title: 'Discrete Mathematics', lectureHours: 3 }));
  check('with finalized grades, changing the code is refused, saying why', lockCode.status === 422 && lockCode.json?.code === 'SUBJECT_LOCKED' && /finalized grades/.test(lockCode.json.message), lockCode.json);
  const lockUnits = await api('coord', 'PUT', `/subjects/${math1.id}`, subjectBody(`${M}-MATH1`, { title: 'Discrete Mathematics', defaultUnits: 5, lectureHours: 3 }));
  check('…and so is changing the units', lockUnits.status === 422 && lockUnits.json?.code === 'SUBJECT_LOCKED');
  const stillTitle = await api('coord', 'PUT', `/subjects/${math1.id}`, subjectBody(`${M}-MATH1`, { title: 'Discrete Math I', lectureHours: 3, remarks: 'Revised' }));
  check('…the title, hours and remarks can still change', stillTitle.status === 200 && (await prisma.subject.findUnique({ where: { id: math1.id } })).title === 'Discrete Math I');

  console.log('\nRooms that suit the class');
  const lab = await prisma.room.create({ data: { code: `${M}-LAB`.slice(0, 30), name: 'Lab', type: 'LABORATORY', capacity: 30 } });
  const lec = await prisma.room.create({ data: { code: `${M}-LEC`.slice(0, 30), name: 'Lecture room', type: 'LECTURE', capacity: 40 } });
  const tiny = await prisma.room.create({ data: { code: `${M}-TNY`.slice(0, 30), name: 'Small room', type: 'LECTURE', capacity: 2 } });
  created.rooms.push(lab.id, lec.id, tiny.id);
  const cls = (subject, room, day, extra = {}) => api('coord', 'POST', '/classes', { sectionId: String(secA.id), subjectId: String(subject.id), semester: 1, instructorId: null, roomId: String(room.id), passingGrade: 75, schedules: [{ dayOfWeek: day, startTime: '08:00', endTime: '10:00' }], ...extra });
  const labInLecture = await cls(prog1, lec, 1);
  check('a laboratory subject in a lecture room is refused', labInLecture.status === 422 && labInLecture.json?.code === 'ROOM_UNSUITABLE', labInLecture.json);
  const labInLab = await cls(prog1, lab, 1);
  check('…and is fine in a laboratory', labInLab.status === 201, labInLab.json);
  // Three students in Section A for the seat check.
  for (let i = 0; i < 3; i++) {
    const st = await prisma.student.create({ data: { studentNumber: `${M}-${i}`, firstName: `S${i}`, lastName: `L${M}`, programId: dit.id, curriculumId: curDit.id, yearLevel: 1, status: 'active', createdAt: new Date() } });
    created.students.push(st.id);
    await prisma.sectionStudent.create({ data: { sectionId: secA.id, studentId: st.id, schoolYearId: year.id } });
  }
  const tooSmall = await cls(math1, tiny, 2);
  check('a room with fewer seats than the section is refused', tooSmall.status === 422 && tooSmall.json?.code === 'ROOM_TOO_SMALL' && /seats 2, but the section has 3/.test(tooSmall.json.message), tooSmall.json);
  const lecLab = await cls(math1, lec, 2);
  check('a lecture subject in a lecture room that seats the section is fine', lecLab.status === 201, lecLab.json);

  console.log('\nThe student sees their section’s classes');
  const learnerUser = await makeUser('learner', 'student');
  await prisma.student.update({ where: { id: created.students[0] }, data: { userId: learnerUser.id } });
  const cancelled = await prisma.classOffering.findFirst({ where: { sectionId: secA.id, subjectId: math1.id } });
  await prisma.classOffering.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
  const mine = await page('learner', '/my/classes');
  check('My Classes: the student’s section, its active classes only (PROG1, not the cancelled MATH1, not Section B’s)', mine?.placement?.section === `${M}-DIT · 1st Year · Section A` && mine.classes.map((c) => c.code).join() === `${M}-PROG1` && mine.classes[0].meetings[0].text === 'Mon 8:00 AM–10:00 AM' && mine.classes[0].room === lab.code, mine);
  const noPlacement = await makeUser('newbie', 'student');
  await prisma.student.update({ where: { id: created.students[1] }, data: { userId: noPlacement.id } });
  await prisma.sectionStudent.deleteMany({ where: { studentId: created.students[1] } });
  const none = await page('newbie', '/my/classes');
  check('a student without a section is told they will see classes once placed', none?.placement === null && none.classes.length === 0);

  console.log('\nPermissions');
  const sec = await api('secretary', 'POST', '/subjects', { ...subjectBody(`${M}-NO1`), ...place(dit.id, 1, 1) });
  const sec2 = await api('secretary', 'PUT', `/curricula/${curDit.id}/subjects/${prog2Entry.id}`, { units: 1, isRequired: true, prerequisiteSubjectIds: [] });
  check('the Secretary cannot create subjects or change mappings (403)', sec.status === 403 && sec2.status === 403, [sec.status, sec2.status]);
  const notStudent = await api('coord', 'GET', '/pages/my/classes');
  check('My Classes is for students only (403 for staff)', notStudent.status === 403, notStudent.status);
  void teacher;
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const classIds = (await prisma.classOffering.findMany({ where: { schoolYearId: { in: created.years } }, select: { id: true } })).map((c) => c.id);
    await prisma.classSchedule.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.classOffering.deleteMany({ where: { id: { in: classIds } } });
    await prisma.sectionStudent.deleteMany({ where: { schoolYearId: { in: created.years } } });
    await prisma.section.deleteMany({ where: { schoolYearId: { in: created.years } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    await prisma.student.deleteMany({ where: { id: { in: created.students } } });
    await prisma.curriculumSubjectPrerequisite.deleteMany({ where: { curriculumSubject: { curriculumId: { in: created.curricula } } } });
    await prisma.curriculumSubject.deleteMany({ where: { curriculumId: { in: created.curricula } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.subject.deleteMany({ where: { code: { startsWith: M } } });
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
