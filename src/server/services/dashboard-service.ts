import 'server-only';
import { prisma } from '@/lib/prisma';
import type { AuthUser } from '@/types/domain';
import {
  studentPolicy,
  programPolicy,
  userPolicy,
  applicationPolicy,
  studentCredentialPolicy,
  isSuperAdmin,
} from '@/server/auth/policies';

/**
 * Port of the dashboard Volt component's with().
 *
 * Every figure stays gated by the same policy that gated it in Laravel: a
 * role that could not see a number before still cannot, and the query is
 * not even issued for them (the Blade passed `null` in exactly these
 * cases). That keeps the dashboard cheap for narrow roles as well as
 * correct — a student triggers two queries here, not fifteen.
 */

export interface DashboardStats {
  totalStudents: number | null;
  totalStudentsNew: number | null;
  programs: number | null;
  programsNew: number | null;
  staff: number | null;
  staffNew: number | null;
  activeApplications: number | null;
  activeApplicationsLastWeek: number | null;
  pendingApplications: number | null;
  enrolledStudents: number | null;
  credentialsToReview: number | null;
}

export interface DashboardData {
  greeting: string;
  today: string;
  student: {
    id: string;
    yearLevel: number;
    status: string;
    program: { name: string } | null;
  } | null;
  mySubjects: {
    id: string;
    semester: number;
    units: number;
    subject: { code: string; title: string };
  }[];
  canViewStudents: boolean;
  canViewPrograms: boolean;
  canViewStaff: boolean;
  canViewApplications: boolean;
  isSuperAdmin: boolean;
  stats: DashboardStats;
  applicationBreakdown: { approved: number; submitted: number; returned: number } | null;
  recentActivity: { id: string; action: string; actor: string; target: string; createdAt: string }[];
  systemHealth: { database: boolean; storageUsedPercent: number | null } | null;
}

/** match(true) on the current hour, as the Laravel greeting() did. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatToday(now = new Date()): string {
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function getDashboardData(user: AuthUser): Promise<DashboardData> {
  const canViewStudents = studentPolicy.viewAny(user);
  const canViewPrograms = programPolicy.viewAny(user);
  const canViewStaff = userPolicy.viewAny(user);
  const canViewApplications = applicationPolicy.viewAny(user);
  const canReviewCredentials = studentCredentialPolicy.viewAny(user);
  const superAdmin = isSuperAdmin(user);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const userId = BigInt(user.id);

  // Eloquent's hasOne resolved to the first matching row.
  const student = await prisma.student.findFirst({
    where: { userId },
    include: { program: { select: { name: true } } },
  });

  const mySubjects = student
    ? await prisma.curriculumSubject.findMany({
        where: { curriculumId: student.curriculumId, yearLevel: student.yearLevel },
        include: { subject: { select: { code: true, title: true } } },
        orderBy: { semester: 'asc' },
      })
    : [];

  const [
    totalStudents,
    totalStudentsNew,
    programs,
    programsNew,
    staff,
    staffNew,
    activeApplications,
    activeApplicationsLastWeek,
    pendingApplications,
    enrolledStudents,
    credentialsToReview,
  ] = await Promise.all([
    canViewStudents ? prisma.student.count() : null,
    canViewStudents ? prisma.student.count({ where: { createdAt: { gte: weekAgo } } }) : null,
    canViewPrograms ? prisma.program.count() : null,
    canViewPrograms ? prisma.program.count({ where: { createdAt: { gte: weekAgo } } }) : null,
    canViewStaff ? countNonStudentUsers() : null,
    canViewStaff ? countNonStudentUsers(weekAgo) : null,
    canViewApplications
      ? prisma.application.count({ where: { status: { in: ['submitted', 'returned'] } } })
      : null,
    canViewApplications
      ? prisma.application.count({
          where: { status: { in: ['submitted', 'returned'] }, createdAt: { lt: weekAgo } },
        })
      : null,
    canViewApplications ? prisma.application.count({ where: { status: 'submitted' } }) : null,
    canViewStudents ? prisma.student.count({ where: { status: 'active' } }) : null,
    canReviewCredentials
      ? prisma.studentCredential.count({ where: { status: 'submitted' } })
      : null,
  ]);

  const applicationBreakdown = canViewApplications
    ? {
        approved: await prisma.application.count({ where: { status: 'approved' } }),
        submitted: await prisma.application.count({ where: { status: 'submitted' } }),
        returned: await prisma.application.count({ where: { status: 'returned' } }),
      }
    : null;

  const recentActivity = canViewStaff
    ? (
        await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 6 })
      ).map((a) => ({
        id: a.id.toString(),
        action: a.action,
        actor: a.actor,
        target: a.target,
        createdAt: a.createdAt.toISOString(),
      }))
    : [];

  return {
    greeting: greeting(),
    today: formatToday(),
    student: student
      ? {
          id: student.id.toString(),
          yearLevel: student.yearLevel,
          status: student.status,
          program: student.program ? { name: student.program.name } : null,
        }
      : null,
    mySubjects: mySubjects.map((cs) => ({
      id: cs.id.toString(),
      semester: cs.semester,
      units: cs.units.toNumber(),
      subject: { code: cs.subject.code, title: cs.subject.title },
    })),
    canViewStudents,
    canViewPrograms,
    canViewStaff,
    canViewApplications,
    isSuperAdmin: superAdmin,
    stats: {
      totalStudents,
      totalStudentsNew,
      programs,
      programsNew,
      staff,
      staffNew,
      activeApplications,
      activeApplicationsLastWeek,
      pendingApplications,
      enrolledStudents,
      credentialsToReview,
    },
    applicationBreakdown,
    recentActivity,
    systemHealth: superAdmin ? await systemHealth() : null,
  };
}

/** whereHas('roles', name != 'student') — staff headcount. */
async function countNonStudentUsers(since?: Date): Promise<number> {
  const rows = await prisma.modelHasRole.findMany({
    where: {
      modelType: 'App\\Models\\User',
      role: { name: { not: 'student' } },
    },
    select: { modelId: true },
  });
  const ids = [...new Set(rows.map((r) => r.modelId))];
  if (ids.length === 0) return 0;

  return prisma.user.count({
    where: { id: { in: ids }, ...(since ? { createdAt: { gte: since } } : {}) },
  });
}

/**
 * The Laravel version reported local disk usage via disk_free_space().
 * On Vercel the filesystem is an ephemeral, read-only-ish /tmp whose size
 * says nothing about the application's health, so storage is reported as
 * unavailable (null) rather than as a misleading number. The database probe
 * is kept because it is the check that actually matters.
 */
async function systemHealth(): Promise<{ database: boolean; storageUsedPercent: number | null }> {
  let database = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = false;
  }
  return { database, storageUsedPercent: null };
}
