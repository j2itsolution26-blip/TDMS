import { describe, it, expect } from 'vitest';
import type { AuthUser } from '@/types/domain';
import {
  can,
  hasRole,
  isSuperAdmin,
  programPolicy,
  subjectPolicy,
  studentPolicy,
  applicationPolicy,
  curriculumSubjectPolicy,
  enrollmentPolicy,
  studentCredentialPolicy,
  userPolicy,
  adminAccountPolicy,
  requiresAdminAccessCode,
} from './policies';

/**
 * These lock the ported authorization matrix against the Laravel policies.
 * If a permission is ever widened by accident, one of these fails.
 */

function user(roles: string[], permissions: string[] = []): AuthUser {
  return {
    id: '1',
    name: 'Test',
    username: null,
    email: 't@example.test',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    mustChangePassword: false,
    roles,
    permissions,
  };
}

const superAdmin = user(['super_admin']);
const admin = user(['admin'], ['accounts.manage', 'programs.manage', 'subjects.manage', 'students.manage', 'students.enroll', 'applications.review', 'credentials.verify']);
const director = user(['director'], ['programs.manage', 'subjects.manage', 'accounts.manage']);
const coordinator = user(['coordinator'], ['programs.manage', 'subjects.manage']);
const secretary = user(['secretary'], ['applications.review', 'credentials.verify', 'students.manage', 'students.enroll']);
const teacher = user(['teacher'], ['grades.enter', 'attendance.record']);
const student = user(['student'], ['academic-records.view.own']);

describe('Gate::before super_admin grant', () => {
  it('grants every ability to a super admin', () => {
    expect(isSuperAdmin(superAdmin)).toBe(true);
    expect(can(superAdmin, 'anything.at.all')).toBe(true);
    expect(programPolicy.create(superAdmin)).toBe(true);
    expect(userPolicy.viewAny(superAdmin)).toBe(true);
    // Even the deletes, which are flat false for everyone else.
    expect(programPolicy.delete(superAdmin)).toBe(true);
  });

  it('does not grant abilities to anyone else implicitly', () => {
    expect(can(teacher, 'accounts.manage')).toBe(false);
    expect(programPolicy.delete(director)).toBe(false);
  });
});

describe('catalogue policies', () => {
  it('lets every staff role read programs and subjects', () => {
    for (const u of [admin, director, coordinator, secretary, teacher]) {
      expect(programPolicy.viewAny(u)).toBe(true);
      expect(subjectPolicy.viewAny(u)).toBe(true);
    }
  });

  it('does not let a student read the catalogue', () => {
    expect(programPolicy.viewAny(student)).toBe(false);
    expect(subjectPolicy.viewAny(student)).toBe(false);
  });

  it('gates writes on the manage permissions', () => {
    expect(programPolicy.create(director)).toBe(true);
    expect(programPolicy.create(teacher)).toBe(false);
    expect(subjectPolicy.update(coordinator)).toBe(true);
    expect(subjectPolicy.update(secretary)).toBe(false);
  });

  it('allows deleting a curriculum subject only with subjects.manage', () => {
    expect(curriculumSubjectPolicy.delete(coordinator)).toBe(true);
    expect(curriculumSubjectPolicy.delete(secretary)).toBe(false);
  });
});

describe('student, application, enrolment and credential policies', () => {
  it('requires students.manage to see students', () => {
    expect(studentPolicy.viewAny(secretary)).toBe(true);
    expect(studentPolicy.viewAny(admin)).toBe(true);
    expect(studentPolicy.viewAny(teacher)).toBe(false);
    expect(studentPolicy.viewAny(coordinator)).toBe(false);
  });

  it('limits applications to the office roles', () => {
    expect(applicationPolicy.viewAny(secretary)).toBe(true);
    expect(applicationPolicy.viewAny(teacher)).toBe(false);
    expect(applicationPolicy.review(secretary)).toBe(true);
    expect(applicationPolicy.review(coordinator)).toBe(false);
  });

  it('requires students.enroll to move an enrolment', () => {
    expect(enrollmentPolicy.transition(secretary)).toBe(true);
    expect(enrollmentPolicy.transition(director)).toBe(false);
  });

  it('requires credentials.verify to verify', () => {
    expect(studentCredentialPolicy.verify(secretary)).toBe(true);
    expect(studentCredentialPolicy.verify(director)).toBe(false);
  });

  it('never permits deletion', () => {
    expect(studentPolicy.delete(secretary)).toBe(false);
    expect(applicationPolicy.delete(admin)).toBe(false);
    expect(enrollmentPolicy.delete(admin)).toBe(false);
  });
});

describe('UserPolicy privilege boundaries', () => {
  const targetAdmin = { id: '99', roles: ['admin'] };
  const targetSuper = { id: '98', roles: ['super_admin'] };
  const targetStaff = { id: '97', roles: ['secretary'] };

  it('lets an admin manage ordinary staff', () => {
    expect(userPolicy.update(admin, targetStaff)).toBe(true);
  });

  it('stops an admin from editing another admin or a super admin', () => {
    expect(userPolicy.update(admin, targetAdmin)).toBe(false);
    expect(userPolicy.update(admin, targetSuper)).toBe(false);
  });

  it('lets a super admin manage anyone', () => {
    expect(userPolicy.update(superAdmin, targetAdmin)).toBe(true);
    expect(userPolicy.update(superAdmin, targetSuper)).toBe(true);
  });

  it('refuses self-deactivation even for a super admin', () => {
    // The one place the Gate::before blanket grant must NOT win, or an
    // account can lock itself out of the system.
    expect(userPolicy.toggleActive(superAdmin, { id: superAdmin.id, roles: ['super_admin'] })).toBe(false);
    expect(userPolicy.toggleActive(admin, { id: admin.id, roles: ['admin'] })).toBe(false);
  });

  it('allows deactivating someone else', () => {
    expect(userPolicy.toggleActive(admin, targetStaff)).toBe(true);
  });

  it('requires accounts.manage at all', () => {
    expect(userPolicy.viewAny(teacher)).toBe(false);
    expect(userPolicy.viewAny(secretary)).toBe(false);
    expect(hasRole(director, 'director')).toBe(true);
    expect(userPolicy.viewAny(director)).toBe(true);
  });
});

// --- Admin Accounts --------------------------------------------------------

describe('adminAccountPolicy', () => {
  const targetAdmin = { id: '99', roles: ['admin'] };

  it('is Super Admin only, for every operation', () => {
    expect(adminAccountPolicy.viewAny(superAdmin)).toBe(true);
    expect(adminAccountPolicy.create(superAdmin)).toBe(true);
    expect(adminAccountPolicy.generateAccessCode(superAdmin, targetAdmin)).toBe(true);
    expect(adminAccountPolicy.resetTemporaryPassword(superAdmin, targetAdmin)).toBe(true);
    expect(adminAccountPolicy.setStatus(superAdmin, targetAdmin)).toBe(true);
  });

  it('refuses an Admin, even one holding accounts.manage', () => {
    /*
     * THE test on this policy. `admin` holds accounts.manage, so the obvious
     * check — can(u, 'accounts.manage') — would let an Admin create peers and
     * issue their access codes. Issuing your own second factor is not a second
     * factor, so these check isSuperAdmin directly.
     */
    expect(can(admin, 'accounts.manage')).toBe(true);

    expect(adminAccountPolicy.viewAny(admin)).toBe(false);
    expect(adminAccountPolicy.create(admin)).toBe(false);
    expect(adminAccountPolicy.generateAccessCode(admin, targetAdmin)).toBe(false);
    expect(adminAccountPolicy.resetTemporaryPassword(admin, targetAdmin)).toBe(false);
    expect(adminAccountPolicy.setStatus(admin, targetAdmin)).toBe(false);
  });

  it('refuses a Director, who also holds accounts.manage', () => {
    expect(can(director, 'accounts.manage')).toBe(true);
    expect(adminAccountPolicy.viewAny(director)).toBe(false);
    expect(adminAccountPolicy.create(director)).toBe(false);
  });

  it('refuses everybody else outright', () => {
    for (const principal of [coordinator, secretary, teacher, student]) {
      expect(adminAccountPolicy.viewAny(principal)).toBe(false);
      expect(adminAccountPolicy.create(principal)).toBe(false);
      expect(adminAccountPolicy.generateAccessCode(principal, targetAdmin)).toBe(false);
    }
  });

  it('never lets a Super Admin act on their own account here', () => {
    /*
     * Suspending yourself locks the institution out of its own system, and
     * resetting your own password through this screen would route around the
     * ordinary change-password flow. The Gate::before blanket grant must not
     * win either of those.
     */
    const self = { id: superAdmin.id, roles: ['super_admin'] };
    expect(adminAccountPolicy.setStatus(superAdmin, self)).toBe(false);
    expect(adminAccountPolicy.generateAccessCode(superAdmin, self)).toBe(false);
    expect(adminAccountPolicy.resetTemporaryPassword(superAdmin, self)).toBe(false);
  });
});

describe('requiresAdminAccessCode', () => {
  it('requires one of an Admin', () => {
    expect(requiresAdminAccessCode(['admin'])).toBe(true);
  });

  it('exempts a Super Admin', () => {
    /*
     * Their privileged operations are confirmed with the static security code
     * instead. Requiring a code somebody else issues would mean the FIRST
     * Super Admin could never sign in at all.
     */
    expect(requiresAdminAccessCode(['super_admin'])).toBe(false);
    // And the exemption wins when both roles are held.
    expect(requiresAdminAccessCode(['super_admin', 'admin'])).toBe(false);
    expect(requiresAdminAccessCode(['admin', 'super_admin'])).toBe(false);
  });

  it('does not require one of anybody else', () => {
    for (const roles of [['director'], ['coordinator'], ['secretary'], ['teacher'], ['student'], []]) {
      expect(requiresAdminAccessCode(roles)).toBe(false);
    }
  });
});
