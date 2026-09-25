/**
 * Date helpers replacing the Carbon calls used in the Blade templates.
 */

/** Carbon's diffForHumans(), in the same phrasing. */
export function diffForHumans(value: Date | string, now = new Date()): string {
  const then = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  const future = seconds < 0;
  const abs = Math.abs(seconds);

  const units: [number, string][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [2629746, 'week'],
    [31556952, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];

  let divisor = 1;
  let label = 'second';
  for (let i = 0; i < units.length; i += 1) {
    const [limit, name] = units[i]!;
    if (abs < limit) {
      label = name;
      break;
    }
    divisor = limit;
    label = units[Math.min(i + 1, units.length - 1)]![1];
  }

  const amount = Math.max(1, Math.floor(abs / divisor));
  const plural = amount === 1 ? '' : 's';
  return future ? `in ${amount} ${label}${plural}` : `${amount} ${label}${plural} ago`;
}

/** Carbon's format('Y-m-d'), for <input type="date"> values. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Human-readable date, e.g. "Sep 25, 2026". */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** STAFF_ACCOUNT_CREATED -> "Staff account created". */
export function humanizeAction(action: string): string {
  const lower = action.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
