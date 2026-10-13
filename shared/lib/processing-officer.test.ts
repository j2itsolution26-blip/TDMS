import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@shared/types/domain';
import { ROLES, ROLE_LABELS } from '@shared/types/domain';
import {
  applicationPolicy,
  assessmentCenterPolicy,
  enrollmentPolicy,
  studentCredentialPolicy,
  studentPolicy,
  suppliesPolicy,
  systemPolicy,
  userPolicy,
} from './policies';

/** The TVET Processing Officer as seeded: role plus its four permissions. */
const po = {
  id: '1', name: 'PO', email: 'po@example.test', roles: ['processing_officer'],
  permissions: ['students.manage', 'students.enroll', 'credentials.verify', 'assessment.calendar.manage'],
} as unknown as AuthUser;

describe('TVET Processing Officer', () => {
  it('is a known role with its label', () => {
    expect(ROLES).toContain('processing_officer');
    expect(ROLE_LABELS.processing_officer).toBe('TVET Processing Officer');
  });

  it('manages learner records, enrollment, documents and the training calendar', () => {
    expect(studentPolicy.viewAny(po)).toBe(true);
    expect(studentPolicy.create(po)).toBe(true);
    expect(enrollmentPolicy.viewAny(po)).toBe(true);
    expect(enrollmentPolicy.create(po)).toBe(true);
    expect(studentCredentialPolicy.viewAny(po)).toBe(true);
    expect(studentCredentialPolicy.verify(po)).toBe(true);
    expect(assessmentCenterPolicy.viewCalendar(po)).toBe(true);
    expect(assessmentCenterPolicy.manageCalendar(po)).toBe(true);
  });

  it('gets nothing administrative or outside its work', () => {
    expect(userPolicy.viewAny(po)).toBe(false);
    expect(applicationPolicy.viewAny(po)).toBe(false);
    expect(assessmentCenterPolicy.view(po)).toBe(false);
    expect(assessmentCenterPolicy.manageResults(po)).toBe(false);
    expect(suppliesPolicy.view(po)).toBe(false);
    expect(systemPolicy.viewAuditLogs(po)).toBe(false);
    expect(studentPolicy.delete(po)).toBe(false);
  });
});
