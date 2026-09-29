import { requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { calendarEntries } from '@/server/services/teaching/calendar';
import { localDayKey } from '@/lib/institution-time';
import { PageShell } from '@/components/teaching/kit';
import CalendarScreen from '@/components/teaching/CalendarScreen';

export const dynamic = 'force-dynamic';

/** School Calendar — holidays, academic dates, exam periods, enrollment, events, semesters. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const today = localDayKey(new Date());
  const { month: asked } = await searchParams;
  const month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : today.slice(0, 7);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const entries = await calendarEntries(user, `${month}-01`, `${month}-${String(last).padStart(2, '0')}`);

  return (
    <PageShell eyebrow="Calendar" title="School Calendar" description="Holidays, academic dates, examination periods, enrollment dates, school events, semesters and school-year dates.">
      <CalendarScreen month={month} entries={entries} canManage={teachingPolicy.manageCalendar(user)} today={today} />
    </PageShell>
  );
}
