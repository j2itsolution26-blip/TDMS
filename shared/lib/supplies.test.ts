import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@shared/types/domain';
import { inventoryTotals } from './supplies';
import { announcementPolicy, assessmentCenterPolicy, staffPdsPolicy, suppliesPolicy } from './policies';

const user = (id: string, roles: string[], permissions: string[] = []) => ({ id, name: 'X', email: `${id}@example.test`, roles, permissions }) as unknown as AuthUser;

describe('inventoryTotals', () => {
  it('counts good and defective, on hand being both', () => {
    expect(inventoryTotals([{ quantityGood: 5, quantityDefective: 2 }, { quantityGood: 0, quantityDefective: 1 }])).toEqual({ items: 2, good: 5, defective: 3, onHand: 8 });
    expect(inventoryTotals([])).toEqual({ items: 0, good: 0, defective: 0, onHand: 0 });
  });
});

describe('staffPdsPolicy', () => {
  const director = user('1', ['director']);
  const admin = user('2', ['admin']);
  const secretary = { id: '3', roles: ['secretary'] };
  const manager = { id: '4', roles: ['assessment_center_manager'] };
  const teacher = { id: '5', roles: ['teacher'] };

  it('lets the five staff roles keep their own sheet, and nobody else', () => {
    for (const r of ['teacher', 'coordinator', 'secretary', 'assessment_center_manager', 'processing_officer']) expect(staffPdsPolicy.keepOwn(user('9', [r]))).toBe(true);
    for (const r of ['director', 'admin', 'student', 'super_admin']) expect(staffPdsPolicy.keepOwn(user('9', [r]))).toBe(false);
  });

  it('lets the Director read every staff sheet', () => {
    expect([secretary, manager, teacher, { id: '6', roles: ['coordinator'] }].every((t) => staffPdsPolicy.view(director, t))).toBe(true);
  });

  it("lets the Admin read only the Secretary's and the Processing Officer's", () => {
    expect(staffPdsPolicy.view(admin, secretary)).toBe(true);
    expect(staffPdsPolicy.view(admin, { id: '7', roles: ['processing_officer'] })).toBe(true);
    expect(staffPdsPolicy.view(admin, manager)).toBe(false);
    expect(staffPdsPolicy.view(admin, teacher)).toBe(false);
  });

  it('keeps everyone else out, the Super Admin included', () => {
    for (const r of ['coordinator', 'secretary', 'teacher', 'student', 'super_admin', 'assessment_center_manager']) {
      expect(staffPdsPolicy.viewAny(user('9', [r]))).toBe(false);
      expect(staffPdsPolicy.view(user('9', [r]), teacher)).toBe(false);
    }
  });
});

describe('suppliesPolicy and announcementPolicy', () => {
  it('lets only the Manager change supplies, and the Director and Admin watch them', () => {
    expect(suppliesPolicy.manage(user('1', ['assessment_center_manager'], ['assessment.supplies.manage']))).toBe(true);
    expect(suppliesPolicy.manage(user('1', ['director']))).toBe(false);
    expect(suppliesPolicy.view(user('1', ['director']))).toBe(true);
    expect(suppliesPolicy.view(user('1', ['admin']))).toBe(true);
    expect(suppliesPolicy.view(user('1', ['teacher']))).toBe(false);
    expect(suppliesPolicy.view(user('1', ['coordinator']))).toBe(false);
  });

  it('lets the Director publish announcements, not the Super Admin', () => {
    expect(announcementPolicy.manage(user('1', ['director'], ['announcements.manage']))).toBe(true);
    expect(announcementPolicy.manage(user('1', ['super_admin'], ['announcements.manage']))).toBe(false);
    expect(announcementPolicy.manage(user('1', ['teacher']))).toBe(false);
  });

  it('shows the training calendar to the Secretary', () => {
    expect(assessmentCenterPolicy.viewCalendar(user('1', ['secretary']))).toBe(true);
    expect(assessmentCenterPolicy.manageCalendar(user('1', ['secretary']))).toBe(false);
  });
});
