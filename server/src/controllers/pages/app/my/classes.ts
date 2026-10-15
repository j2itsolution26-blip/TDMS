import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { prisma } from '@/server/lib/prisma';
import { requireStudentRecord } from '@/server/services/teaching/access';
import { orNotFound } from '@/server/services/teaching/page-context';
import { DAY_SHORT, formatClock, sectionLabel } from '@shared/lib/teaching';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * My Classes — the signed-in student's own timetable: the ACTIVE classes of
 * the section they are placed in, for each school year they have a section.
 * A student is in a class through their section, so this is exactly what
 * attendance and the gradebook already treat as their classes. Nothing about
 * other students is sent.
 */
export async function loadMyClasses({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const student = await orNotFound(requireStudentRecord(user));

  const rows = await prisma.sectionStudent.findMany({
    where: { studentId: student.id },
    select: {
      section: {
        select: {
          id: true, name: true, yearLevel: true,
          program: { select: { code: true, name: true } },
          schoolYear: { select: { id: true, label: true, status: true, currentSemester: true, startsOn: true } },
        },
      },
    },
  });
  // Newest school year first.
  const placements = rows
    .map((r) => ({ section: r.section, schoolYear: r.section.schoolYear }))
    .sort((a, b) => b.schoolYear.startsOn.getTime() - a.schoolYear.startsOn.getTime());
  if (placements.length === 0) return { placement: null, years: [], classes: [] };

  // The year asked for, else the active one, else the newest.
  const chosen = placements.find((p) => p.schoolYear.id.toString() === query.year)
    ?? placements.find((p) => p.schoolYear.status === 'ACTIVE')
    ?? placements[0]!;

  const classes = await prisma.classOffering.findMany({
    where: { sectionId: chosen.section.id, status: 'ACTIVE' },
    orderBy: [{ semester: 'asc' }, { subject: { code: 'asc' } }],
    select: {
      id: true,
      semester: true,
      subject: { select: { code: true, title: true, subjectType: true } },
      instructor: { select: { name: true } },
      roomRef: { select: { code: true, name: true } },
      room: true,
      curriculumSubject: { select: { units: true } },
      schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }], select: { dayOfWeek: true, startTime: true, endTime: true, room: true, roomRef: { select: { code: true } } } },
    },
  });

  return {
    placement: {
      section: sectionLabel(chosen.section.program.code, chosen.section.yearLevel, chosen.section.name),
      program: chosen.section.program.name,
      schoolYear: chosen.schoolYear.label,
      schoolYearId: chosen.schoolYear.id.toString(),
      currentSemester: chosen.schoolYear.currentSemester,
    },
    years: placements.map((p) => ({ id: p.schoolYear.id.toString(), label: p.schoolYear.label })),
    classes: classes.map((c) => ({
      id: c.id.toString(),
      semester: c.semester,
      code: c.subject.code,
      title: c.subject.title,
      type: c.subject.subjectType,
      units: c.curriculumSubject?.units.toNumber() ?? null,
      instructor: c.instructor?.name ?? null,
      room: c.roomRef?.code ?? c.room ?? null,
      meetings: c.schedules.map((m) => ({
        dayOfWeek: m.dayOfWeek,
        startTime: m.startTime,
        endTime: m.endTime,
        text: `${DAY_SHORT[m.dayOfWeek]} ${formatClock(m.startTime)}–${formatClock(m.endTime)}`,
        room: m.roomRef?.code ?? m.room ?? c.roomRef?.code ?? c.room ?? null,
      })),
    })),
  };
}
