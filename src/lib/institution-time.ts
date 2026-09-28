/**
 * The institution's clock.
 *
 * A serverless function runs in UTC, and "today" at a Philippine campus starts
 * eight hours before UTC midnight. Anything that buckets or labels by day —
 * the dashboard charts, the audit log's date groups and date filter — uses this
 * timezone so they agree with each other and with the people reading them.
 *
 * Configurable with APP_TIMEZONE (default Asia/Manila), validated before use so
 * a typo falls back to UTC rather than throwing.
 */
export function institutionTimeZone(): string {
  const tz = process.env.APP_TIMEZONE?.trim() || 'Asia/Manila';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function parts(date: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
}

/** "2026-09-28" — the calendar day this instant falls on, in the institution's zone. */
export function localDayKey(date: Date, tz = institutionTimeZone()): string {
  const { y, m, d } = parts(date, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The UTC instant at which the institution's calendar day containing `date`
 * began, shifted by `addDays`. Used for date-range filters, so "Today" means the
 * campus's today, not the server's.
 */
export function startOfLocalDay(date: Date, addDays = 0, tz = institutionTimeZone()): Date {
  const { y, m, d } = parts(date, tz);
  const guess = Date.UTC(y, m - 1, d + addDays);
  // The zone's offset at that moment, measured rather than assumed.
  const seen = parts(new Date(guess), tz);
  const offset = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.min, seen.s) - guess;
  return new Date(guess - offset);
}

/** A day key ("2026-09-28") as the UTC instant its local midnight falls on. */
export function dayKeyToStart(key: string, tz = institutionTimeZone()): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const noon = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(noon.getTime())) return null;
  return startOfLocalDay(noon, 0, tz);
}
