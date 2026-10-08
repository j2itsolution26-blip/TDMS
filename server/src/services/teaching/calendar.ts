import type { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AuthorizationError, NotFoundError } from '@/server/lib/http';
import { CALENDAR_TYPE_LABELS, schoolYearDisplay, type CalendarType } from '@shared/lib/teaching';
import { dateColumnKey, dateColumnValue } from '@shared/lib/institution-time';
import type { AuthUser } from '@shared/types/domain';
import { teachingPolicy } from '@/server/auth/policies';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { calendarEventSchema } from '@/server/schemas/teaching';
import { notifyRoles } from './notifications';

/**
 * The school calendar. Managed centrally by the Admin, Director and
 * Coordinator; read by everyone signed in, Instructors and Students included.
 * School-year start and end dates come from the school years themselves, so
 * they cannot drift from the lifecycle.
 */

export interface CalendarEntry {
  id: string;
  title: string;
  description: string | null;
  type: CalendarType | 'SCHOOL_YEAR';
  typeLabel: string;
  startsOn: string;
  endsOn: string;
  editable: boolean;
}

export async function calendarEntries(user: AuthUser, from: string, to: string): Promise<CalendarEntry[]> {
  const fromDate = dateColumnValue(from);
  const toDate = dateColumnValue(to);
  const [events, years] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startsOn: { lte: toDate }, endsOn: { gte: fromDate } },
      orderBy: [{ startsOn: 'asc' }, { title: 'asc' }],
    }),
    prisma.schoolYear.findMany({ where: { OR: [{ startsOn: { gte: fromDate, lte: toDate } }, { endsOn: { gte: fromDate, lte: toDate } }] } }),
  ]);
  const canEdit = teachingPolicy.manageCalendar(user);

  const entries: CalendarEntry[] = events.map((e) => ({
    id: e.id.toString(),
    title: e.title,
    description: e.description,
    type: e.type as CalendarType,
    typeLabel: CALENDAR_TYPE_LABELS[e.type as CalendarType] ?? e.type,
    startsOn: dateColumnKey(e.startsOn),
    endsOn: dateColumnKey(e.endsOn),
    editable: canEdit,
  }));
  for (const y of years) {
    const key = (d: Date) => dateColumnKey(d);
    if (key(y.startsOn) >= from && key(y.startsOn) <= to) {
      entries.push({ id: `sy-start-${y.id}`, title: `School year ${schoolYearDisplay(y.label)} begins`, description: null, type: 'SCHOOL_YEAR', typeLabel: 'School Year', startsOn: key(y.startsOn), endsOn: key(y.startsOn), editable: false });
    }
    if (key(y.endsOn) >= from && key(y.endsOn) <= to) {
      entries.push({ id: `sy-end-${y.id}`, title: `School year ${schoolYearDisplay(y.label)} ends`, description: null, type: 'SCHOOL_YEAR', typeLabel: 'School Year', startsOn: key(y.endsOn), endsOn: key(y.endsOn), editable: false });
    }
  }
  return entries.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** The next few entries from today — for dashboards. */
export async function upcomingEntries(user: AuthUser, today: string, take = 5) {
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 60);
  const all = await calendarEntries(user, today, until.toISOString().slice(0, 10));
  return all.slice(0, take);
}

async function yearFor(startsOn: string) {
  const d = dateColumnValue(startsOn);
  const y = await prisma.schoolYear.findFirst({ where: { startsOn: { lte: d }, endsOn: { gte: d } }, select: { id: true } });
  return y?.id ?? null;
}

export async function createCalendarEvent(user: AuthUser, input: z.output<typeof calendarEventSchema>, context?: AuditContext) {
  if (!teachingPolicy.manageCalendar(user)) throw new AuthorizationError();
  const event = await prisma.$transaction(async (tx) => {
    const e = await tx.calendarEvent.create({
      data: {
        schoolYearId: await yearFor(input.startsOn),
        title: input.title,
        description: input.description,
        type: input.type,
        startsOn: dateColumnValue(input.startsOn),
        endsOn: dateColumnValue(input.endsOn),
        createdBy: BigInt(user.id),
      },
    });
    if (input.notify) {
      await notifyRoles(tx, ['admin', 'director', 'coordinator', 'secretary', 'teacher', 'student'], {
        type: 'calendar.event',
        title: `${CALENDAR_TYPE_LABELS[input.type]}: ${input.title}`,
        body: input.startsOn === input.endsOn ? input.startsOn : `${input.startsOn} to ${input.endsOn}`,
        href: `/calendar?month=${input.startsOn.slice(0, 7)}`,
      }, BigInt(user.id));
    }
    return e;
  });
  await recordAudit({ action: 'CALENDAR_EVENT_CREATED', actor: actorLabel(user), target: `Calendar: ${input.title}`, details: { type: input.type, startsOn: input.startsOn, notified: input.notify }, context });
  return event;
}

export async function updateCalendarEvent(user: AuthUser, id: bigint, input: z.output<typeof calendarEventSchema>, context?: AuditContext) {
  if (!teachingPolicy.manageCalendar(user)) throw new AuthorizationError();
  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Event not found.');
  await prisma.calendarEvent.update({
    where: { id },
    data: {
      schoolYearId: await yearFor(input.startsOn),
      title: input.title,
      description: input.description,
      type: input.type,
      startsOn: dateColumnValue(input.startsOn),
      endsOn: dateColumnValue(input.endsOn),
    },
  });
  await recordAudit({ action: 'CALENDAR_EVENT_UPDATED', actor: actorLabel(user), target: `Calendar: ${input.title}`, context });
}

export async function deleteCalendarEvent(user: AuthUser, id: bigint, context?: AuditContext) {
  if (!teachingPolicy.manageCalendar(user)) throw new AuthorizationError();
  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Event not found.');
  await prisma.calendarEvent.delete({ where: { id } });
  await recordAudit({ action: 'CALENDAR_EVENT_DELETED', actor: actorLabel(user), target: `Calendar: ${existing.title}`, context });
}
