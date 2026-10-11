import { prisma } from '@/server/lib/prisma';
import { USER_MODEL_TYPE } from '@/server/auth/rbac';
import { ROLE_LABELS, type RoleName } from '@shared/types/domain';
import { localDayKey, dateColumnValue } from '@shared/lib/institution-time';
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@shared/lib/assessment-center';
import { suppliesSummary } from './supplies';

/**
 * The institutional monitoring panel, as the function and role document
 * gives it to the TVET Director — and, "same dashboard", to the Admin:
 *
 *   staff, instructors and students, active and deactivated; dropped
 *   students; present and absent; upcoming assessments and activities;
 *   per course; inventory.
 *
 * Counts only — no class records, grades or personal data, which neither
 * dashboard may show. Scholarship figures are not here: nothing records
 * scholarships yet (see docs/pdf-requirements-traceability.md).
 */

const STAFF_ROLES = ['director', 'coordinator', 'secretary', 'teacher', 'assessment_center_manager', 'processing_officer'] as const;
const DAY = 24 * 60 * 60 * 1000;

async function staffByRole() {
  const rows = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, role: { name: { in: [...STAFF_ROLES] }, guardName: 'web' } },
    select: { modelId: true, role: { select: { name: true } } },
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.modelId))] } }, select: { id: true, status: true } });
  const status = new Map(users.map((u) => [u.id.toString(), u.status]));
  const roles = STAFF_ROLES.map((role) => {
    const mine = rows.filter((r) => r.role.name === role).map((r) => status.get(r.modelId.toString()));
    return { role, label: ROLE_LABELS[role as RoleName], active: mine.filter((s) => s === 'ACTIVE').length, deactivated: mine.filter((s) => s && s !== 'ACTIVE').length };
  });
  const everyone = [...status.values()];
  return {
    roles,
    staff: { active: everyone.filter((s) => s === 'ACTIVE').length, deactivated: everyone.filter((s) => s !== 'ACTIVE').length },
  };
}

async function attendance(now: Date) {
  const today = dateColumnValue(localDayKey(now));
  const monthAgo = new Date(today.getTime() - 29 * DAY);
  const [day, month] = await Promise.all([
    prisma.attendanceRecord.groupBy({ by: ['status'], where: { session: { meetingDate: today } }, _count: { _all: true } }),
    prisma.attendanceRecord.groupBy({ by: ['status'], where: { session: { meetingDate: { gte: monthAgo, lte: today } } }, _count: { _all: true } }),
  ]);
  const shape = (rows: { status: string; _count: { _all: number } }[]) => {
    const get = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    return { present: get('PRESENT'), late: get('LATE'), absent: get('ABSENT'), excused: get('EXCUSED') };
  };
  return { today: shape(day), last30Days: shape(month) };
}

export async function institutionMonitoring(now = new Date()) {
  const todayKey = localDayKey(now);
  const today = dateColumnValue(todayKey);
  const in30 = new Date(today.getTime() + 30 * DAY);
  const in14 = new Date(now.getTime() + 14 * DAY);

  const [staff, students, perProgram, programs, presence, batches, activities, events, supplies] = await Promise.all([
    staffByRole(),
    prisma.student.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.student.groupBy({ by: ['programId', 'status'], _count: { _all: true } }),
    prisma.program.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    attendance(now),
    prisma.assessmentBatch.findMany({
      where: { status: 'OPEN', assessmentDate: { gte: today, lte: in30 } },
      orderBy: { assessmentDate: 'asc' },
      take: 8,
      select: { id: true, batchNumber: true, assessmentDate: true, assessorName: true, program: { select: { code: true } }, _count: { select: { results: { where: { status: { not: 'CANCELLED' } } } } } },
    }),
    prisma.trainingActivity.findMany({
      where: { status: { not: 'CANCELLED' }, endsAt: { gte: now }, startsAt: { lte: in14 } },
      orderBy: { startsAt: 'asc' },
      take: 8,
      select: { id: true, title: true, activityType: true, startsAt: true, venue: true },
    }),
    prisma.calendarEvent.findMany({
      where: { endsOn: { gte: today }, startsOn: { lte: new Date(today.getTime() + 14 * DAY) } },
      orderBy: { startsOn: 'asc' },
      take: 8,
      select: { id: true, title: true, type: true, startsOn: true, endsOn: true },
    }),
    suppliesSummary(),
  ]);

  const count = (status: string) => students.find((s) => s.status === status)?._count._all ?? 0;
  const studentTotal = students.reduce((n, s) => n + s._count._all, 0);
  const instructors = staff.roles.find((r) => r.role === 'teacher')!;

  return {
    staff: staff.staff,
    instructors: { active: instructors.active, deactivated: instructors.deactivated },
    staffByRole: staff.roles,
    students: {
      total: studentTotal,
      active: count('active'),
      dropped: count('dropped'),
      deactivated: count('inactive') + count('archived'),
      transferred: count('transferred'),
      graduated: count('graduated'),
    },
    attendance: presence,
    perCourse: programs.map((p) => {
      const mine = perProgram.filter((g) => g.programId === p.id);
      const n = (status: string) => mine.find((g) => g.status === status)?._count._all ?? 0;
      return { id: p.id.toString(), code: p.code, name: p.name, active: n('active'), dropped: n('dropped'), total: mine.reduce((t, g) => t + g._count._all, 0) };
    }),
    upcomingAssessments: batches.map((b) => ({
      id: b.id.toString(),
      batchNumber: b.batchNumber,
      qualification: b.program.code,
      date: b.assessmentDate.toISOString().slice(0, 10),
      assessorName: b.assessorName,
      candidates: b._count.results,
    })),
    upcomingActivities: [
      ...activities.map((a) => ({ id: `t${a.id}`, title: a.title, kind: ACTIVITY_TYPE_LABELS[a.activityType as ActivityType] ?? a.activityType, when: a.startsAt.toISOString(), allDay: false, detail: a.venue, href: '/assessment/calendar' })),
      ...events.map((e) => ({ id: `c${e.id}`, title: e.title, kind: 'School calendar', when: e.startsOn.toISOString(), allDay: true, detail: null as string | null, href: '/calendar' })),
    ].sort((a, b) => a.when.localeCompare(b.when)).slice(0, 10),
    supplies,
    today: todayKey,
  };
}
export type InstitutionMonitoring = Awaited<ReturnType<typeof institutionMonitoring>>;
