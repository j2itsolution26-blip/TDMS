// End-to-end check of the 25-student section limit: the 25th fits, the 26th
// does not, bulk requests cannot exceed the free slots, simultaneous requests
// cannot overfill a section, and a section already over the limit is left as
// it is but takes nobody new.
//
//   npm run build && PORT=3001 npm start
//   npm run test:capacity            (BASE=http://host:port to point elsewhere)
//
// Throwaway records only (marker ZZE2E), in a throwaway school year; removed
// at the end. Run it against a disposable database.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Cap#Check${stamp}xY`;
const created = { users: [], students: [], programs: [], curricula: [], years: [], sections: [] };
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
const add = (who, sectionId, ids) => api(who, 'POST', `/sections/${sectionId}/students`, { studentIds: ids.map(String) });
const count = (sectionId) => prisma.sectionStudent.count({ where: { sectionId } });

try {
  console.log(`Section capacity e2e against ${BASE} (marker ${M})\n`);
  await makeUser('coordinator', 'coordinator');
  await makeUser('coordinator2', 'coordinator');
  await makeUser('teacher', 'teacher');

  const program = await prisma.program.create({ data: { code: `${M}-DIT`, name: `${M} Diploma in IT`, isActive: true, createdAt: new Date() } });
  created.programs.push(program.id);
  const cur = await prisma.curriculum.create({ data: { programId: program.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${String(stamp).slice(-4)}`.slice(0, 20), startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id);
  const sec = async (name) => { const s = await prisma.section.create({ data: { schoolYearId: year.id, programId: program.id, yearLevel: 1, name } }); created.sections.push(s.id); return s; };
  let n = 0;
  const students = async (k) => {
    const out = [];
    for (let i = 0; i < k; i++) {
      n += 1;
      const s = await prisma.student.create({ data: { studentNumber: `${M}-${String(n).padStart(3, '0')}`, firstName: `S${n}`, lastName: `Last${M}`, programId: program.id, curriculumId: cur.id, yearLevel: 1, status: 'active', createdAt: new Date() } });
      created.students.push(s.id);
      out.push(s.id);
    }
    return out;
  };

  console.log('Filling a section to the limit');
  const A = await sec('A');
  const first24 = await students(24);
  const r24 = await add('coordinator', A.id, first24);
  check('24 students are added in one request', r24.status === 200 && r24.data?.added === 24 && (await count(A.id)) === 24, r24.json);
  const roster24 = (await api('coordinator', 'GET', `/sections/${A.id}`)).data?.capacity;
  check('the roster reports 24/25 with 1 slot available', roster24?.count === 24 && roster24?.available === 1 && roster24?.level === 'near', roster24);
  const two = await students(2);
  const over = await add('coordinator', A.id, two);
  check('asking for 2 when 1 slot is left is refused, naming the free slots', over.status === 409 && over.json?.code === 'SECTION_CAPACITY' && /1 slot left/.test(over.json?.message ?? ''), over.json);
  check('and nobody is added (no silent partial add)', (await count(A.id)) === 24);
  const r25 = await add('coordinator', A.id, [two[0]]);
  check('the 25th student is added', r25.status === 200 && r25.data?.added === 1 && (await count(A.id)) === 25, r25.json);
  const r26 = await add('coordinator', A.id, [two[1]]);
  check('the 26th student is refused: the section is full', r26.status === 409 && /is full/.test(r26.json?.message ?? '') && (await count(A.id)) === 25, r26.json);
  const full = (await api('coordinator', 'GET', `/sections/${A.id}`)).data?.capacity;
  check('the roster reports Full with no slots', full?.count === 25 && full?.available === 0 && full?.level === 'full', full);
  const dup = await add('coordinator', A.id, [first24[0]]);
  check('re-adding a member of a full section is harmless and adds nothing', dup.status === 200 && dup.data?.added === 0 && dup.data?.already === 1 && (await count(A.id)) === 25, dup.json);

  console.log('\nSimultaneous requests');
  const B = await sec('B');
  await add('coordinator', B.id, await students(23));
  const p1 = await students(2);
  const p2 = await students(2);
  const [x, y] = await Promise.all([add('coordinator', B.id, p1), add('coordinator2', B.id, p2)]);
  const codes = [x.status, y.status].sort();
  check('two Admins adding 2 each to a section with 2 slots: one wins, one is refused', codes[0] === 200 && codes[1] === 409, [x.status, x.json?.message, y.status, y.json?.message]);
  check('the section ends at exactly 25', (await count(B.id)) === 25);
  const C = await sec('C');
  await add('coordinator', C.id, await students(20));
  const singles = await students(10);
  const results = await Promise.all(singles.map((s, i) => add(i % 2 ? 'coordinator2' : 'coordinator', C.id, [s])));
  const ok = results.filter((r) => r.status === 200 && r.data?.added === 1).length;
  check('ten simultaneous single adds into 5 free slots: exactly 5 succeed', ok === 5 && results.filter((r) => r.status === 409).length === 5, results.map((r) => r.status));
  check('that section ends at exactly 25', (await count(C.id)) === 25);

  console.log('\nA section already over the limit');
  const D = await sec('D');
  const legacy = await students(27);
  await prisma.sectionStudent.createMany({ data: legacy.map((studentId) => ({ sectionId: D.id, studentId, schoolYearId: year.id })) }); // as if placed before the limit existed
  const overRoster = (await api('coordinator', 'GET', `/sections/${D.id}`)).data?.capacity;
  check('the roster reports it as over capacity', overRoster?.count === 27 && overRoster?.over === true && overRoster?.available === 0, overRoster);
  const one = await students(1);
  const blocked = await add('coordinator', D.id, one);
  check('it accepts nobody new, with an explanation', blocked.status === 409 && /more than its limit/.test(blocked.json?.message ?? ''), blocked.json);
  check('and nobody is removed', (await count(D.id)) === 27);
  await api('coordinator', 'DELETE', `/sections/${D.id}/students?studentId=${legacy[0]}`);
  check('removing students still works for it', (await count(D.id)) === 26);

  console.log('\nPermissions');
  const E = await sec('E');
  const t = await add('teacher', E.id, await students(1));
  check('an Instructor cannot add students at all', t.status === 403 && (await count(E.id)) === 0);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    await prisma.sectionStudent.deleteMany({ where: { sectionId: { in: created.sections } } });
    await prisma.section.deleteMany({ where: { id: { in: created.sections } } });
    await prisma.schoolYear.deleteMany({ where: { id: { in: created.years } } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.student.deleteMany({ where: { id: { in: created.students } } });
    await prisma.curriculum.deleteMany({ where: { id: { in: created.curricula } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
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
