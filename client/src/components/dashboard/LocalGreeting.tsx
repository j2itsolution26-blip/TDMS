import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatLongDate, greetingForHour } from '@shared/lib/greeting';

/**
 * "Good afternoon, James" and today's date, in the VIEWER's timezone.
 *
 * The server cannot know it, so the page arrives with the institution's
 * (APP_TIMEZONE) greeting and date, and the browser swaps in its own after
 * hydration — for most viewers the two are identical, so nothing moves.
 */

export default function LocalGreeting({
  firstName,
  term,
  initialGreeting,
  initialDate,
}: {
  firstName: string;
  term: string;
  initialGreeting: string;
  initialDate: string;
}) {
  const [local, setLocal] = useState({ greeting: initialGreeting, date: initialDate });

  useEffect(() => {
    const now = new Date();
    setLocal({ greeting: greetingForHour(now.getHours()), date: formatLongDate(now) });
  }, []);

  return (
    <>
      <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-medium text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm">
        <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
        <span className="truncate">
          {local.date} · {term}
        </span>
      </p>
      <h1 className="mt-5 text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em] text-white sm:text-[40px]">
        {local.greeting}, {firstName}
      </h1>
    </>
  );
}
