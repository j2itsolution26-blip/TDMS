/**
 * The greeting and long date, shared by the server (which renders them in
 * the institution's timezone) and the browser (which re-renders them in the
 * viewer's own).
 */

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Monday, September 28, 2026". Omitting `timeZone` uses the runtime's own. */
export function formatLongDate(date: Date, timeZone?: string): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone });
}

/** The hour (0–23) in a given timezone. */
export function hourIn(date: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date)) % 24;
}
