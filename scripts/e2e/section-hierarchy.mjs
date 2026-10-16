// End-to-end check of Classes & Sections as Program → Year Level → Sections:
// only 1st–3rd Year sections can be created, names are unique per program,
// year level and school year (on create and on rename), the page data carries
// each section's program, year level and counts exactly as stored, and only
// the Admin and Coordinator can change sections.
//
//   npm run build && PORT=3001 npm start
//   npm run test:hierarchy            (BASE=http://host:port to point elsewhere)
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
const PASSWORD = `Hier#Check${stamp}xY`;
const created = { users: [], students: [], programs: [], curricula: [], years: [] };
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

try {
  console.log(`Section hierarchy e2e against ${BASE} (marker ${M})\n`);
  for (const role of ['admin', 'coordinator', 'secretary', 'teacher']) await makeUser(role, role);

  const dit = await prisma.program.create({ data: { code: `${M}-DIT`, name: `${M} Diploma in IT`, isActive: true, createdAt: new Date() } });
  const dht = await prisma.program.create({ data: { code: `${M}-DHT`, name: `${M} Diploma in Hospitality`, isActive: true, createdAt: new Date() } });
  created.programs.push(dit.id, dht.id);
  const cur = await prisma.curriculum.create({ data: { programId: dit.id, versionLabel: 'v1', effectiveSchoolYear: '2097-2098', isActive: true, createdAt: new Date() } });
  created.curricula.push(cur.id);
  const year = await prisma.schoolYear.create({ data: { label: `2097-${String(stamp).slice(-4)}`.slice(0, 20), startsOn: new Date('2097-06-01'), endsOn: new Date('2098-03-31'), status: 'UPCOMING' } });
  const other = await prisma.schoolYear.create({ data: { label: `2098-${String(stamp).slice(-4)}`.slice(0, 20), startsOn: new Date('2098-06-01'), endsOn: new Date('2099-03-31'), status: 'UPCOMING' } });
  created.years.push(year.id, other.id);
  const make = (who, programId, yearLevel, name, schoolYearId = year.id) => api(who, 'POST', '/sections', { schoolYearId: String(schoolYearId), programId: String(programId), yearLevel, name });

  console.log('Year levels');
  for (const [lvl, who] of [[1, 'coordinator'], [2, 'coordinator'], [3, 'admin']]) {
    const r = await make(who, dit.id, lvl, 'A');
    check(`a ${lvl === 1 ? '1st' : lvl === 2 ? '2nd' : '3rd'} Year section can be created (${who})`, r.status === 200 || r.status === 201, r.json);
  }
  for (const bad of [4, 0, 5, '4th']) {
    const r = await make('admin', dit.id, bad, 'Z');
    check(`year level ${JSON.stringify(bad)} is rejected with a field error`, r.status === 422 && /1st, 2nd or 3rd Year/.test(JSON.stringify(r.json?.errors?.yearLevel ?? r.json)), r.json);
  }
  check('no section above 3rd Year exists after those attempts', (await prisma.section.count({ where: { schoolYearId: year.id, yearLevel: { gt: 3 } } })) === 0);

  console.log('\nNames are unique per program, year level and school year');
  const dup = await make('coordinator', dit.id, 1, 'A');
  check('a second DIT 1st Year “A” is refused', dup.status === 422 && /already exists/.test(JSON.stringify(dup.json)), dup.json);
  const b = await make('coordinator', dit.id, 1, 'B');
  check('DIT 1st Year “B” is fine', b.status === 200 || b.status === 201, b.json);
  const otherProgram = await make('coordinator', dht.id, 1, 'A');
  check('“A” in another program is fine', otherProgram.status === 200 || otherProgram.status === 201, otherProgram.json);
  const otherYear = await make('coordinator', dit.id, 1, 'A', other.id);
  check('“A” in another school year is fine', otherYear.status === 200 || otherYear.status === 201, otherYear.json);

  const secB = await prisma.section.findFirst({ where: { schoolYearId: year.id, programId: dit.id, yearLevel: 1, name: 'B' } });
  const clash = await api('coordinator', 'PUT', `/sections/${secB.id}`, { name: 'A' });
  check('renaming B to an existing “A” is refused with a field error', clash.status === 422 && /already exists for this program and year level/.test(clash.json?.errors?.name?.[0] ?? ''), clash.json);
  check('…and B keeps its name', (await prisma.section.findUnique({ where: { id: secB.id } })).name === 'B');
  const renamed = await api('coordinator', 'PUT', `/sections/${secB.id}`, { name: 'C' });
  check('renaming B to C works, keeping program and year level', renamed.status === 200 && (await prisma.section.findUnique({ where: { id: secB.id } })).name === 'C' && (await prisma.section.findUnique({ where: { id: secB.id } })).yearLevel === 1);
  const sec2A = await prisma.section.findFirst({ where: { schoolYearId: year.id, programId: dit.id, yearLevel: 2, name: 'A' } });
  const crossLevel = await api('coordinator', 'PUT', `/sections/${secB.id}`, { name: 'A' });
  check('a name used only in another year level does not count as a clash… (1st Year “A” still does)', crossLevel.status === 422, crossLevel.status);
  const toLevel2Free = await api('coordinator', 'PUT', `/sections/${sec2A.id}`, { name: 'C' });
  check('2nd Year A → C is fine although 1st Year has a “C”', toLevel2Free.status === 200, toLevel2Free.json);

  console.log('\nPermissions');
  for (const who of ['secretary', 'teacher']) {
    const c = await make(who, dit.id, 1, 'X');
    const r = await api(who, 'PUT', `/sections/${secB.id}`, { name: 'Y' });
    const d = await api(who, 'DELETE', `/sections/${secB.id}`);
    check(`${who}: cannot create, rename or delete sections (403)`, c.status === 403 && r.status === 403 && d.status === 403, [c.status, r.status, d.status]);
  }
  const page = await fetch(`${BASE}/api/v1/pages/class-setup?year=${year.id}`, { headers: { cookie: cookies.secretary } });
  check('secretary: the Classes & Sections page data is refused', page.status === 403, page.status);

  console.log('\nPage data matches the database');
  // Two students in 1st Year C.
  for (let i = 0; i < 2; i++) {
    const s = await prisma.student.create({ data: { studentNumber: `${M}-${i}`, firstName: `S${i}`, lastName: `Last${M}`, programId: dit.id, curriculumId: cur.id, yearLevel: 1, status: 'active', createdAt: new Date() } });
    created.students.push(s.id);
  }
  const add = await api('coordinator', 'POST', `/sections/${secB.id}/students`, { studentIds: created.students.map(String) });
  check('two students placed in DIT 1st Year C', add.status === 200 && add.data?.added === 2, add.json);
  const res = await fetch(`${BASE}/api/v1/pages/class-setup?year=${year.id}`, { headers: { cookie: cookies.coordinator } });
  const sections = (await res.json())?.data?.setup?.sections ?? [];
  const db = await prisma.section.findMany({ where: { schoolYearId: year.id }, select: { id: true, yearLevel: true, programId: true, name: true, _count: { select: { students: true, classes: true } } } });
  const same = db.length === sections.length && db.every((d) => {
    const s = sections.find((x) => x.id === String(d.id));
    return s && s.yearLevel === d.yearLevel && s.program.id === String(d.programId) && s.name === d.name && s.students === d._count.students && s.classes === d._count.classes;
  });
  check('every section in the page data has the stored program, year level, name and counts', same, { page: sections.map((s) => [s.label, s.students]), db: db.length });
  check('only this school year’s sections are included', sections.every((s) => db.some((d) => String(d.id) === s.id)));
  const byLevel = [1, 2, 3].map((n) => sections.filter((s) => s.program.id === String(dit.id) && s.yearLevel === n).map((s) => s.name).sort().join(','));
  check('DIT grouped by year level: 1st A,C · 2nd C · 3rd A', byLevel.join(' | ') === 'A,C | C | A', byLevel);
  check('DHT has only its own 1st Year A', sections.filter((s) => s.program.id === String(dht.id)).map((s) => `${s.yearLevel}${s.name}`).join(',') === '1A');
  check('the 1st Year C count is 2, from the database', sections.find((s) => s.id === String(secB.id))?.students === 2);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.log('CRASH', e);
} finally {
  try {
    const sectionIds = (await prisma.section.findMany({ where: { schoolYearId: { in: created.years } }, select: { id: true } })).map((s) => s.id);
    await prisma.sectionStudent.deleteMany({ where: { sectionId: { in: sectionIds } } });
    await prisma.section.deleteMany({ where: { id: { in: sectionIds } } });
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
