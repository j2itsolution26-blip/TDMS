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
  managesStaff,
  adminAccountPolicy,
  requiresAdminAccessCode,
  systemPolicy,
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
// Matches prisma/seed.ts: the Director no longer holds accounts.manage.
const director = user(['director'], ['programs.manage', 'subjects.manage']);
/** A Director given the permission directly — a stray or deliberate grant. */
const directorWithGrant = user(['director'], ['programs.manage', 'subjects.manage', 'accounts.manage']);
const coordinator = user(['coordinator'], ['programs.manage', 'subjects.manage']);
const secretary = user(['secretary'], ['applications.review', 'credentials.verify', 'students.manage', 'students.enroll']);
const teacher = user(['teacher'], ['grades.enter', 'attendance.record']);
const student = user(['student'], ['academic-records.view.own']);

/*
 * The TDMS structure: the Super Admin controls the system and "shouldn't be
 * processing daily enrollment, classes, attendance, or grades". They see
 * everything (oversight) and act only at system level.
 */
describe('Super Admin: sees everything, runs no daily operations', () => {
  it('keeps the system-level abilities', () => {
    expect(isSuperAdmin(superAdmin)).toBe(true);
    for (const p of ['system.configure', 'audit-logs.view', 'reports.view.full', 'dashboard.view.institutional']) {
      expect(can(superAdmin, p)).toBe(true);
    }
  });

  it('no longer holds the operational permissions', () => {
    for (const p of [
      'programs.manage', 'subjects.manage', 'students.manage', 'students.enroll',
      'applications.review', 'credentials.verify', 'grades.publish', 'accounts.manage', 'anything.at.all',
    ]) {
      expect(can(superAdmin, p), p).toBe(false);
    }
  });

  it('even if their role row is granted one', () => {
    const superWithGrants = user(['super_admin'], ['programs.manage', 'students.enroll']);
    expect(can(superWithGrants, 'programs.manage')).toBe(false);
    expect(programPolicy.create(superWithGrants)).toBe(false);
  });

  it('can view every operational screen, and act on none', () => {
    expect(programPolicy.viewAny(superAdmin)).toBe(true);
    expect(subjectPolicy.viewAny(superAdmin)).toBe(true);
    expect(studentPolicy.viewAny(superAdmin)).toBe(true);
    expect(applicationPolicy.viewAny(superAdmin)).toBe(true);
    expect(enrollmentPolicy.viewAny(superAdmin)).toBe(true);
    expect(studentCredentialPolicy.viewAny(superAdmin)).toBe(true);

    expect(programPolicy.create(superAdmin)).toBe(false);
    expect(programPolicy.update(superAdmin)).toBe(false);
    expect(subjectPolicy.create(superAdmin)).toBe(false);
    expect(curriculumSubjectPolicy.delete(superAdmin)).toBe(false);
    expect(studentPolicy.create(superAdmin)).toBe(false);
    expect(studentPolicy.update(superAdmin)).toBe(false);
    expect(applicationPolicy.review(superAdmin)).toBe(false);
    expect(studentCredentialPolicy.verify(superAdmin)).toBe(false);
    expect(enrollmentPolicy.create(superAdmin)).toBe(false);
    expect(enrollmentPolicy.transition(superAdmin)).toBe(false);
  });

  it('leaves the Admin able to do the daily work', () => {
    expect(programPolicy.create(admin)).toBe(true);
    expect(studentPolicy.create(admin)).toBe(true);
    expect(applicationPolicy.review(admin)).toBe(true);
    expect(enrollmentPolicy.create(admin)).toBe(true);
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

  it('refuses self-deactivation', () => {
    expect(userPolicy.toggleActive(admin, { id: admin.id, roles: ['admin'] })).toBe(false);
  });

  it('allows deactivating someone else', () => {
    expect(userPolicy.toggleActive(admin, targetStaff)).toBe(true);
  });

  it('requires accounts.manage at all', () => {
    expect(userPolicy.viewAny(teacher)).toBe(false);
    expect(userPolicy.viewAny(secretary)).toBe(false);
    expect(userPolicy.viewAny(coordinator)).toBe(false);
  });
});

/*
 * The hierarchy:
 *
 *   SUPER ADMIN   system maintenance — creates and controls Admins
 *        |
 *      ADMIN       creates and manages staff
 *        +-- Director, Coordinator, Secretary, Teacher
 */
describe('staff management belongs to the Admin', () => {
  const targetStaff = { id: '97', roles: ['teacher'] };

  it('gives the Admin the whole Staff screen', () => {
    expect(managesStaff(admin)).toBe(true);
    expect(userPolicy.viewAny(admin)).toBe(true);
    expect(userPolicy.create(admin)).toBe(true);
    expect(userPolicy.update(admin, targetStaff)).toBe(true);
    expect(userPolicy.toggleActive(admin, targetStaff)).toBe(true);
    expect(userPolicy.resetPassword(admin, targetStaff)).toBe(true);
  });

  it('keeps the Super Admin out of it, blanket grant notwithstanding', () => {
    /*
     * THE test for this rule. can() would let the Super Admin through, so the
     * policy must not be built on it. The Super Admin creates Admins; Admins
     * staff the institution.
     */
    expect(managesStaff(superAdmin)).toBe(false);
    expect(userPolicy.viewAny(superAdmin)).toBe(false);
    expect(userPolicy.view(superAdmin)).toBe(false);
    expect(userPolicy.create(superAdmin)).toBe(false);
    expect(userPolicy.update(superAdmin, targetStaff)).toBe(false);
    expect(userPolicy.toggleActive(superAdmin, targetStaff)).toBe(false);
    expect(userPolicy.resetPassword(superAdmin, targetStaff)).toBe(false);
  });

  it('keeps the Super Admin out even if their role is granted the permission', () => {
    // A stray grant in the database must not quietly bring it back.
    const superWithGrant = user(['super_admin'], ['accounts.manage']);
    expect(userPolicy.viewAny(superWithGrant)).toBe(false);
  });

  it('keeps the Director out', () => {
    expect(hasRole(director, 'director')).toBe(true);
    expect(userPolicy.viewAny(director)).toBe(false);
    expect(userPolicy.create(director)).toBe(false);
    expect(userPolicy.update(director, targetStaff)).toBe(false);
  });

  it('follows the permission, so a deliberate grant is honoured', () => {
    // Moving staff management to another role is a database change, not a
    // code change.
    expect(userPolicy.viewAny(directorWithGrant)).toBe(true);
  });

  it('keeps privileged accounts off the Staff screen for everybody', () => {
    for (const target of [{ id: '99', roles: ['admin'] }, { id: '98', roles: ['super_admin'] }]) {
      expect(userPolicy.update(admin, target)).toBe(false);
      expect(userPolicy.update(superAdmin, target)).toBe(false);
    }
  });

  it('lets the Director monitor students without managing them', () => {
    expect(studentPolicy.viewAny(director)).toBe(true);
    expect(studentPolicy.view(director)).toBe(true);
    expect(studentPolicy.create(director)).toBe(false);
    expect(studentPolicy.update(director)).toBe(false);
  });

  it('still keeps Teachers and Coordinators out of student records', () => {
    expect(studentPolicy.viewAny(teacher)).toBe(false);
    expect(studentPolicy.viewAny(coordinator)).toBe(false);
  });

  it('never deletes a staff account', () => {
    expect(userPolicy.delete()).toBe(false);
  });
});

// --- Admin Accounts --------------------------------------------------------

describe('adminAccountPolicy', () => {
  const targetAdmin = { id: '99', roles: ['admin'] };

  it('is Super Admin only, for every operation', () => {
    expect(adminAccountPolicy.viewAny(superAdmin)).toBe(true);
    expect(adminAccountPolicy.create(superAdmin)).toBe(true);
    expect(adminAccountPolicy.manageAccessCodes(superAdmin)).toBe(true);
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
    expect(adminAccountPolicy.manageAccessCodes(admin)).toBe(false);
    expect(adminAccountPolicy.resetTemporaryPassword(admin, targetAdmin)).toBe(false);
    expect(adminAccountPolicy.setStatus(admin, targetAdmin)).toBe(false);
  });

  it('refuses a Director, even one granted accounts.manage', () => {
    expect(can(directorWithGrant, 'accounts.manage')).toBe(true);
    expect(adminAccountPolicy.viewAny(directorWithGrant)).toBe(false);
    expect(adminAccountPolicy.create(directorWithGrant)).toBe(false);
  });

  it('refuses everybody else outright', () => {
    for (const principal of [coordinator, secretary, teacher, student]) {
      expect(adminAccountPolicy.viewAny(principal)).toBe(false);
      expect(adminAccountPolicy.create(principal)).toBe(false);
      expect(adminAccountPolicy.manageAccessCodes(principal)).toBe(false);
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

describe('systemPolicy: audit logs and system health belong to the Super Admin', () => {
  it('lets the Super Admin in', () => {
    expect(systemPolicy.viewAuditLogs(superAdmin)).toBe(true);
    expect(systemPolicy.viewSystemHealth(superAdmin)).toBe(true);
  });

  it('keeps everybody else out — the Admin included, even with audit-logs.view', () => {
    const adminWithAudit = user(['admin'], ['audit-logs.view']);
    for (const principal of [admin, adminWithAudit, director, coordinator, secretary, teacher, student]) {
      expect(systemPolicy.viewAuditLogs(principal)).toBe(false);
      expect(systemPolicy.viewSystemHealth(principal)).toBe(false);
    }
  });
});
