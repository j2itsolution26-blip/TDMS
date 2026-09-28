import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import {
  applicationPolicy,
  enrollmentPolicy,
  hasRole,
  programPolicy,
  studentCredentialPolicy,
  subjectPolicy,
  userPolicy,
} from '@/server/auth/policies';
import type { AuthUser } from '@/types/domain';
import type { PendingItem, PendingWork, SetupProgress, SetupStep } from '@/types/dashboard';

/**
 * The Admin's workspace state: how far setup has got, and what is waiting.
 *
 * Both are read in two places in one request — the shell (the sidebar's setup
 * card and the bell) and the dashboard (the hero, the checklist and
 * Operational Tasks). React's `cache` makes that one set of queries per
 * request, and one source means the places can never disagree.
 *
 * Every step and every count comes from the records: "a program exists", not
 * a flag somebody ticked. There is no setup table, so nothing new is stored.
 */

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** Users holding a role — joined to users, as model_has_roles has no foreign key. */
async function usersWithRole(role: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(DISTINCT u.id)::int AS n
    FROM model_has_roles m
    JOIN users u ON u.id = m.model_id
    JOIN roles r ON r.id = m.role_id
    WHERE m.model_type = ${USER_MODEL_TYPE} AND r.guard_name = ${GUARD} AND r.name = ${role}`;
  return Number(rows[0]?.n ?? 0);
}

/**
 * Getting TDMS ready, for an Admin. Null for anybody else: setup is the
 * Admin's job, and a Super Admin or Secretary has nothing to do with it.
 *
 * The five steps, each decided by the data:
 *   1. Admin account   — this account is past its temporary password
 *   2. First program   — a program exists
 *   3. Subjects        — a subject exists
 *   4. Teaching staff  — a teacher account exists
 *   5. Applications    — an application has been recorded
 */
export const getAdminSetup = cache(async (user: AuthUser): Promise<SetupProgress | null> => {
  if (!hasRole(user, 'admin')) return null;

  const [programs, subjects, teachers, applications] = await Promise.all([
    programPolicy.viewAny(user) ? prisma.program.count() : 0,
    subjectPolicy.viewAny(user) ? prisma.subject.count() : 0,
    userPolicy.viewAny(user) ? usersWithRole('teacher') : 0,
    applicationPolicy.viewAny(user) ? prisma.application.count() : 0,
  ]);

  const steps: SetupStep[] = [
    {
      key: 'admin',
      title: 'Set up admin account',
      detail: user.mustChangePassword ? 'Replace your temporary password' : 'Account verified',
      done: !user.mustChangePassword,
      href: '/profile',
      action: 'Open',
    },
    {
      key: 'program',
      title: 'Create your first program',
      detail: programs > 0 ? `${plural(programs, 'program')} created` : 'The diploma programs you offer',
      done: programs > 0,
      href: '/programs?new=1',
      action: 'Create',
    },
    {
      key: 'subjects',
      title: 'Add subjects',
      detail: subjects > 0 ? `${plural(subjects, 'subject')} in the catalogue` : 'What your programs teach',
      done: subjects > 0,
      href: '/subjects?new=1',
      action: 'Add',
    },
    {
      key: 'staff',
      title: 'Invite Diploma Instructors',
      detail: teachers > 0 ? `${plural(teachers, 'Diploma Instructor account')} so far` : 'No Diploma Instructor accounts yet',
      done: teachers > 0,
      href: '/staff?new=1',
      action: 'Invite',
    },
    {
      key: 'applications',
      title: 'Open applications',
      detail: applications > 0 ? `${plural(applications, 'application')} received` : 'Record your first application',
      done: applications > 0,
      href: '/applications?new=1',
      action: 'Open',
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  return {
    steps,
    completed,
    total: steps.length,
    current: steps.find((s) => !s.done)?.key ?? null,
    complete: completed === steps.length,
  };
});

/**
 * Work waiting on the office, as counts — each one only for a viewer whose
 * policy lets them see that record. Documents link to Students because
 * documents are reviewed on each student's record.
 */
export const getPendingWork = cache(async (user: AuthUser): Promise<PendingWork> => {
  const canApps = applicationPolicy.viewAny(user);
  const canDocs = studentCredentialPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);
  const canStaff = hasRole(user, 'admin') && userPolicy.viewAny(user);

  const [apps, docs, enroll, staff] = await Promise.all([
    canApps ? prisma.application.groupBy({ by: ['status'], _count: { _all: true } }) : null,
    canDocs ? prisma.studentCredential.count({ where: { status: { in: ['submitted', 'under_review'] } } }) : null,
    canEnroll ? prisma.enrollment.count({ where: { status: 'pending' } }) : null,
    canStaff ? staffAwaitingSetup() : null,
  ]);

  const items: PendingItem[] = [];
  if (apps) {
    const by = Object.fromEntries(apps.map((r) => [r.status, r._count._all]));
    items.push({
      key: 'applications',
      label: 'Applications to review',
      count: (by.submitted ?? 0) + (by.under_review ?? 0),
      href: '/applications?status=submitted',
    });
    items.push({ key: 'returned', label: 'Returned applications', count: by.returned ?? 0, href: '/applications?status=returned' });
  }
  if (docs !== null) items.push({ key: 'documents', label: 'Documents to verify', count: docs, href: '/students' });
  if (enroll !== null) items.push({ key: 'enrollments', label: 'Enrollments to approve', count: enroll, href: '/enrollments?status=pending' });
  if (staff !== null) items.push({ key: 'staff', label: 'Staff accounts not yet set up', count: staff, href: '/staff' });

  return { items, total: items.reduce((sum, i) => sum + i.count, 0) };
});

/** Staff accounts still on a temporary password — issued but never used. */
async function staffAwaitingSetup(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(DISTINCT u.id)::int AS n
    FROM model_has_roles m
    JOIN users u ON u.id = m.model_id
    JOIN roles r ON r.id = m.role_id
    WHERE m.model_type = ${USER_MODEL_TYPE} AND r.guard_name = ${GUARD}
      AND r.name NOT IN ('student', 'super_admin', 'admin')
      AND u.must_change_password = true`;
  return Number(rows[0]?.n ?? 0);
}

/**
 * Programs for the header search, which jumps straight to one. A diploma
 * catalogue is small; the cap only guards against the unexpected.
 */
export const getSearchablePrograms = cache(async (user: AuthUser) => {
  if (!programPolicy.viewAny(user)) return [];
  const rows = await prisma.program.findMany({
    orderBy: { name: 'asc' },
    take: 200,
    select: { id: true, code: true, name: true },
  });
  return rows.map((p) => ({ id: p.id.toString(), code: p.code, name: p.name }));
});
