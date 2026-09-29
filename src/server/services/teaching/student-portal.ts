import 'server-only';
import { prisma } from '@/lib/prisma';
import { ATTENDANCE_STATUS_LABELS, formatClock, type AttendanceStatus } from '@/lib/teaching';
import { dateColumnKey, formatLocalClock } from '@/lib/institution-time';
import type { AuthUser } from '@/types/domain';
import { requireStudentRecord } from './access';

/**
 * A student's own records. Every query is keyed by the student record found
 * from THEIR user id (requireStudentRecord) — nothing in the request can
 * point it at another student.
 */

/** The student's QR token, issued on first use for anyone who predates it. */
export async function ownQr(user: AuthUser) {
  const student = await requireStudentRecord(user);
  let token = student.qrToken;
  if (!token) {
    const { randomBytes } = await import('node:crypto');
    token = randomBytes(32).toString('hex');
    // Conditional, so two first visits at once settle on one token.
    await prisma.student.updateMany({ where: { id: student.id, qrToken: null }, data: { qrToken: token } });
    token = (await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { qrToken: true } })).qrToken!;
  }
  return {
    token,
    name: `${student.firstName} ${student.lastName}`,
    studentNumber: student.studentNumber,
    program: student.program.name,
  };
}

export async function ownAttendance(user: AuthUser) {
  const student = await requireStudentRecord(user);
  const rows = await prisma.attendanceRecord.findMany({
    where: { studentId: student.id },
    orderBy: [{ session: { meetingDate: 'desc' } }, { session: { startTime: 'desc' } }],
    take: 200,
    include: { session: { select: { meetingDate: true, startTime: true, endTime: true, class: { select: { subject: { select: { title: true } } } } } } },
  });
  const totals = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 } as Record<AttendanceStatus, number>;
  for (const r of rows) totals[r.status as AttendanceStatus] += 1;
  return {
    totals,
    rows: rows.map((r) => ({
      id: r.id.toString(),
      date: dateColumnKey(r.session.meetingDate),
      subject: r.session.class.subject.title,
      time: `${formatClock(r.session.startTime)} – ${formatClock(r.session.endTime)}`,
      status: r.status as AttendanceStatus,
      statusLabel: ATTENDANCE_STATUS_LABELS[r.status as AttendanceStatus],
      timeIn: r.timeIn ? formatLocalClock(r.timeIn) : null,
      timeOut: r.timeOut ? formatLocalClock(r.timeOut) : null,
    })),
  };
}
