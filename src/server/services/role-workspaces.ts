import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import {
  applicationPolicy,
  curriculumPolicy,
  enrollmentPolicy,
  programPolicy,
  studentCredentialPolicy,
  studentPolicy,
  subjectPolicy,
} from '@/server/auth/policies';
import type { AuthUser } from '@/types/domain';
import type {
  CoordinatorWorkspace,
  DirectorWorkspace,
  EnrollmentByProgramRow,
  GraduationRow,
  ListItem,
  ProgramPerformanceRow,
  ProgramReadiness,
  QuickLink,
  SecretaryWorkspace,
  WorkItem,
  WorkMetric,
  WorkProgress,
  WorkSegment,
} from '@/types/dashboard';

/**
 * The Director, Coordinator and Secretary workspaces.
 *
 * Three different jobs, so three different sets of panels — but one way of
 * building them:
 *
 *   * every figure is a COUNT from the records (grouped counts, or one SQL
 *     aggregate), never a table loaded into memory and counted here;
 *   * every query is gated by the policy that guards the page it summarises —
 *     a Coordinator's workspace never counts or names a student, because
 *     studentPolicy does not let a Coordinator see students; the query is not
 *     even issued;
 *   * independent queries run concurrently, once per request.
 *
 * WHAT IS DERIVED, AND HOW
 *
 *   Graduating      an active student in the final year level of their own
 *                   curriculum (the highest year any of its subjects sits in).
 *   Incomplete      an active student with a required document not yet
 *   requirements    verified — the very rule the enrollment gate applies
 *                   (hasAllRequiredCredentialsVerified), computed in SQL.
 *   Ready program   active, with an active curriculum that has subjects and no
 *                   empty term between its first and last.
 *
 * WHAT IS NOT HERE
 *
 * TDMS records no grades, attendance, competencies, assessments or teacher-to-
 * program assignments. They are listed in `notTracked`, and the page says so,
 * instead of showing zeros that look like measurements.
 */

const DAY = 86_400_000;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function byStatus(rows: { status: string; _count: { _all: number } }[]): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// --- Shared queries ---------------------------------------------------------------------

async function applicationStatuses() {
  const rows = await prisma.application.groupBy({ by: ['status'], _count: { _all: true } });
  const c = byStatus(rows);
  return {
    submitted: c.submitted ?? 0,
    underReview: c.under_review ?? 0,
    approved: c.approved ?? 0,
    returned: c.returned ?? 0,
    waiting: (c.submitted ?? 0) + (c.under_review ?? 0),
    total: sum(Object.values(c)),
  };
}

async function enrollmentStatuses() {
  const rows = await prisma.enrollment.groupBy({ by: ['status'], _count: { _all: true } });
  const c = byStatus(rows);
  return { pending: c.pending ?? 0, enrolled: c.enrolled ?? 0, dropped: c.dropped ?? 0 };
}

async function credentialStatuses() {
  const rows = await prisma.studentCredential.groupBy({ by: ['status'], _count: { _all: true } });
  const c = byStatus(rows);
  return {
    verified: c.verified ?? 0,
    pending: (c.submitted ?? 0) + (c.under_review ?? 0),
    returned: c.rejected ?? 0,
    missing: c.missing ?? 0,
    expired: c.expired ?? 0,
  };
}

/** Teacher accounts — joined to users, as model_has_roles has no foreign key. */
async function teacherCount(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(DISTINCT u.id)::int AS n
    FROM model_has_roles m
    JOIN users u ON u.id = m.model_id
    JOIN roles r ON r.id = m.role_id
    WHERE m.model_type = ${USER_MODEL_TYPE} AND r.guard_name = ${GUARD} AND r.name = 'teacher'`;
  return Number(rows[0]?.n ?? 0);
}

function programs() {
  return prisma.program.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, isActive: true, createdAt: true, updatedAt: true },
  });
}

/**
 * Where each active student stands: required documents vs verified ones (the
 * enrollment gate's rule), and whether they are in their curriculum's final
 * year. Per student, inside Postgres; only aggregates or a short list leave it.
 */
const STANDING = Prisma.sql`
  WITH req AS (
    SELECT id, program_id FROM credential_requirements WHERE is_active = true AND is_required = true
  ), standing AS (
    SELECT s.id, s.program_id, s.year_level, s.first_name, s.last_name, s.student_number,
      (SELECT count(*) FROM req r WHERE r.program_id IS NULL OR r.program_id = s.program_id) AS required,
      (SELECT count(*) FROM student_credentials c JOIN req r ON r.id = c.credential_requirement_id
         WHERE c.student_id = s.id AND c.status = 'verified'
           AND (r.program_id IS NULL OR r.program_id = s.program_id)) AS verified,
      (SELECT max(cs.year_level) FROM curriculum_subjects cs WHERE cs.curriculum_id = s.curriculum_id) AS final_year
    FROM students s
    WHERE s.status = 'active'
  )`;

async function standingByProgram() {
  const rows = await prisma.$queryRaw<{ program_id: bigint; graduating: number; incomplete: number }[]>`
    ${STANDING}
    SELECT program_id,
      count(*) FILTER (WHERE final_year IS NOT NULL AND year_level >= final_year)::int AS graduating,
      count(*) FILTER (WHERE verified < required)::int AS incomplete
    FROM standing GROUP BY program_id`;
  return new Map(rows.map((r) => [r.program_id.toString(), { graduating: Number(r.graduating), incomplete: Number(r.incomplete) }]));
}

async function graduatingStudents(): Promise<GraduationRow[]> {
  const rows = await prisma.$queryRaw<
    { id: bigint; first_name: string; last_name: string; student_number: string; year_level: number; code: string; outstanding: number }[]
  >`
    ${STANDING}
    SELECT st.id, st.first_name, st.last_name, st.student_number, st.year_level, p.code,
      greatest(st.required - st.verified, 0)::int AS outstanding
    FROM standing st JOIN programs p ON p.id = st.program_id
    WHERE st.final_year IS NOT NULL AND st.year_level >= st.final_year
    ORDER BY outstanding DESC, st.last_name, st.first_name
    LIMIT 6`;
  return rows.map((r) => ({
    id: r.id.toString(),
    name: `${r.first_name} ${r.last_name}`,
    studentNumber: r.student_number,
    program: r.code,
    yearLevel: Number(r.year_level),
    outstanding: Number(r.outstanding),
  }));
}

function statusOf(active: boolean) {
  return active ? { status: 'active', label: 'Active' } : { status: 'inactive', label: 'Inactive' };
}

/** Only the pages this viewer may open, in a stable order. */
function links(user: AuthUser, wanted: ('programs' | 'subjects' | 'students' | 'addStudent' | 'applications' | 'enrollments')[]): QuickLink[] {
  const all: Record<string, { ok: boolean; link: QuickLink }> = {
    programs: { ok: programPolicy.viewAny(user), link: { label: 'Programs', description: 'Programs and their curricula', href: '/programs', icon: 'programs' } },
    subjects: { ok: subjectPolicy.viewAny(user), link: { label: 'Subjects', description: 'The subject catalogue', href: '/subjects', icon: 'subjects' } },
    students: { ok: studentPolicy.viewAny(user), link: { label: 'Students', description: 'Records, documents and enrollment', href: '/students', icon: 'students' } },
    addStudent: { ok: studentPolicy.create(user), link: { label: 'Add Student', description: 'Create a student record', href: '/students?new=1', icon: 'registrations' } },
    applications: { ok: applicationPolicy.viewAny(user), link: { label: 'Applications', description: 'Review and decide', href: '/applications', icon: 'applications' } },
    enrollments: { ok: enrollmentPolicy.viewAny(user), link: { label: 'Enrollment', description: 'Term enrollments', href: '/enrollments', icon: 'enrollment' } },
  };
  return wanted.filter((k) => all[k]!.ok).map((k) => all[k]!.link);
}

// --- Director -----------------------------------------------------------------------------

/** "How is the entire program performing?" */
export async function directorWorkspace(user: AuthUser): Promise<DirectorWorkspace> {
  const canPrograms = programPolicy.viewAny(user);
  const canStudents = studentPolicy.viewAny(user);
  const canApps = applicationPolicy.viewAny(user);
  const canDocs = studentCredentialPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);

  const [programRows, studentGroups, apps, appsWaitingBy, enroll, docsToReview, teachers, standing, graduation] = await Promise.all([
    canPrograms ? programs() : null,
    canStudents ? prisma.student.groupBy({ by: ['programId', 'status'], _count: { _all: true } }) : null,
    canApps ? applicationStatuses() : null,
    canApps && canPrograms
      ? prisma.application.groupBy({ by: ['programId'], where: { status: { in: ['submitted', 'under_review'] } }, _count: { _all: true } })
      : null,
    canEnroll ? enrollmentStatuses() : null,
    canDocs ? prisma.studentCredential.count({ where: { status: { in: ['submitted', 'under_review'] } } }) : null,
    teacherCount(),
    canStudents ? standingByProgram() : null,
    canStudents ? graduatingStudents() : null,
  ]);

  // Students per program and status, from one grouped query.
  const perProgram = new Map<string, { total: number; active: number; graduated: number }>();
  const totals = { total: 0, active: 0, graduated: 0 };
  for (const g of studentGroups ?? []) {
    const key = g.programId.toString();
    const row = perProgram.get(key) ?? { total: 0, active: 0, graduated: 0 };
    row.total += g._count._all;
    totals.total += g._count._all;
    if (g.status === 'active') { row.active += g._count._all; totals.active += g._count._all; }
    if (g.status === 'graduated') { row.graduated += g._count._all; totals.graduated += g._count._all; }
    perProgram.set(key, row);
  }
  const graduating = standing ? sum([...standing.values()].map((s) => s.graduating)) : 0;
  const incomplete = standing ? sum([...standing.values()].map((s) => s.incomplete)) : 0;
  const waitingBy = new Map((appsWaitingBy ?? []).map((r) => [r.programId.toString(), r._count._all]));

  const actions: WorkItem[] = [];
  if (apps && apps.waiting > 0) {
    actions.push({ key: 'applications', label: 'Applications awaiting decision', description: `${plural(apps.waiting, 'application')} submitted or under review`, count: apps.waiting, href: '/applications?status=submitted', action: 'Review', icon: 'applications' });
  }
  if (enroll && enroll.pending > 0) {
    actions.push({ key: 'enrollments', label: 'Enrollment decisions', description: `${plural(enroll.pending, 'enrollment')} awaiting approval`, count: enroll.pending, href: '/enrollments?status=pending', action: 'Review', icon: 'enrollment' });
  }
  if (docsToReview) {
    actions.push({ key: 'documents', label: 'Documents requiring review', description: 'Submitted requirements not yet verified', count: docsToReview, href: '/students', action: 'Review', icon: 'documents' });
  }
  if (incomplete > 0) {
    actions.push({ key: 'incomplete', label: 'Students with incomplete requirements', description: 'Active students missing a verified required document', count: incomplete, href: '/students', action: 'View', icon: 'attention' });
  }
  const attention = sum(actions.map((a) => a.count));

  const activePrograms = programRows?.filter((p) => p.isActive).length ?? 0;
  const metrics: WorkMetric[] = [];
  if (programRows) {
    metrics.push({ key: 'programs', label: 'Active Programs', value: activePrograms, icon: 'programs', href: '/programs',
      hint: programRows.length === 0 ? 'None created yet' : `${plural(programRows.length, 'program')} in total` });
  }
  if (studentGroups) {
    metrics.push({ key: 'students', label: 'Total Students', value: totals.total, icon: 'students', href: '/students',
      hint: totals.total === 0 ? 'No student records yet' : `${totals.active.toLocaleString('en-US')} active` });
  }
  metrics.push({ key: 'faculty', label: 'Faculty', value: teachers, icon: 'teachers', hint: teachers === 0 ? 'No Diploma Instructor accounts yet' : 'Diploma Instructor accounts' });
  if (apps) {
    metrics.push({ key: 'applications', label: 'Applications', value: apps.waiting, icon: 'applications', href: '/applications',
      hint: apps.waiting > 0 ? 'Awaiting a decision' : 'None waiting', tone: apps.waiting > 0 ? 'attention' : 'neutral' });
  }
  if (standing) {
    metrics.push({ key: 'graduating', label: 'Graduating Students', value: graduating, icon: 'graduation', href: '/students',
      hint: graduating === 0 ? 'None in their final year' : 'In their curriculum’s final year' });
  }
  metrics.push({ key: 'attention', label: 'Actions Requiring Attention', value: attention, icon: 'attention',
    hint: attention === 0 ? 'Nothing waiting on you' : `${plural(actions.length, 'area')} to review`, tone: attention > 0 ? 'attention' : 'success' });

  const programTable: ProgramPerformanceRow[] | null = programRows
    ? programRows
        .map((p) => {
          const s = perProgram.get(p.id.toString());
          const st = standing?.get(p.id.toString());
          return {
            id: p.id.toString(),
            name: p.name,
            code: p.code,
            students: studentGroups ? (s?.total ?? 0) : null,
            active: studentGroups ? (s?.active ?? 0) : null,
            graduating: standing ? (st?.graduating ?? 0) : null,
            graduated: studentGroups ? (s?.graduated ?? 0) : null,
            pendingApplications: appsWaitingBy ? (waitingBy.get(p.id.toString()) ?? 0) : null,
            status: statusOf(p.isActive),
          };
        })
        .sort((a, b) => (b.students ?? 0) - (a.students ?? 0) || a.code.localeCompare(b.code))
        .slice(0, 8)
    : null;

  const progression: WorkSegment[] | null = studentGroups && standing
    ? [
        { key: 'normal', label: 'Normal progression', value: Math.max(totals.active - graduating, 0), tone: 'success', href: '/students' },
        { key: 'graduating', label: 'Graduating', value: graduating, tone: 'info', href: '/students' },
        { key: 'incomplete', label: 'Incomplete requirements', value: incomplete, tone: 'attention', href: '/students' },
        { key: 'graduated', label: 'Graduated', value: totals.graduated, tone: 'neutral', href: '/students' },
      ]
    : null;

  return {
    kind: 'director',
    metrics,
    actions,
    programs: programTable,
    progression,
    graduation,
    activity: [],
    quickActions: links(user, ['programs', 'students', 'applications', 'enrollments']),
    notTracked: ['Grades', 'Attendance', 'Competencies', 'Assessments', 'Instructor assignments to programs'],
  };
}

// --- Coordinator ----------------------------------------------------------------------------

/** "Is the academic structure ready and properly managed?" */
export async function coordinatorWorkspace(user: AuthUser): Promise<CoordinatorWorkspace> {
  const canCatalogue = programPolicy.viewAny(user) && curriculumPolicy.viewAny(user);
  const canSubjects = subjectPolicy.viewAny(user);
  const canApps = applicationPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);

  const [programRows, curricula, terms, activeSubjects, unmapped, apps, enroll, recentCurricula, recentSubjects, recentMappings] = await Promise.all([
    canCatalogue ? programs() : null,
    canCatalogue
      ? prisma.curriculum.findMany({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          select: { id: true, programId: true, versionLabel: true, _count: { select: { curriculumSubjects: true } } },
        })
      : null,
    // Subjects and units per curriculum term, for every active curriculum.
    canCatalogue
      ? prisma.curriculumSubject.groupBy({
          by: ['curriculumId', 'yearLevel', 'semester'],
          where: { curriculum: { isActive: true } },
          _count: { _all: true },
          _sum: { units: true },
        })
      : null,
    canSubjects ? prisma.subject.count({ where: { isActive: true } }) : null,
    canSubjects && canCatalogue ? prisma.subject.count({ where: { isActive: true, curriculumSubjects: { none: {} } } }) : null,
    canApps ? applicationStatuses() : null,
    canEnroll ? enrollmentStatuses() : null,
    canCatalogue
      ? prisma.curriculum.findMany({ where: { createdAt: { not: null } }, orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, versionLabel: true, createdAt: true, program: { select: { code: true } } } })
      : [],
    canSubjects
      ? prisma.subject.findMany({ where: { createdAt: { not: null } }, orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, code: true, title: true, createdAt: true } })
      : [],
    canCatalogue
      ? prisma.curriculumSubject.findMany({
          where: { createdAt: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 4,
          select: { id: true, createdAt: true, curriculumId: true, subject: { select: { code: true } }, curriculum: { select: { versionLabel: true, program: { select: { code: true } } } } },
        })
      : [],
  ]);

  // Per curriculum: subjects, units, and the terms between its first and last that have nothing.
  const shape = new Map<string, { subjects: number; units: number; terms: Set<string>; maxYear: number; maxSem: number }>();
  for (const t of terms ?? []) {
    const key = t.curriculumId.toString();
    const s = shape.get(key) ?? { subjects: 0, units: 0, terms: new Set<string>(), maxYear: 0, maxSem: 0 };
    s.subjects += t._count._all;
    s.units += Number(t._sum.units ?? 0);
    s.terms.add(`${t.yearLevel}-${t.semester}`);
    s.maxYear = Math.max(s.maxYear, t.yearLevel);
    s.maxSem = Math.max(s.maxSem, t.semester);
    shape.set(key, s);
  }
  const emptyTerms = (key: string) => {
    const s = shape.get(key);
    if (!s) return 0;
    let gaps = 0;
    for (let y = 1; y <= s.maxYear; y += 1) for (let m = 1; m <= s.maxSem; m += 1) if (!s.terms.has(`${y}-${m}`)) gaps += 1;
    return gaps;
  };

  // Each program's newest active curriculum is the one it enrolls into.
  const currentCurriculum = new Map<string, NonNullable<typeof curricula>[number]>();
  for (const c of curricula ?? []) if (!currentCurriculum.has(c.programId.toString())) currentCurriculum.set(c.programId.toString(), c);

  const readiness: ProgramReadiness[] | null = programRows
    ? programRows.map((p) => {
        const c = currentCurriculum.get(p.id.toString());
        const s = c ? shape.get(c.id.toString()) : undefined;
        const gaps = c ? emptyTerms(c.id.toString()) : 0;
        const subjects = s?.subjects ?? 0;
        const ready = p.isActive && Boolean(c) && subjects > 0 && gaps === 0;
        const status = !p.isActive
          ? statusOf(false)
          : !c
            ? { status: 'needs_review', label: 'Needs curriculum' }
            : subjects === 0
              ? { status: 'needs_review', label: 'Needs subjects' }
              : gaps > 0
                ? { status: 'needs_review', label: 'Has gaps' }
                : { status: 'ready', label: 'Ready' };
        return {
          id: p.id.toString(),
          name: p.name,
          code: p.code,
          curriculum: c?.versionLabel ?? null,
          subjects,
          units: Math.round((s?.units ?? 0) * 10) / 10,
          emptyTerms: gaps,
          ready,
          status,
        };
      })
    : null;

  const activeProgramRows = programRows?.filter((p) => p.isActive) ?? [];
  const withoutCurriculum = activeProgramRows.filter((p) => !currentCurriculum.has(p.id.toString()));
  const emptyCurricula = (curricula ?? []).filter((c) => c._count.curriculumSubjects === 0);
  const readyPrograms = readiness?.filter((r) => r.ready).length ?? 0;

  const tasks: WorkItem[] = [];
  if (emptyCurricula.length > 0) {
    tasks.push({ key: 'empty-curricula', label: 'Curricula missing subjects', description: 'Active curricula with no subjects mapped', count: emptyCurricula.length,
      href: emptyCurricula.length === 1 ? `/curricula/${emptyCurricula[0]!.id}` : '/programs', action: 'Review', icon: 'curricula' });
  }
  if (withoutCurriculum.length > 0) {
    tasks.push({ key: 'no-curriculum', label: 'Programs requiring curriculum setup', description: 'Active programs without an active curriculum', count: withoutCurriculum.length,
      href: withoutCurriculum.length === 1 ? `/programs/${withoutCurriculum[0]!.id}` : '/programs', action: 'Review', icon: 'programs' });
  }
  if (unmapped) {
    tasks.push({ key: 'unmapped', label: 'Subjects not assigned', description: 'Active subjects not mapped into any curriculum', count: unmapped, href: '/subjects', action: 'Review', icon: 'subjects' });
  }
  if (apps && apps.waiting > 0) {
    tasks.push({ key: 'applications', label: 'Applications requiring review', description: 'Submitted or under review', count: apps.waiting, href: '/applications?status=submitted', action: 'Review', icon: 'applications' });
  }
  if (enroll && enroll.pending > 0) {
    tasks.push({ key: 'enrollments', label: 'Enrollment records requiring review', description: 'Awaiting approval', count: enroll.pending, href: '/enrollments?status=pending', action: 'Review', icon: 'enrollment' });
  }
  const taskTotal = sum(tasks.map((t) => t.count));

  const metrics: WorkMetric[] = [];
  if (programRows) {
    metrics.push({ key: 'programs', label: 'Active Programs', value: activeProgramRows.length, icon: 'programs', href: '/programs',
      hint: programRows.length === 0 ? 'None created yet' : `${readyPrograms} ready to enroll` });
  }
  if (curricula) {
    metrics.push({ key: 'curricula', label: 'Active Curricula', value: curricula.length, icon: 'curricula', href: '/programs',
      hint: curricula.length === 0 ? 'None set up yet' : emptyCurricula.length > 0 ? `${emptyCurricula.length} without subjects` : 'All have subjects',
      tone: emptyCurricula.length > 0 ? 'attention' : 'neutral' });
  }
  if (activeSubjects !== null) {
    metrics.push({ key: 'subjects', label: 'Subjects', value: activeSubjects, icon: 'subjects', href: '/subjects',
      hint: activeSubjects === 0 ? 'Catalogue is empty' : unmapped ? `${unmapped} not mapped` : 'Active subjects' });
  }
  if (apps) {
    metrics.push({ key: 'applications', label: 'Applications', value: apps.waiting, icon: 'applications', href: '/applications',
      hint: apps.waiting > 0 ? 'Awaiting review' : 'None waiting', tone: apps.waiting > 0 ? 'attention' : 'neutral' });
  }
  if (enroll) {
    metrics.push({ key: 'enrollments', label: 'Enrollments', value: enroll.pending, icon: 'enrollment', href: '/enrollments',
      hint: enroll.pending > 0 ? 'Awaiting approval' : `${enroll.enrolled.toLocaleString('en-US')} enrolled`, tone: enroll.pending > 0 ? 'attention' : 'neutral' });
  }
  metrics.push({ key: 'tasks', label: 'Academic Tasks', value: taskTotal, icon: 'tasks',
    hint: taskTotal === 0 ? 'Nothing to coordinate' : `${plural(tasks.length, 'area')} to review`, tone: taskTotal > 0 ? 'attention' : 'success' });

  const progress: WorkProgress[] = [];
  if (programRows && activeProgramRows.length > 0) {
    const configured = activeProgramRows.length - withoutCurriculum.length;
    progress.push({ key: 'curriculum', label: 'Curriculum setup', value: configured, max: activeProgramRows.length, detail: `${configured} of ${plural(activeProgramRows.length, 'active program')} have a curriculum` });
  }
  if (curricula && curricula.length > 0) {
    const mapped = curricula.length - emptyCurricula.length;
    progress.push({ key: 'mapping', label: 'Subject mapping', value: mapped, max: curricula.length, detail: `${mapped} of ${plural(curricula.length, 'active curriculum', 'active curricula')} have subjects` });
  }
  if (activeSubjects && unmapped !== null) {
    const used = activeSubjects - unmapped;
    progress.push({ key: 'catalogue', label: 'Subjects in use', value: used, max: activeSubjects, detail: `${used} of ${plural(activeSubjects, 'active subject')} mapped into a curriculum` });
  }
  if (readiness && activeProgramRows.length > 0) {
    progress.push({ key: 'enrollment', label: 'Enrollment readiness', value: readyPrograms, max: activeProgramRows.length, detail: `${readyPrograms} of ${plural(activeProgramRows.length, 'active program')} ready to enroll into` });
  }

  const activity: ListItem[] = [
    ...recentCurricula.map((c) => ({ id: `curriculum-${c.id}`, title: 'Curriculum created', icon: 'curricula' as const, subtitle: `${c.program.code} · ${c.versionLabel}`, at: c.createdAt!.toISOString(), href: `/curricula/${c.id}` })),
    ...recentSubjects.map((s) => ({ id: `subject-${s.id}`, title: 'Subject added', icon: 'subjects' as const, subtitle: `${s.code} · ${s.title}`, at: s.createdAt!.toISOString(), href: '/subjects' })),
    ...recentMappings.map((m) => ({ id: `mapping-${m.id}`, title: 'Subject mapped', icon: 'subjects' as const, subtitle: `${m.subject.code} → ${m.curriculum.program.code} · ${m.curriculum.versionLabel}`, at: m.createdAt!.toISOString(), href: `/curricula/${m.curriculumId}` })),
    ...(programRows ?? [])
      .filter((p) => p.updatedAt && p.createdAt && p.updatedAt.getTime() - p.createdAt.getTime() > 60_000)
      .map((p) => ({ id: `program-${p.id}`, title: 'Program updated', icon: 'programs' as const, subtitle: `${p.code} · ${p.name}`, at: p.updatedAt!.toISOString(), href: `/programs/${p.id}` })),
  ];

  return {
    kind: 'coordinator',
    metrics,
    tasks,
    readiness,
    progress: programRows ? progress : null,
    activity,
    quickActions: links(user, ['programs', 'subjects', 'applications', 'enrollments']),
    notTracked: ['Instructor assignments', 'Grades', 'Attendance', 'Competencies', 'Assessments'],
  };
}

// --- Secretary -----------------------------------------------------------------------------

/** "Are student records, applications and enrollment processed?" */
export async function secretaryWorkspace(user: AuthUser): Promise<SecretaryWorkspace> {
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const canStudents = studentPolicy.viewAny(user);
  const canApps = applicationPolicy.viewAny(user);
  const canDocs = studentCredentialPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);
  const canPrograms = programPolicy.viewAny(user);

  const [students, registrations, incompleteRecords, apps, newApps, enroll, docs, programRows, appsByProgram, enrollByProgram] = await Promise.all([
    canStudents ? prisma.student.count() : null,
    canStudents ? prisma.student.count({ where: { createdAt: { gte: weekAgo } } }) : null,
    // A record the office cannot contact or identify the student from.
    canStudents ? prisma.student.count({ where: { OR: [{ email: null }, { phone: null }, { dateOfBirth: null }] } }) : null,
    canApps ? applicationStatuses() : null,
    canApps ? prisma.application.count({ where: { createdAt: { gte: weekAgo } } }) : null,
    canEnroll ? enrollmentStatuses() : null,
    canDocs ? credentialStatuses() : null,
    canPrograms && (canApps || canEnroll) ? programs() : null,
    canPrograms && canApps ? prisma.application.groupBy({ by: ['programId', 'status'], _count: { _all: true } }) : null,
    canPrograms && canEnroll
      ? prisma.$queryRaw<{ program_id: bigint; status: string; n: number }[]>`
          SELECT s.program_id, e.status, count(*)::int AS n
          FROM enrollments e JOIN students s ON s.id = e.student_id
          GROUP BY s.program_id, e.status`
      : null,
  ]);

  const metrics: WorkMetric[] = [];
  if (students !== null) {
    metrics.push({ key: 'students', label: 'Total Students', value: students, icon: 'students', href: '/students', hint: students === 0 ? 'No student records yet' : 'Student records' });
  }
  if (newApps !== null) {
    metrics.push({ key: 'new-applications', label: 'New Applications', value: newApps, icon: 'applications', href: '/applications', hint: 'Received in the last 7 days' });
  }
  if (apps) {
    metrics.push({ key: 'pending-applications', label: 'Pending Applications', value: apps.waiting, icon: 'applications', href: '/applications?status=submitted',
      hint: apps.waiting > 0 ? 'Submitted or under review' : 'None waiting', tone: apps.waiting > 0 ? 'attention' : 'neutral' });
  }
  if (enroll) {
    metrics.push({ key: 'pending-enrollment', label: 'Pending Enrollment', value: enroll.pending, icon: 'enrollment', href: '/enrollments?status=pending',
      hint: enroll.pending > 0 ? 'Awaiting approval' : 'None waiting', tone: enroll.pending > 0 ? 'attention' : 'neutral' });
  }
  if (docs) {
    metrics.push({ key: 'documents', label: 'Documents to Review', value: docs.pending, icon: 'documents', href: '/students',
      hint: docs.pending > 0 ? 'Submitted, not yet verified' : 'None waiting', tone: docs.pending > 0 ? 'attention' : 'neutral' });
  }
  if (registrations !== null) {
    metrics.push({ key: 'registrations', label: 'Recent Registrations', value: registrations, icon: 'registrations', href: '/students', hint: 'Students added in the last 7 days' });
  }

  // The work queue shows every stream, clear or not, so the office sees the whole picture.
  const queue: WorkItem[] = [];
  if (apps) queue.push({ key: 'applications', label: 'Applications to Review', description: 'Submitted or under review', count: apps.waiting, href: '/applications?status=submitted', action: 'Open', icon: 'applications' });
  if (enroll) queue.push({ key: 'enrollments', label: 'Enrollment Records', description: 'Awaiting approval', count: enroll.pending, href: '/enrollments?status=pending', action: 'Open', icon: 'enrollment' });
  if (docs) queue.push({ key: 'documents', label: 'Documents to Verify', description: 'Reviewed on each student’s record', count: docs.pending, href: '/students', action: 'Open', icon: 'documents' });
  if (incompleteRecords !== null) queue.push({ key: 'incomplete', label: 'Incomplete Student Records', description: 'Missing email, phone or date of birth', count: incompleteRecords, href: '/students', action: 'Review', icon: 'records' });
  if (registrations !== null) queue.push({ key: 'registrations', label: 'Recent Registrations', description: 'Added in the last 7 days', count: registrations, href: '/students', action: 'View', icon: 'registrations' });

  const pipeline: WorkSegment[] | null = apps
    ? [
        { key: 'submitted', label: 'New', value: apps.submitted, tone: 'info', href: '/applications?status=submitted' },
        { key: 'under_review', label: 'Under Review', value: apps.underReview, tone: 'attention', href: '/applications?status=under_review' },
        { key: 'approved', label: 'Accepted', value: apps.approved, tone: 'success', href: '/applications?status=approved' },
        { key: 'returned', label: 'Returned', value: apps.returned, tone: 'failed', href: '/applications?status=returned' },
      ]
    : null;

  const documents: WorkSegment[] | null = docs
    ? [
        { key: 'verified', label: 'Verified', value: docs.verified, tone: 'success' },
        { key: 'pending', label: 'Pending', value: docs.pending, tone: 'attention' },
        { key: 'returned', label: 'Returned', value: docs.returned, tone: 'failed' },
        { key: 'missing', label: 'Missing', value: docs.missing, tone: 'neutral' },
        ...(docs.expired > 0 ? [{ key: 'expired', label: 'Expired', value: docs.expired, tone: 'failed' as const }] : []),
      ]
    : null;

  let enrollmentByProgram: EnrollmentByProgramRow[] | null = null;
  if (programRows) {
    const rows = new Map<string, EnrollmentByProgramRow>(
      programRows.map((p) => [p.id.toString(), { id: p.id.toString(), name: p.name, code: p.code, applications: 0, approved: 0, enrolled: 0, pending: 0 }]),
    );
    for (const a of appsByProgram ?? []) {
      const r = rows.get(a.programId.toString());
      if (!r) continue;
      r.applications += a._count._all;
      if (a.status === 'approved') r.approved += a._count._all;
    }
    for (const e of enrollByProgram ?? []) {
      const r = rows.get(e.program_id.toString());
      if (!r) continue;
      if (e.status === 'enrolled') r.enrolled += Number(e.n);
      if (e.status === 'pending') r.pending += Number(e.n);
    }
    const active = new Set(programRows.filter((p) => p.isActive).map((p) => p.id.toString()));
    enrollmentByProgram = [...rows.values()]
      // Active programs, and any inactive one that still has records.
      .filter((r) => active.has(r.id) || r.applications + r.enrolled + r.pending > 0)
      .sort((a, b) => b.applications - a.applications || b.enrolled - a.enrolled || a.code.localeCompare(b.code))
      .slice(0, 8);
  }

  return {
    kind: 'secretary',
    metrics,
    queue,
    pipeline,
    enrollmentByProgram,
    documents,
    activity: [],
    quickActions: links(user, ['addStudent', 'applications', 'enrollments', 'students']),
    notTracked: [],
  };
}
