import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { classSessions } from '@/server/services/teaching/attendance';
import { queryId, yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Attendance Records — every meeting of a class, with its counts. */

export async function loadTeachingAttendanceRecords({ query }: PageRequest) {
  const sp = query;
  const ctx = await yearPage(teachingPolicy.teach, sp.year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);
  const picked = classes.find((c) => c.id === queryId(sp.class)) ?? classes[0] ?? null;
  const data = picked ? await classSessions(ctx.user, picked.id) : null;

  return { classes, ctx, data, picked };
}
