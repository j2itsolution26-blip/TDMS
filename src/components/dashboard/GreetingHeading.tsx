'use client';

import { useEffect, useState } from 'react';
import { greetingForHour } from '@/lib/greeting';

/**
 * "Good morning, Ana 👋" in the VIEWER's timezone. The server renders the
 * institution's greeting; the browser swaps in its own after hydration, which
 * for most viewers is the same text, so nothing moves.
 */
export default function GreetingHeading({ firstName, initialGreeting }: { firstName: string; initialGreeting: string }) {
  const [greeting, setGreeting] = useState(initialGreeting);
  useEffect(() => setGreeting(greetingForHour(new Date().getHours())), []);
  return (
    <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-tdms-ink sm:text-[30px]">
      {greeting}, {firstName} <span aria-hidden="true">👋</span>
    </h1>
  );
}
