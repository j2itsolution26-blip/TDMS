import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  SEMESTER_LABELS,
  formatClock,
  meetingState,
  schoolYearDisplay,
  yearLevelLabel,
  type MeetingState,
} from '@/lib/teaching';
import { dateColumnValue, formatLocalDate, localDayKey, localMinutes, localWeekday } from '@/lib/institution-time';
import type { AuthUser } from '@/types/domain';
import { actorLabel } from '@/server/services/audit-log';
import { describeEvent } from '@/lib/audit-events';
import { instructorClasses } from './access';
import { getActiveSchoolYear } from './school-years';

/**
 * The Diploma Instructor dashboard: one server call, a fixed number of
 * queries regardless of how many classes or students there are. Counts come
 * from count/groupBy, never from loading lists to measure them.
 */

export interface TodayClass {
  classId: string;
  subject: string;
  program: string;
  yearLevel: string;
  section: string;
  time: string;
  startTime: string;
  endTime: string;
  room: string | null;
  students: number;
  state: MeetingState;
  attendance: { sessionId: string; status: string; present: number; late: number; absent: number } | null;
}

export async function instructorDashboard(user: AuthUser, now = new Date()) {
  const year = await getActiveSchoolYear();
  const today = localDayKey(now);
  const weekday = localWeekday(now);
  const minutes = localMinutes(now);
  const classes = year ? await instructorClasses(user, year.id) : [];
  const semesterClasses = classes.filter((c) => c.semester === year?.currentSemester);
  const classIds = classes.map((c) => c.id);
  const sectionIds = [...new Set(classes.map((c) => c.sectionId))];
  const userId = BigInt(user.id);

  const [rosterCounts, students, todaySessions, assessments, docs, supports, recentSupports, absences, activity] = await Promise.all([
    sectionIds.length
      ? prisma.sectionStudent.groupBy({ by: ['sectionId'], where: { sectionId: { in: sectionIds } }, _count: { _all: true } })
      : [],
    sectionIds.length
      ? prisma.sectionStudent.findMany({ where: { sectionId: { in: sectionIds } }, distinct: ['studentId'], select: { studentId: true } })
      : [],
    classIds.length
      ? prisma.attendanceSession.findMany({
          where: { classId: { in: classIds }, meetingDate: dateColumnValue(today) },
          select: { id: true, classId: true, startTime: true, status: true, records: { select: { status: true } } },
        })
      : [],
    classIds.length
      ? prisma.assessment.findMany({
          where: { classId: { in: classIds }, scoreStatus: { not: 'RELEASED' } },
          select: { id: true, kind: true, closesAt: true, published: true, scoreStatus: true },
        })
      : [],
    classIds.length
      ? prisma.academicDocument.groupBy({ by: ['kind', 'status'], where: { classId: { in: classIds } }, _count: { _all: true } })
      : [],
    classIds.length ? prisma.learningSupport.count({ where: { classId: { in: classIds }, status: { not: 'RESOLVED' } } }) : 0,
    classIds.length
      ? prisma.learningSupport.findMany({
          where: { classId: { in: classIds } },
          orderBy: { updatedAt: 'desc' },
          take: 4,
          select: { id: true, status: true, followUpOn: true, updatedAt: true, student: { select: { firstName: true, lastName: true } }, class: { select: { subject: { select: { title: true } } } } },
        })
      : [],
    classIds.length
      ? prisma.attendanceRecord.groupBy({
          by: ['studentId'],
          where: { status: 'ABSENT', session: { classId: { in: classIds } } },
          _count: { _all: true },
          having: { studentId: { _count: { gte: 3 } } },
          orderBy: { _count: { studentId: 'desc' } },
          take: 5,
        })
      : [],
    prisma.auditLog.findMany({ where: { actor: actorLabel(user) }, orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);

  const roster = new Map(rosterCounts.map((r) => [r.sectionId.toString(), r._count._all]));

  // --- Today's classes: this semester's schedules falling on today's weekday.
  const todayClasses: TodayClass[] = semesterClasses
    .flatMap((c) =>
      c.schedules
        .filter((s) => s.dayOfWeek === weekday)
        .map((s) => {
          const session = todaySessions.find((t) => t.classId === c.id && t.startTime === s.startTime);
          const count = (st: string) => session?.records.filter((r) => r.status === st).length ?? 0;
          return {
            classId: c.id.toString(),
            subject: c.subject.title,
            program: c.section.program.name,
            yearLevel: yearLevelLabel(c.section.yearLevel),
            section: c.section.name,
            time: `${formatClock(s.startTime)} – ${formatClock(s.endTime)}`,
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.room ?? c.room,
            students: roster.get(c.sectionId.toString()) ?? 0,
            state: meetingState(s.startTime, s.endTime, minutes),
            attendance: session
              ? { sessionId: session.id.toString(), status: session.status, present: count('PRESENT'), late: count('LATE'), absent: count('ABSENT') }
              : null,
          };
        }),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const todayRecords = todaySessions.flatMap((s) => s.records);
  const attendanceToday = {
    present: todayRecords.filter((r) => r.status === 'PRESENT').length,
    late: todayRecords.filter((r) => r.status === 'LATE').length,
    absent: todayRecords.filter((r) => r.status === 'ABSENT').length,
    excused: todayRecords.filter((r) => r.status === 'EXCUSED').length,
    expected: todayClasses.reduce((s, c) => s + c.students, 0),
  };

  // Work waiting on the Instructor.
  const closed = (a: (typeof assessments)[number]) => a.scoreStatus === 'DRAFT' && a.published && a.closesAt !== null && a.closesAt <= now;
  const toCheck = (kind: string) => assessments.filter((a) => a.kind === kind && closed(a)).length;
  const docCount = (kind: string) => docs.filter((d) => d.kind === kind && (d.status === 'DRAFT' || d.status === 'RETURNED')).reduce((s, d) => s + d._count._all, 0);
  const pendingActivities = assessments.filter((a) => a.scoreStatus !== 'RELEASED').length;
  const pendingGrades = semesterClasses.filter((c) => c.gradeStatus !== 'RELEASED').length;

  const concernIds = absences.map((a) => a.studentId);
  const concernStudents = concernIds.length
    ? await prisma.student.findMany({ where: { id: { in: concernIds } }, select: { id: true, firstName: true, lastName: true, studentNumber: true } })
    : [];

  const subjects = new Set(semesterClasses.map((c) => c.subjectId.toString()));
  const liveClass = todayClasses.find((c) => c.state === 'LIVE') ?? todayClasses.find((c) => c.state === 'UPCOMING') ?? null;

  return {
    context: {
      schoolYear: year ? schoolYearDisplay(year.label) : null,
      semester: year ? SEMESTER_LABELS[year.currentSemester] ?? `Semester ${year.currentSemester}` : null,
      date: formatLocalDate(now),
      current: liveClass ? { subject: liveClass.subject, detail: `${liveClass.program} · ${liveClass.yearLevel} · Section ${liveClass.section}`, time: liveClass.time, live: liveClass.state === 'LIVE' } : null,
    },
    kpis: {
      subjects: subjects.size,
      students: students.length,
      todayClasses: todayClasses.length,
      attendanceToday,
      pendingActivities,
      pendingGrades,
    },
    todayClasses,
    pendingWork: [
      { key: 'grades', label: 'Grades to enter', description: 'Classes whose grades are not yet released', count: pendingGrades, href: '/teaching/gradebook', action: 'Open' },
      { key: 'quizzes', label: 'Quizzes to check', description: 'Closed quizzes with results still in draft', count: toCheck('QUIZ'), href: '/teaching/quizzes', action: 'Check' },
      { key: 'exams', label: 'Exams to check', description: 'Closed examinations with results still in draft', count: toCheck('EXAM'), href: '/teaching/exams', action: 'Check' },
      { key: 'lesson-plans', label: 'Lesson plans to submit', description: 'Drafts and returned lesson plans', count: docCount('LESSON_PLAN'), href: '/teaching/documents/lesson-plans', action: 'Submit' },
      { key: 'tos', label: 'TOS to submit', description: 'Drafts and returned tables of specifications', count: docCount('TOS'), href: '/teaching/documents/tos', action: 'Submit' },
      { key: 'pt', label: 'PT to submit', description: 'Drafts and returned performance task documents', count: docCount('PT'), href: '/teaching/documents/pt', action: 'Submit' },
    ],
    support: {
      open: supports,
      recent: recentSupports.map((r) => ({
        id: r.id.toString(),
        student: `${r.student.firstName} ${r.student.lastName}`,
        subject: r.class.subject.title,
        status: r.status,
        followUpOn: r.followUpOn ? r.followUpOn.toISOString().slice(0, 10) : null,
      })),
      attendanceConcerns: absences.map((a) => {
        const s = concernStudents.find((x) => x.id === a.studentId);
        return { studentId: a.studentId.toString(), name: s ? `${s.firstName} ${s.lastName}` : 'Student', studentNumber: s?.studentNumber ?? '', absences: a._count._all };
      }),
    },
    activity: activity.map((a) => ({
      id: a.id.toString(),
      title: describeEvent(a.action).label,
      subtitle: a.target,
      at: a.createdAt.toISOString(),
    })),
  };
}

export type InstructorDashboardData = Awaited<ReturnType<typeof instructorDashboard>>;
