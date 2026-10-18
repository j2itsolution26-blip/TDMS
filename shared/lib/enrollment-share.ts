/**
 * A program's share of enrolled students, for the Programs page: one decimal
 * at most ("37.5%", "40%"), and "0%" — never NaN — when nobody is enrolled.
 */
export function enrollmentShare(count: number, total: number): string {
  if (!total || total < 0 || !Number.isFinite(count)) return '0%';
  return `${Math.round((count / total) * 1000) / 10}%`;
}
