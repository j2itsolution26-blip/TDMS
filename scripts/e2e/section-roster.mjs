// End-to-end check of section rosters: eligibility, one section per school
// year, conflicts reported (never moved), simultaneous adds, removal, and who
// may change a roster.
//
//   npm run build && PORT=3001 npm start
//   npm run test:roster            (BASE=http://host:port to point elsewhere)
//
// Throwaway records only (marker ZZE2E), in a throwaway school year that is
// never activated; removed at the end. Run it against a disposable database.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const stamp = Date.now();
const M = `ZZE2E${String(stamp).slice(-6)}`;
const PASSWORD = `Roster#Check${stamp}xY`;
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
const members = async (sectionId) => (await prisma.sectionStudent.findMany({ where: { sectionId }, select: { studentId: true } })).map((m) => m.studentId.toString()).sort();

try {
  console.log(`Section roster e2e against ${BASE} (marker ${M})\n`);
  for (const [k, r] of [['coordinator', 'coordinator'], ['secretary', 'secretary'], ['teacher', 'teacher']]) await makeUser(k, r);

  const program = await prisma.program.create({ data: { code: `${M}-DIT`, name: `${M} Diploma in IT`, isActive: true, createdAt: new Date() } });
  const other = await prisma.program.create({ data: { code: `${M}-DHT`, name: `${M} Diploma in HT`, isActive: true, createdAt: new Date() } });
  created.programs.push(program.id, other.id);
  const cur = await prisma.curriculum.create({ data: { programId: program.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  const cur2 = await prisma.curriculum.create({ data: { programId: other.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id, cur2.id);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${String(stamp).slice(-4)}`.slice(0, 20), startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id);
  const sec = async (name) => { const s = await prisma.section.create({ data: { schoolYearId: year.id, programId: program.id, yearLevel: 1, name } }); created.sections.push(s.id); return s; };
  const A = await sec('A');
  const B = await sec('B');
  const mk = async (n, opts = {}) => {
    const s = await prisma.student.create({ data: { studentNumber: `${M}-${n}`, firstName: `Cand${n}`, lastName: `Last${M}`, programId: opts.programId ?? program.id, curriculumId: opts.curriculumId ?? cur.id, yearLevel: 1, status: opts.status ?? 'active', createdAt: new Date() } });
    created.students.push(s.id);
    return s;
  };
  const s1 = await mk(1); const s2 = await mk(2); const s3 = await mk(3); const s4 = await mk(4);
  const outsider = await mk(5, { programId: other.id, curriculumId: cur2.id });
  const dropped = await mk(6, { status: 'dropped' });

  console.log('Reading a roster');
  const roster = (await api('coordinator', 'GET', `/sections/${A.id}`)).data;
  const offered = roster?.candidates?.map((c) => c.studentNumber) ?? [];
  check('offers active students of the program not yet in a section', [1, 2, 3, 4].every((n) => offered.includes(`${M}-${n}`)), offered);
  check('does not offer other programs or dropped students', !offered.includes(`${M}-5`) && !offered.includes(`${M}-6`));
  check('shows the section summary from the database', roster?.section?.program?.code === `${M}-DIT` && roster?.section?.name === 'A' && roster?.section?.yearLevel === 1 && roster?.members?.length === 0, roster?.section);

  console.log('\nAdding');
  const r1 = await add('coordinator', A.id, [s1.id, s2.id]);
  check('adds several students in one request', r1.status === 200 && r1.data?.added === 2, r1.json);
  const r2 = await add('coordinator', A.id, [s1.id]);
  check('re-adding someone already in the section changes nothing', r2.data?.added === 0 && r2.data?.already === 1 && (await members(A.id)).length === 2, r2.data);
  await add('coordinator', B.id, [s3.id]);
  const r3 = await add('coordinator', A.id, [s3.id, s4.id]);
  check('a student in another section is not moved, and is named with that section', r3.data?.added === 1 && r3.data?.conflicts?.length === 1 && r3.data.conflicts[0].studentNumber === `${M}-3` && /Section B/.test(r3.data.conflicts[0].section), r3.data);
  check('they stay in their own section', (await members(B.id)).includes(s3.id.toString()) && !(await members(A.id)).includes(s3.id.toString()));
  const r4 = await add('coordinator', A.id, [outsider.id]);
  check('a student of another program is refused by the server', r4.status === 422 && !(await members(A.id)).includes(outsider.id.toString()), r4.json);
  const r5 = await add('coordinator', A.id, [dropped.id]);
  check('a dropped student is refused by the server', r5.status === 422, r5.json);
  const r6 = await add('coordinator', A.id, [s4.id, outsider.id]);
  check('a mixed request with an ineligible student adds nobody', r6.status === 422 && (await members(A.id)).filter((x) => x === s4.id.toString()).length === 1);
  const after = (await api('coordinator', 'GET', `/sections/${A.id}`)).data;
  check('the roster counts students placed elsewhere', after?.assignedElsewhere >= 1, after?.assignedElsewhere);

  console.log('\nTwo requests at once');
  const s7 = await mk(7);
  const [x, y] = await Promise.all([add('coordinator', A.id, [s7.id]), add('coordinator', B.id, [s7.id])]);
  const placements = await prisma.sectionStudent.count({ where: { studentId: s7.id } });
  check('one student lands in exactly one section', placements === 1 && (x.data?.added ?? 0) + (y.data?.added ?? 0) === 1, [x.status, x.data, y.status, y.data]);

  console.log('\nRemoving and permissions');
  check('a student is removed from the section', (await api('coordinator', 'DELETE', `/sections/${A.id}/students?studentId=${s1.id}`)).status === 200 && !(await members(A.id)).includes(s1.id.toString()));
  check('removing someone not in the section is a 404', (await api('coordinator', 'DELETE', `/sections/${A.id}/students?studentId=${s1.id}`)).status === 404);
  check('the student record is untouched', !!(await prisma.student.findUnique({ where: { id: s1.id } })));
  for (const who of ['secretary', 'teacher']) {
    check(`the ${who} cannot add`, (await add(who, A.id, [s1.id])).status === 403);
    check(`the ${who} cannot remove`, (await api(who, 'DELETE', `/sections/${A.id}/students?studentId=${s2.id}`)).status === 403);
  }
  await prisma.schoolYear.update({ where: { id: year.id }, data: { status: 'ARCHIVED' } });
  const arch = await add('coordinator', A.id, [s1.id]);
  check('an archived school year cannot be changed', arch.status >= 400 && !(await members(A.id)).includes(s1.id.toString()), arch.json);
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
