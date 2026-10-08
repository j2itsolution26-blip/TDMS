import { describe, expect, it } from 'vitest';
import {
  arrivalStatus,
  assessmentPhase,
  attemptDeadline,
  computeFinalGrade,
  formatClock,
  gradeRemark,
  isAcceptingSubmissions,
  meetingState,
  nextSchoolYearLabel,
  parseAnswerSheet,
  readWeights,
  scoreAnswers,
} from '@shared/lib/teaching';
import { pdsCompletion, readPds } from '@shared/lib/pds';
import { localDateTime, localMinutes, localWeekday } from '@shared/lib/institution-time';

const at = (iso: string) => new Date(iso);

describe('assessmentPhase', () => {
  const base = { published: true, opensAt: at('2026-09-30T01:00:00Z'), closesAt: at('2026-09-30T01:30:00Z'), scoreStatus: 'DRAFT' };

  it('is DRAFT until published', () => {
    expect(assessmentPhase({ ...base, published: false }, at('2026-09-30T01:10:00Z'))).toBe('DRAFT');
  });
  it('is SCHEDULED before its window, OPEN inside it, CLOSED after', () => {
    expect(assessmentPhase(base, at('2026-09-30T00:59:59Z'))).toBe('SCHEDULED');
    expect(assessmentPhase(base, at('2026-09-30T01:00:00Z'))).toBe('OPEN');
    expect(assessmentPhase(base, at('2026-09-30T01:30:00Z'))).toBe('CLOSED');
  });
  it('is PUBLISHED once results are released, whatever the clock says', () => {
    expect(assessmentPhase({ ...base, scoreStatus: 'RELEASED' }, at('2026-09-30T01:10:00Z'))).toBe('PUBLISHED');
  });
  it('accepts online submissions only while open, online and not finalized', () => {
    const open = at('2026-09-30T01:10:00Z');
    expect(isAcceptingSubmissions({ ...base, onlineEnabled: true }, open)).toBe(true);
    expect(isAcceptingSubmissions({ ...base, onlineEnabled: false }, open)).toBe(false);
    expect(isAcceptingSubmissions({ ...base, onlineEnabled: true, scoreStatus: 'FINALIZED' }, open)).toBe(false);
  });
  it('ends an attempt at the earlier of its duration and the window', () => {
    const start = at('2026-09-30T01:20:00Z');
    expect(attemptDeadline(start, 30, base.closesAt)?.toISOString()).toBe('2026-09-30T01:30:00.000Z');
    expect(attemptDeadline(at('2026-09-30T01:00:00Z'), 10, base.closesAt)?.toISOString()).toBe('2026-09-30T01:10:00.000Z');
  });
});

describe('checking against the key', () => {
  const key = [
    { number: 1, answer: 'A', points: 1 },
    { number: 2, answer: 'B|C', points: 1 },
    { number: 3, answer: 'true', points: 2 },
  ];

  it('scores, ignoring case and spacing, and honours alternatives', () => {
    const r = scoreAnswers(key, { '1': ' a ', '2': 'c', '3': 'TRUE' });
    expect(r).toMatchObject({ points: 4, possible: 4, correct: 3 });
  });
  it('gives nothing for blanks or wrong answers', () => {
    const r = scoreAnswers(key, { '1': 'B' });
    expect(r.points).toBe(0);
    expect(r.items.map((i) => i.correct)).toEqual([false, false, false]);
  });
  it('reads a letter-per-item sheet, skipping dashes for blanks', () => {
    expect(parseAnswerSheet('AB-D a', 5)).toEqual({ '1': 'A', '2': 'B', '4': 'D', '5': 'A' });
  });
  it('reads a numbered sheet and ignores numbers beyond the key', () => {
    expect(parseAnswerSheet('1A 2. b 3) true 9 C', 3)).toEqual({ '1': 'A', '2': 'B', '3': 'TRUE' });
  });
});

describe('final grade', () => {
  it('weights categories and scales up when a category is still empty', () => {
    const weights = readWeights({ QUIZ: 20, EXAM: 40, ACTIVITY: 20, PT: 20 });
    // Only quizzes (90%) and activities (70%) so far: (90*20 + 70*20) / 40 = 80.
    expect(computeFinalGrade(weights, { QUIZ: { earned: 9, possible: 10 }, ACTIVITY: { earned: 14, possible: 20 } })).toBe(80);
  });
  it('is null with nothing recorded, and remarks follow the passing grade', () => {
    expect(computeFinalGrade(readWeights(null), {})).toBeNull();
    expect(gradeRemark(null, 75)).toBe('INCOMPLETE');
    expect(gradeRemark(75, 75)).toBe('PASSED');
    expect(gradeRemark(74.99, 75)).toBe('FAILED');
  });
});

describe('meetings and attendance', () => {
  it('labels a meeting against the clock', () => {
    expect(meetingState('08:00', '10:00', 7 * 60 + 59)).toBe('UPCOMING');
    expect(meetingState('08:00', '10:00', 8 * 60)).toBe('LIVE');
    expect(meetingState('08:00', '10:00', 10 * 60)).toBe('COMPLETED');
  });
  it('marks late only after the grace period', () => {
    expect(arrivalStatus('08:00', 15, 8 * 60 + 15)).toBe('PRESENT');
    expect(arrivalStatus('08:00', 15, 8 * 60 + 16)).toBe('LATE');
  });
  it('formats clock times', () => {
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatClock('13:30')).toBe('1:30 PM');
  });
  it('converts Manila wall-clock times to instants and back', () => {
    const t = localDateTime('2026-09-30', '09:00', 'Asia/Manila');
    expect(t?.toISOString()).toBe('2026-09-30T01:00:00.000Z');
    expect(localMinutes(t!, 'Asia/Manila')).toBe(540);
    expect(localWeekday(t!, 'Asia/Manila')).toBe(3); // Wednesday
    expect(localDateTime('2026-09-30', '25:00', 'Asia/Manila')).toBeNull();
  });
  it('rolls school year labels forward', () => {
    expect(nextSchoolYearLabel('2026-2027')).toBe('2027-2028');
    expect(nextSchoolYearLabel('nonsense')).toBeNull();
  });
});

describe('PDS completion', () => {
  it('is zero when empty and lists what is missing', () => {
    const c = pdsCompletion(readPds(null));
    expect(c.overall).toBe(0);
    expect(c.sections[0]!.missing).toContain('Employee ID');
    expect(c.sections[2]!.missing).toEqual(['At least one school attended']);
  });
  it('counts partial rows proportionally', () => {
    const data = readPds({
      employeeId: 'E-1',
      personal: { dateOfBirth: '1990-01-01', placeOfBirth: 'Manila', sex: 'Female', civilStatus: 'Single', citizenship: 'Filipino', contactNumber: '0917', address: 'QC' },
      family: { father: { name: 'A' }, mother: { name: 'B' } },
      education: [{ level: 'College', school: 'UP', yearGraduated: '2012' }],
      eligibility: [{ eligibility: 'CSE', rating: '85' }],
      work: [],
      training: 'not an array',
    });
    const c = pdsCompletion(data);
    expect(c.sections.map((s) => s.percent)).toEqual([100, 100, 100, 50, 0, 0]);
    expect(c.overall).toBe(58);
  });
});
