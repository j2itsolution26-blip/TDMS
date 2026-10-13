import { prisma } from '@/server/lib/prisma';
import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { yearPage } from '@/server/services/teaching/page-context';
import { dateColumnKey, localDayKey, localWeekday } from '@shared/lib/institution-time';
import type { PageRequest } from '@/server/controllers/pages/types';

/** QR Attendance — start (or resume) a class meeting's attendance, then scan. */

export async function loadTeachingAttendance({ query }: PageRequest) {
  const sp = query;
  const ctx = await yearPage(teachingPolicy.teach, sp.year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);
  const now = new Date();
  const weekday = localWeekday(now);
  const time = (v?: string) => (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

  const open = classes.length
    ? await prisma.attendanceSession.findMany({
        where: { classId: { in: classes.map((c) => c.id) }, status: 'OPEN' },
        orderBy: [{ meetingDate: 'desc' }, { startTime: 'asc' }],
        include: { _count: { select: { records: true } } },
      })
    : [];
  const byId = new Map(classes.map((c) => [c.id.toString(), c]));

  return { byId, classes, ctx, now, open, sp, time, weekday };
}
