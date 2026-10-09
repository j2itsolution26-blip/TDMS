import { localDayKey } from './institution-time';

/**
 * Field rules for a student record, shared so the form can say what is wrong
 * while typing and the server enforces exactly the same thing on save.
 * Each returns the message to show, or null when the value is fine. Empty
 * values are the caller's business: these fields are optional.
 */

/** No one alive to enrol was born before this. */
export const EARLIEST_BIRTH_DATE = '1900-01-01';

/** Accepts local and international formats: 0917 123 4567, +63 917-123-4567, (02) 8123 4567. */
export function phoneProblem(phone: string): string | null {
  const value = phone.trim();
  if (value === '') return null;
  if (!/^\+?[0-9\s().-]+$/.test(value)) {
    return 'Use digits, spaces, dashes or brackets only, with an optional leading +.';
  }
  const digits = value.replace(/\D/g, '').length;
  if (digits < 7 || digits > 15) return 'Enter a phone number with 7 to 15 digits.';
  return null;
}

/** `YYYY-MM-DD`. "Today" is the institution's today, not the server's or the browser's. */
export function dateOfBirthProblem(isoDate: string, now = new Date()): string | null {
  const value = isoDate.trim();
  if (value === '') return null;
  // A round trip, because JavaScript silently turns 2026-02-31 into March 3.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return 'Enter a valid date.';
  }
  if (value > localDayKey(now)) return 'The date of birth cannot be in the future.';
  if (value < EARLIEST_BIRTH_DATE) return 'Enter a date of birth after 1900.';
  return null;
}
