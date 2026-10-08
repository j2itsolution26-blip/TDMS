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

/**
 * A wall-clock time on a local day ("2026-09-30", "09:00") as a UTC instant —
 * how an Instructor's "September 30, 9:00 AM" becomes the moment a quiz opens.
 */
export function localDateTime(key: string, time: string, tz = institutionTimeZone()): Date | null {
  const start = dayKeyToStart(key, tz);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!start || !match) return null;
  return new Date(start.getTime() + (Number(match[1]) * 60 + Number(match[2])) * 60_000);
}

/** "8:04 AM" in the institution's zone. */
export function formatLocalClock(date: Date, tz = institutionTimeZone()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(date);
}

/** "September 28, 2026" in the institution's zone. */
export function formatLocalDate(date: Date, tz = institutionTimeZone()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

/**
 * A Postgres DATE column comes back as UTC midnight of that date. "2026-09-28"
 * from such a value, without any zone shifting it to the day before.
 */
export function dateColumnKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Date to write into a DATE column for a day key. */
export function dateColumnValue(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Minutes since local midnight, e.g. 8:04 AM → 484. */
export function localMinutes(date: Date, tz = institutionTimeZone()): number {
  const { h, min } = parts(date, tz);
  return h * 60 + min;
}

/** Day of the week in the institution's zone, 0 = Sunday. */
export function localWeekday(date: Date, tz = institutionTimeZone()): number {
  const { y, m, d } = parts(date, tz);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A day key ("2026-09-28") as the UTC instant its local midnight falls on. */
export function dayKeyToStart(key: string, tz = institutionTimeZone()): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const noon = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(noon.getTime())) return null;
  return startOfLocalDay(noon, 0, tz);
}
