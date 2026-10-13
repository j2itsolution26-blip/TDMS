import { teachingPolicy } from '@shared/lib/policies';
import { PageShell } from '@/components/teaching/kit';
import CalendarScreen from '@/components/teaching/CalendarScreen';
import { Page } from '@/lib/page-data';
import type { loadCalendar } from '@/server/controllers/pages/app/calendar';

type Data = Awaited<ReturnType<typeof loadCalendar>>;

function View({ entries, month, today, user }: Data) {
  return (
    <PageShell eyebrow="Calendar" title="School Calendar" description="Holidays, academic dates, examination periods, enrollment dates, school events, semesters and school-year dates.">
      <CalendarScreen month={month} entries={entries} canManage={teachingPolicy.manageCalendar(user)} today={today} />
    </PageShell>
  );
}

/** /calendar */
export default function CalendarPage() {
  return <Page<Data> endpoint={'/calendar'} render={(d) => <View {...d} />} />;
}
