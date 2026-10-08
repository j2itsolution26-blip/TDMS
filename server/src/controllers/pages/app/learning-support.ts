import { teachingPolicy } from '@/server/auth/policies';
import { monitoredLearningSupports } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Learning Support — the Director and Coordinator monitor interventions across classes. */

export async function loadLearningSupport({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.monitorLearningSupport, year);
  const rows = await monitoredLearningSupports(ctx.user, { schoolYearId: ctx.yearId });
  const today = new Date().toISOString().slice(0, 10);
  const open = rows.filter((r) => r.status === 'OPEN').length;
  const progress = rows.filter((r) => r.status === 'IN_PROGRESS').length;
  const overdue = rows.filter((r) => r.status !== 'RESOLVED' && r.followUpOn && r.followUpOn < today).length;

  return { ctx, open, overdue, progress, rows };
}
