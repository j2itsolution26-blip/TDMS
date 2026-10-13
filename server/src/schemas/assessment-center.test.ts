import { describe, expect, it } from 'vitest';
import { activitySchema, batchSchema, dayKey, recordResultSchema, resultFilterSchema } from './assessment-center';
import { assessmentCenterPolicy } from '@shared/lib/policies';
import type { AuthUser } from '@shared/types/domain';

describe('dayKey', () => {
  it('accepts real dates and refuses impossible ones', () => {
    expect(dayKey.safeParse('2026-10-14').success).toBe(true);
    expect(dayKey.safeParse('2026-02-31').success).toBe(false);
    expect(dayKey.safeParse('14/10/2026').success).toBe(false);
  });
});

describe('batchSchema', () => {
  const valid = { batchNumber: '2026-CSS-001', programId: '1', assessmentDate: '2026-10-14', assessorName: 'J. Cruz' };
  it('needs an assessor account or name', () => {
    expect(batchSchema.safeParse(valid).success).toBe(true);
    expect(batchSchema.safeParse({ ...valid, assessorName: '' }).success).toBe(false);
    expect(batchSchema.safeParse({ ...valid, assessorName: '', assessorUserId: '5' }).success).toBe(true);
  });
  it('refuses odd batch numbers', () => {
    expect(batchSchema.safeParse({ ...valid, batchNumber: '<script>' }).success).toBe(false);
  });
});

describe('recordResultSchema', () => {
  it('accepts only C or NYC', () => {
    expect(recordResultSchema.safeParse({ result: 'C' }).success).toBe(true);
    expect(recordResultSchema.safeParse({ result: 'PASSED' }).success).toBe(false);
  });
});

describe('resultFilterSchema', () => {
  it('treats empty filters as absent', () => {
    expect(resultFilterSchema.parse({ batchId: '', result: '', page: '2' })).toMatchObject({ batchId: null, result: undefined, page: 2 });
  });
});

describe('activitySchema', () => {
  const valid = { title: 'NC II assessment', activityType: 'ASSESSMENT', startsAt: '2026-10-14T00:00:00Z', endsAt: '2026-10-14T08:00:00Z' };
  it('requires the end after the start, and at most 92 days', () => {
    expect(activitySchema.safeParse(valid).success).toBe(true);
    expect(activitySchema.safeParse({ ...valid, endsAt: valid.startsAt }).success).toBe(false);
    expect(activitySchema.safeParse({ ...valid, endsAt: '2027-03-01T00:00:00Z' }).success).toBe(false);
  });
  it('defaults to scheduled, with conflicts not acknowledged', () => {
    expect(activitySchema.parse(valid)).toMatchObject({ status: 'SCHEDULED', acknowledgeConflicts: false });
  });
});

describe('assessmentCenterPolicy', () => {
  const user = (roles: string[], permissions: string[] = []) => ({ id: '1', name: 'X', email: 'x@example.test', roles, permissions }) as unknown as AuthUser;
  it('lets the manager manage and the TVET office view', () => {
    const manager = user(['assessment_center_manager'], ['assessment.results.manage', 'assessment.calendar.manage']);
    expect(assessmentCenterPolicy.manageResults(manager)).toBe(true);
    expect(assessmentCenterPolicy.manageCalendar(manager)).toBe(true);
    expect(assessmentCenterPolicy.view(user(['director']))).toBe(true);
    expect(assessmentCenterPolicy.manageResults(user(['director']))).toBe(false);
  });
  it('shows teachers the calendar only, and students nothing', () => {
    expect(assessmentCenterPolicy.viewCalendar(user(['teacher']))).toBe(true);
    expect(assessmentCenterPolicy.view(user(['teacher']))).toBe(false);
    expect(assessmentCenterPolicy.viewCalendar(user(['student']))).toBe(false);
  });
});
