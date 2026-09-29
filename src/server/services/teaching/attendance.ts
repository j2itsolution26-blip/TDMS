import 'server-only';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import {
  ATTENDANCE_STATUS_LABELS,
  MIN_TIME_OUT_GAP_MS,
  arrivalStatus,
  formatClock,
  type AttendanceStatus,
} from '@/lib/teaching';
import {
  dateColumnKey,
  dateColumnValue,
  formatLocalClock,
  formatLocalDate,
  localDayKey,
  localMinutes,
} from '@/lib/institution-time';
import type { AuthUser } from '@/types/domain';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { openSessionSchema } from '@/server/validation/teaching';
import { classHeading, classRoster, requireInstructor, requireInstructorClass, requireRosterStudent, studentName } from './access';
import { notifyStudents } from './notifications';

/**
 * QR attendance.
 *
 *   open session → scan → scan → … → close
 *
 * A scan identifies the student by the opaque token in their QR (or a typed
 * student number when a card will not read), proves they are on this class's
 * roster, and then:
 *
 *   no record yet          TIME IN   — PRESENT, or LATE past the grace period
 *   in, not out            TIME OUT  — if at least two minutes have passed;
 *                                      a quicker second scan is "already in"
 *   in and out             nothing   — "attendance already complete"
 *
 * The unique (session, student) index is the real duplicate guard: two scans
 * racing each other cannot make two rows, and the loser is answered from the
 * row the winner wrote. Closing a session marks everyone not scanned ABSENT.
 */

async function requireOwnSession(user: AuthUser, sessionId: bigint, options: { write?: boolean } = {}) {
  requireInstructor(user);
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId }, select: { id: true, classId: true } });
  if (!session) throw new NotFoundError('Attendance session not found.');
  const cls = await requireInstructorClass(user, session.classId, options);
  const full = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
  return { session: full, cls };
}

export async function openSession(user: AuthUser, input: z.output<typeof openSessionSchema>, context?: AuditContext) {
  const cls = await requireInstructorClass(user, input.classId, { write: true });
  const meetingDate = dateColumnValue(input.meetingDate);

  const existing = await prisma.attendanceSession.findFirst({
    where: { classId: cls.id, meetingDate, startTime: input.startTime },
  });
  if (existing) {
    // Re-opening the same meeting resumes it; its records are kept.
    if (existing.status === 'CLOSED') {
      await prisma.attendanceSession.update({ where: { id: existing.id }, data: { status: 'OPEN', closedAt: null } });
      await recordAudit({ action: 'ATTENDANCE_SESSION_REOPENED', actor: actorLabel(user), target: `${cls.subject.title} ${input.meetingDate}`, context });
    }
    return existing;
  }

  const session = await prisma.attendanceSession.create({
    data: {
      classId: cls.id,
      meetingDate,
      startTime: input.startTime,
      endTime: input.endTime,
      lateAfterMinutes: input.lateAfterMinutes,
      status: 'OPEN',
      openedBy: BigInt(user.id),
    },
  });
  await recordAudit({
    action: 'ATTENDANCE_SESSION_OPENED',
    actor: actorLabel(user),
    target: `${cls.subject.title} — ${classHeading(cls).detail}`,
    details: { date: input.meetingDate, time: `${input.startTime}-${input.endTime}` },
    context,
  });
  return session;
}

// --- The live view -------------------------------------------------------------------

export interface AttendanceCounts {
  roster: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  notYet: number;
}

export async function sessionView(user: AuthUser, sessionId: bigint) {
  const { session, cls } = await requireOwnSession(user, sessionId);
  const [roster, records] = await Promise.all([
    classRoster(cls.sectionId),
    prisma.attendanceRecord.findMany({ where: { sessionId } }),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId.toString(), r]));

  const rows = roster.map((s) => {
    const r = byStudent.get(s.id.toString());
    return {
      studentId: s.id.toString(),
      studentNumber: s.studentNumber,
      name: studentName(s),
      status: (r?.status ?? null) as AttendanceStatus | null,
      timeIn: r?.timeIn ? formatLocalClock(r.timeIn) : null,
      timeOut: r?.timeOut ? formatLocalClock(r.timeOut) : null,
      method: r?.method ?? null,
    };
  });

  return {
    session: {
      id: session.id.toString(),
      status: session.status,
      date: dateColumnKey(session.meetingDate),
      dateLabel: formatLocalDate(new Date(`${dateColumnKey(session.meetingDate)}T12:00:00Z`), 'UTC'),
      time: `${formatClock(session.startTime)} – ${formatClock(session.endTime)}`,
      lateAfterMinutes: session.lateAfterMinutes,
    },
    cls: { id: cls.id.toString(), ...classHeading(cls), archived: cls.schoolYear.status === 'ARCHIVED' },
    counts: countOf(rows.map((r) => r.status), roster.length),
    rows,
  };
}

function countOf(statuses: (string | null)[], roster: number): AttendanceCounts {
  const c = { roster, present: 0, late: 0, absent: 0, excused: 0, notYet: 0 };
  for (const s of statuses) {
    if (s === 'PRESENT') c.present += 1;
    else if (s === 'LATE') c.late += 1;
    else if (s === 'ABSENT') c.absent += 1;
    else if (s === 'EXCUSED') c.excused += 1;
    else c.notYet += 1;
  }
  return c;
}

// --- Scanning ------------------------------------------------------------------------

export type ScanResult = 'TIME_IN' | 'TIME_OUT' | 'ALREADY_IN' | 'ALREADY_COMPLETE';

export async function scan(user: AuthUser, sessionId: bigint, code: string, context?: AuditContext) {
  const { session, cls } = await requireOwnSession(user, sessionId, { write: true });
  if (session.status !== 'OPEN') throw new AppError('This attendance session is closed. Reopen it to keep scanning.', 409, undefined, 'SESSION_CLOSED');

  const trimmed = code.trim();
  const found = await prisma.student.findFirst({
    where: { OR: [{ qrToken: trimmed }, { studentNumber: { equals: trimmed, mode: 'insensitive' } }] },
    select: { id: true, firstName: true, lastName: true, studentNumber: true },
  });
  if (!found) throw new AppError('No student matches this QR code or ID.', 404, undefined, 'UNKNOWN_STUDENT');

  const onRoster = await prisma.sectionStudent.findFirst({ where: { sectionId: cls.sectionId, studentId: found.id }, select: { id: true } });
  if (!onRoster) {
    throw new AppError('This student is not enrolled in this class.', 422, undefined, 'NOT_IN_CLASS');
  }

  const now = new Date();
  const isToday = localDayKey(now) === dateColumnKey(session.meetingDate);
  const arrival = isToday ? arrivalStatus(session.startTime, session.lateAfterMinutes, localMinutes(now)) : 'PRESENT';

  let outcome: ScanResult;
  let record = await prisma.attendanceRecord.findUnique({ where: { sessionId_studentId: { sessionId, studentId: found.id } } });

  if (!record || !record.timeIn) {
    try {
      record = record
        ? await prisma.attendanceRecord.update({
            where: { id: record.id },
            data: { status: arrival, timeIn: now, method: 'QR', recordedBy: BigInt(user.id) },
          })
        : await prisma.attendanceRecord.create({
            data: { sessionId, studentId: found.id, status: arrival, timeIn: now, method: 'QR', recordedBy: BigInt(user.id) },
          });
      outcome = 'TIME_IN';
    } catch (error) {
      // Another scan of the same card won the race; answer from its row.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      record = await prisma.attendanceRecord.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId, studentId: found.id } } });
      outcome = 'ALREADY_IN';
    }
  } else if (record.timeOut) {
    outcome = 'ALREADY_COMPLETE';
  } else if (now.getTime() - record.timeIn.getTime() < MIN_TIME_OUT_GAP_MS) {
    outcome = 'ALREADY_IN';
  } else {
    // Conditional, so two racing time-out scans record one time-out.
    const updated = await prisma.attendanceRecord.updateMany({ where: { id: record.id, timeOut: null }, data: { timeOut: now } });
    record = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } });
    outcome = updated.count === 1 ? 'TIME_OUT' : 'ALREADY_COMPLETE';
  }

  if (outcome === 'TIME_IN' || outcome === 'TIME_OUT') {
    const clock = formatLocalClock(outcome === 'TIME_IN' ? record.timeIn! : record.timeOut!);
    await notifyStudents(prisma, [found.id], outcome === 'TIME_IN'
      ? {
          type: 'attendance.time-in',
          title: 'Attendance recorded',
          body: `You were marked ${record.status} for ${cls.subject.title} at ${clock}.`,
          href: '/my/attendance',
        }
      : {
          type: 'attendance.time-out',
          title: 'Time-out recorded',
          body: `Your ${cls.subject.title} attendance was completed at ${clock}.`,
          href: '/my/attendance',
        });
    await recordAudit({
      action: outcome === 'TIME_IN' ? 'ATTENDANCE_TIME_IN' : 'ATTENDANCE_TIME_OUT',
      actor: actorLabel(user),
      target: `${found.studentNumber} — ${cls.subject.title}`,
      details: { sessionId: sessionId.toString(), status: record.status },
      context,
    });
  }

  const counts = await sessionCounts(sessionId, cls.sectionId);
  return {
    result: outcome,
    student: { name: `${found.firstName} ${found.lastName}`, studentNumber: found.studentNumber },
    status: record.status as AttendanceStatus,
    statusLabel: ATTENDANCE_STATUS_LABELS[record.status as AttendanceStatus],
    timeIn: record.timeIn ? formatLocalClock(record.timeIn) : null,
    timeOut: record.timeOut ? formatLocalClock(record.timeOut) : null,
    subject: cls.subject.title,
    counts,
  };
}

async function sessionCounts(sessionId: bigint, sectionId: bigint): Promise<AttendanceCounts> {
  const [roster, grouped] = await Promise.all([
    prisma.sectionStudent.count({ where: { sectionId } }),
    prisma.attendanceRecord.groupBy({ by: ['status'], where: { sessionId }, _count: { _all: true } }),
  ]);
  const statuses = grouped.flatMap((g) => Array<string>(g._count._all).fill(g.status));
  return countOf([...statuses, ...Array<null>(Math.max(0, roster - statuses.length)).fill(null)], roster);
}

// --- Manual marking and closing --------------------------------------------------

export async function markStudent(user: AuthUser, sessionId: bigint, studentId: bigint, status: AttendanceStatus, context?: AuditContext) {
  const { cls } = await requireOwnSession(user, sessionId, { write: true });
  const student = await requireRosterStudent(cls, studentId);

  const before = await prisma.attendanceRecord.findUnique({ where: { sessionId_studentId: { sessionId, studentId } } });
  await prisma.attendanceRecord.upsert({
    where: { sessionId_studentId: { sessionId, studentId } },
    create: { sessionId, studentId, status, method: 'MANUAL', recordedBy: BigInt(user.id) },
    update: { status, method: 'MANUAL', recordedBy: BigInt(user.id) },
  });
  await recordAudit({
    action: 'ATTENDANCE_MARKED',
    actor: actorLabel(user),
    target: `${student.studentNumber} — ${cls.subject.title}`,
    details: { sessionId: sessionId.toString(), from: before?.status ?? null, to: status },
    context,
  });
}

export async function closeSession(user: AuthUser, sessionId: bigint, context?: AuditContext) {
  const { session, cls } = await requireOwnSession(user, sessionId, { write: true });
  if (session.status === 'CLOSED') return { absent: 0 };

  const roster = await prisma.sectionStudent.findMany({ where: { sectionId: cls.sectionId }, select: { studentId: true } });
  const recorded = await prisma.attendanceRecord.findMany({ where: { sessionId }, select: { studentId: true } });
  const seen = new Set(recorded.map((r) => r.studentId.toString()));
  const absent = roster.map((r) => r.studentId).filter((id) => !seen.has(id.toString()));
  const dateLabel = formatLocalDate(new Date(`${dateColumnKey(session.meetingDate)}T12:00:00Z`), 'UTC');

  await prisma.$transaction(async (tx) => {
    await tx.attendanceRecord.createMany({
      data: absent.map((studentId) => ({ sessionId, studentId, status: 'ABSENT', method: 'MANUAL', recordedBy: BigInt(user.id) })),
      skipDuplicates: true,
    });
    await tx.attendanceSession.update({ where: { id: sessionId }, data: { status: 'CLOSED', closedAt: new Date() } });
    await notifyStudents(tx, absent, {
      type: 'attendance.absent',
      title: 'Marked absent',
      body: `You were marked ABSENT for ${cls.subject.title} on ${dateLabel}. If this is wrong, speak with your instructor.`,
      href: '/my/attendance',
    });
  });

  await recordAudit({
    action: 'ATTENDANCE_SESSION_CLOSED',
    actor: actorLabel(user),
    target: `${cls.subject.title} ${dateColumnKey(session.meetingDate)}`,
    details: { markedAbsent: absent.length },
    context,
  });
  return { absent: absent.length };
}

// --- Records -------------------------------------------------------------------------

/** Every session of a class, newest first, with its counts — one grouped query. */
export async function classSessions(user: AuthUser, classId: bigint) {
  const cls = await requireInstructorClass(user, classId);
  const [sessions, roster] = await Promise.all([
    prisma.attendanceSession.findMany({ where: { classId }, orderBy: [{ meetingDate: 'desc' }, { startTime: 'desc' }] }),
    prisma.sectionStudent.count({ where: { sectionId: cls.sectionId } }),
  ]);
  const grouped = sessions.length
    ? await prisma.attendanceRecord.groupBy({ by: ['sessionId', 'status'], where: { sessionId: { in: sessions.map((s) => s.id) } }, _count: { _all: true } })
    : [];
  return {
    cls,
    roster,
    sessions: sessions.map((s) => {
      const mine = grouped.filter((g) => g.sessionId === s.id);
      const statuses = mine.flatMap((g) => Array<string>(g._count._all).fill(g.status));
      return {
        id: s.id.toString(),
        date: dateColumnKey(s.meetingDate),
        time: `${formatClock(s.startTime)} – ${formatClock(s.endTime)}`,
        status: s.status,
        counts: countOf([...statuses, ...Array<null>(Math.max(0, roster - statuses.length)).fill(null)], roster),
      };
    }),
  };
}

/** Per-student attendance totals for a class — the attendance column of the class record. */
export async function attendanceTotals(classId: bigint) {
  const rows = await prisma.attendanceRecord.groupBy({
    by: ['studentId', 'status'],
    where: { session: { classId } },
    _count: { _all: true },
  });
  const sessions = await prisma.attendanceSession.count({ where: { classId } });
  const map = new Map<string, { present: number; late: number; absent: number; excused: number }>();
  for (const r of rows) {
    const key = r.studentId.toString();
    const t = map.get(key) ?? { present: 0, late: 0, absent: 0, excused: 0 };
    if (r.status === 'PRESENT') t.present += r._count._all;
    else if (r.status === 'LATE') t.late += r._count._all;
    else if (r.status === 'ABSENT') t.absent += r._count._all;
    else if (r.status === 'EXCUSED') t.excused += r._count._all;
    map.set(key, t);
  }
  return { sessions, byStudent: map };
}
