import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/http';
import { DAY_NAMES, formatClock, sectionLabel, timeToMinutes } from '@shared/lib/teaching';

/**
 * Class schedule conflicts — the authoritative check behind every class
 * create and update.
 *
 * Two meetings clash when they are in the same school year, the same
 * semester and on the same weekday, both classes are ACTIVE, and their times
 * overlap. Times are half-open ranges [start, end): 08:00–10:00 and
 * 10:00–12:00 are consecutive, not overlapping. A clash is:
 *
 *   * room — two classes in one room at once (a meeting's room is its own
 *     room, otherwise its class's room);
 *   * instructor — one Diploma Instructor in two classes at once;
 *   * section — one section in two classes at once;
 *   * self — a class whose own meetings overlap each other.
 *
 * Times are the institution's local wall-clock "HH:MM" with a weekday, as
 * stored; a weekly timetable needs no timezone conversion.
 *
 * Concurrency: assertNoConflicts runs inside the write's transaction after
 * taking a transaction-scoped advisory lock on (school year, semester), so
 * two people scheduling the same term are serialised and the second sees
 * the first's booking. Scheduling writes are rare; one lock per term is
 * enough and simple.
 */

export interface Meeting {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomId: bigint | null;
}

export interface BookedMeeting extends Meeting {
  classId: bigint;
  sectionId: bigint;
  instructorId: bigint | null;
  /** "COMP-1 · DIT-1 · 1st Year · Section A" */
  label: string;
  roomCode: string | null;
}

export type ConflictKind = 'room' | 'instructor' | 'section' | 'self';

export interface Conflict {
  kind: ConflictKind;
  /** Index of the candidate meeting that clashes. */
  meeting: number;
  message: string;
}

/** True when two meetings share a weekday and their [start, end) ranges intersect. */
export function overlaps(a: Pick<Meeting, 'dayOfWeek' | 'startTime' | 'endTime'>, b: Pick<Meeting, 'dayOfWeek' | 'startTime' | 'endTime'>): boolean {
  return a.dayOfWeek === b.dayOfWeek
    && timeToMinutes(a.startTime) < timeToMinutes(b.endTime)
    && timeToMinutes(b.startTime) < timeToMinutes(a.endTime);
}

const when = (m: Pick<Meeting, 'dayOfWeek' | 'startTime' | 'endTime'>) =>
  `${DAY_NAMES[m.dayOfWeek]} ${formatClock(m.startTime)}–${formatClock(m.endTime)}`;

/**
 * Every clash between a candidate class's meetings and what is already booked
 * that term. Pure: the caller loads `booked` (other ACTIVE classes only).
 */
export function findConflicts(
  candidate: { sectionId: bigint; instructorId: bigint | null; instructorName?: string | null; meetings: Meeting[]; roomCodes?: Map<string, string> },
  booked: BookedMeeting[],
): Conflict[] {
  const out: Conflict[] = [];
  const roomName = (id: bigint | null) => (id === null ? null : candidate.roomCodes?.get(id.toString()) ?? 'that room');

  candidate.meetings.forEach((m, i) => {
    // Its own meetings first: one class cannot meet twice at once.
    candidate.meetings.forEach((other, j) => {
      if (j > i && overlaps(m, other)) {
        out.push({ kind: 'self', meeting: j, message: `Meeting ${j + 1} (${when(other)}) overlaps meeting ${i + 1} (${when(m)}) of this class.` });
      }
    });
    for (const b of booked) {
      if (!overlaps(m, b)) continue;
      if (m.roomId !== null && b.roomId !== null && m.roomId === b.roomId) {
        out.push({ kind: 'room', meeting: i, message: `Room ${b.roomCode ?? roomName(m.roomId)} is already booked ${when(b)} by ${b.label}.` });
      }
      if (candidate.instructorId !== null && b.instructorId !== null && candidate.instructorId === b.instructorId) {
        out.push({ kind: 'instructor', meeting: i, message: `${candidate.instructorName ?? 'The instructor'} already teaches ${b.label} ${when(b)}.` });
      }
      if (candidate.sectionId === b.sectionId) {
        out.push({ kind: 'section', meeting: i, message: `This section already has ${b.label} ${when(b)}.` });
      }
    }
  });
  return out;
}

type Db = Prisma.TransactionClient | typeof prisma;

/** The ACTIVE classes' meetings of a term, excluding one class (the one being edited). */
export async function bookedMeetings(db: Db, schoolYearId: bigint, semester: number, exceptClassId?: bigint | null): Promise<BookedMeeting[]> {
  const rows = await db.classSchedule.findMany({
    where: { class: { schoolYearId, semester, status: 'ACTIVE', ...(exceptClassId ? { id: { not: exceptClassId } } : {}) } },
    select: {
      dayOfWeek: true, startTime: true, endTime: true, roomId: true,
      roomRef: { select: { code: true } },
      class: {
        select: {
          id: true, sectionId: true, instructorId: true, roomId: true,
          roomRef: { select: { code: true } },
          subject: { select: { code: true } },
          section: { select: { name: true, yearLevel: true, program: { select: { code: true } } } },
        },
      },
    },
  });
  return rows.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    roomId: r.roomId ?? r.class.roomId,
    roomCode: r.roomRef?.code ?? r.class.roomRef?.code ?? null,
    classId: r.class.id,
    sectionId: r.class.sectionId,
    instructorId: r.class.instructorId,
    label: `${r.class.subject.code} · ${sectionLabel(r.class.section.program.code, r.class.section.yearLevel, r.class.section.name)}`,
  }));
}

export interface ScheduleCandidate {
  schoolYearId: bigint;
  semester: number;
  classId?: bigint | null;
  sectionId: bigint;
  instructorId: bigint | null;
  instructorName?: string | null;
  /** The class's room; meetings without their own room use it. */
  roomId: bigint | null;
  meetings: { dayOfWeek: number; startTime: string; endTime: string; roomId?: bigint | null }[];
}

async function check(db: Db, c: ScheduleCandidate): Promise<Conflict[]> {
  const meetings: Meeting[] = c.meetings.map((m) => ({ dayOfWeek: m.dayOfWeek, startTime: m.startTime, endTime: m.endTime, roomId: m.roomId ?? c.roomId }));
  const roomIds = [...new Set(meetings.map((m) => m.roomId).filter((x): x is bigint => x !== null))];
  const [booked, rooms] = await Promise.all([
    bookedMeetings(db, c.schoolYearId, c.semester, c.classId),
    roomIds.length ? db.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, code: true } }) : [],
  ]);
  return findConflicts(
    { sectionId: c.sectionId, instructorId: c.instructorId, instructorName: c.instructorName, meetings, roomCodes: new Map(rooms.map((r) => [r.id.toString(), r.code])) },
    booked,
  );
}

/** The dry run behind the schedule form: what would clash, without writing anything. */
export function previewConflicts(c: ScheduleCandidate): Promise<Conflict[]> {
  return check(prisma, c);
}

/**
 * Inside the write's transaction: lock the term, then refuse any clash with
 * an actionable message per meeting (errors keyed schedules.N).
 */
export async function assertNoConflicts(tx: Prisma.TransactionClient, c: ScheduleCandidate): Promise<void> {
  const key = `class-schedule:${c.schoolYearId}:${c.semester}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const conflicts = await check(tx, c);
  if (conflicts.length === 0) return;
  const errors: Record<string, string[]> = {};
  for (const x of conflicts) (errors[`schedules.${x.meeting}`] ??= []).push(x.message);
  throw new AppError(conflicts[0]!.message + (conflicts.length > 1 ? ` (${conflicts.length} conflicts in all.)` : ''), 422, errors, 'SCHEDULE_CONFLICT');
}
