import { describe, expect, it } from 'vitest';
import { dateOfBirthProblem, phoneProblem } from './student-rules';

describe('phoneProblem', () => {
  it('accepts local and international formats', () => {
    for (const phone of ['09171234567', '0917 123 4567', '+63 917-123-4567', '(02) 8123 4567', '8123-4567', '']) {
      expect(phoneProblem(phone), phone).toBeNull();
    }
  });

  it('refuses letters and stray symbols', () => {
    for (const phone of ['0917-abc-4567', 'call me', '0917#1234567', '++639171234567']) {
      expect(phoneProblem(phone), phone).not.toBeNull();
    }
  });

  it('needs 7 to 15 digits', () => {
    expect(phoneProblem('12345')).toMatch(/7 to 15/);
    expect(phoneProblem('1234567890123456')).toMatch(/7 to 15/);
  });
});

describe('dateOfBirthProblem', () => {
  const now = new Date('2026-10-09T03:00:00Z'); // 11:00 in Manila

  it('accepts real past dates and an empty value', () => {
    for (const d of ['2005-06-15', '2004-02-29', '1900-01-01', '2026-10-09', '']) {
      expect(dateOfBirthProblem(d, now), d).toBeNull();
    }
  });

  it('refuses the future, using the institution\'s today', () => {
    expect(dateOfBirthProblem('2026-10-10', now)).toMatch(/future/);
    // 23:30 UTC on the 9th is already the 10th in Manila: the 10th is today, not the future.
    expect(dateOfBirthProblem('2026-10-10', new Date('2026-10-09T23:30:00Z'))).toBeNull();
  });

  it('refuses impossible and malformed dates instead of rolling them over', () => {
    for (const d of ['2026-02-31', '2025-02-29', '2026-13-01', '15/06/2005', '2005-6-15']) {
      expect(dateOfBirthProblem(d, now), d).toMatch(/valid date/);
    }
  });

  it('refuses dates before 1900', () => {
    expect(dateOfBirthProblem('1899-12-31', now)).toMatch(/after 1900/);
  });
});
