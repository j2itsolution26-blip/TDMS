import { requireUser } from '@/server/auth/current-user';
import { calendarEntries } from '@/server/services/teaching/calendar';
import { localDayKey } from '@shared/lib/institution-time';
import type { PageRequest } from '@/server/controllers/pages/types';

/** School Calendar — holidays, academic dates, exam periods, enrollment, events, semesters. */

export async function loadCalendar({ query }: PageRequest) {
  const user = await requireUser();
  const today = localDayKey(new Date());
  const { month: asked } = query;
  const month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : today.slice(0, 7);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const entries = await calendarEntries(user, `${month}-01`, `${month}-${String(last).padStart(2, '0')}`);

  return { entries, month, today, user };
}
