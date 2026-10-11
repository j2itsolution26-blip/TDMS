import { prisma } from '@/server/lib/prisma';
import { USER_MODEL_TYPE } from '@/server/auth/rbac';
import { studentName } from '@shared/lib/teaching-labels';
import { batchTotals, combineTotals } from '@shared/lib/assessment-center';

/** Choices for the Assessment Center forms, and the manager's dashboard figures. */

async function usersWithRoles(roles: string[]) {
  const rows = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, role: { name: { in: roles }, guardName: 'web' } },
    select: { modelId: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.modelId))] }, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return users.map((u) => ({ id: u.id.toString(), name: u.name }));
}

/** Who can be picked as an assessor or trainer: Diploma Instructors and Assessment Center Managers. */
export const assessorOptions = () => usersWithRoles(['teacher', 'assessment_center_manager']);

/** Who can be named responsible for an activity: staff, not students. */
export const staffOptions = () => usersWithRoles(['admin', 'director', 'coordinator', 'secretary', 'teacher', 'assessment_center_manager']);

export async function qualificationOptions() {
  const rows = await prisma.program.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, isActive: true } });
  return rows.map((p) => ({ id: p.id.toString(), code: p.code, name: p.name, isActive: p.isActive }));
}

/** Students of one qualification, for enrolling into a batch. */
export async function searchCandidates(programId: bigint, q: string) {
  const words = q.split(/\s+/).filter(Boolean);
  const rows = await prisma.student.findMany({
    where: {
      programId,
      status: { notIn: ['dropped', 'archived', 'inactive'] },
      AND: words.map((w) => ({ OR: [{ studentNumber: { contains: w, mode: 'insensitive' as const } }, { firstName: { contains: w, mode: 'insensitive' as const } }, { lastName: { contains: w, mode: 'insensitive' as const } }] })),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 50,
    select: { id: true, studentNumber: true, firstName: true, middleName: true, lastName: true, yearLevel: true, status: true },
  });
  return rows.map((s) => ({ id: s.id.toString(), candidateId: s.studentNumber, name: studentName(s), yearLevel: s.yearLevel, status: s.status }));
}

/** The manager's dashboard: work in progress, the finalized record, and what is coming up. */
export async function assessmentDashboard(now = new Date()) {
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const [open, finalized, pendingResults, draftResults, upcoming, recent, allResults] = await Promise.all([
    prisma.assessmentBatch.count({ where: { status: 'OPEN' } }),
    prisma.assessmentBatch.count({ where: { status: 'FINALIZED' } }),
    prisma.assessmentResult.count({ where: { status: 'PENDING' } }),
    prisma.assessmentResult.count({ where: { status: 'DRAFT' } }),
    prisma.trainingActivity.findMany({
      where: { endsAt: { gte: now }, startsAt: { lte: in14 }, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
      take: 6,
      select: { id: true, title: true, activityType: true, startsAt: true, endsAt: true, venue: true, status: true },
    }),
    prisma.assessmentBatch.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: [{ assessmentDate: 'desc' }, { batchNumber: 'asc' }],
      take: 6,
      select: { id: true, batchNumber: true, assessmentDate: true, status: true, assessorName: true, program: { select: { code: true } } },
    }),
    prisma.assessmentResult.findMany({ where: { batch: { status: { not: 'CANCELLED' } } }, select: { batchId: true, studentId: true, attempt: true, status: true, result: true } }),
  ]);

  const byBatch = new Map<string, { studentId: string; attempt: number; status: string; result: string | null }[]>();
  for (const r of allResults) {
    const k = r.batchId.toString();
    byBatch.set(k, [...(byBatch.get(k) ?? []), { studentId: r.studentId.toString(), attempt: r.attempt, status: r.status, result: r.result }]);
  }
  const perBatch = new Map([...byBatch].map(([k, rows]) => [k, batchTotals(rows)]));

  return {
    counts: { openBatches: open, finalizedBatches: finalized, awaitingResults: pendingResults, awaitingFinalization: draftResults },
    overall: combineTotals([...perBatch.values()]),
    upcoming: upcoming.map((a) => ({ ...a, id: a.id.toString(), startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString() })),
    recent: recent.map((b) => ({
      id: b.id.toString(),
      batchNumber: b.batchNumber,
      qualification: b.program.code,
      assessmentDate: b.assessmentDate.toISOString().slice(0, 10),
      status: b.status,
      assessorName: b.assessorName,
      totals: perBatch.get(b.id.toString()) ?? batchTotals([]),
    })),
  };
}
