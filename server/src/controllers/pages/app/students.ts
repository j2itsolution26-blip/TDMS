import { requireUser, authorizePage } from '@/server/auth/current-user';
import { studentPolicy } from '@/server/auth/policies';
import { listStudents } from '@/server/services/student-service';
import { countStudentsWithoutEnrollment } from '@/server/services/enrollment-gaps';
import { currentTerm, currentlyEnrolledWhere } from '@/server/services/program-enrollment';
import type { PageRequest } from '@/server/controllers/pages/types';
import { prisma } from '@/server/lib/prisma';
import { STUDENT_STATUSES } from '@shared/types/domain';
import { YEAR_LEVELS } from '@shared/lib/teaching';

/** Port of livewire/students/index.blade.php. */

export async function loadStudents({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPolicy.viewAny(user));

  const { page, search } = query;
  const parsed = Number(page ?? 1);
  const [allPrograms, years] = await Promise.all([
    // Inactive programs too, so a Programs page link to one still filters; the list marks them.
    prisma.program.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, isActive: true } }),
    // School years a new student can be enrolled into: every one not archived.
    prisma.schoolYear.findMany({ where: { status: { not: 'ARCHIVED' } }, orderBy: { startsOn: 'desc' }, select: { id: true, label: true, status: true, currentSemester: true } }),
  ]);
  const programs = allPrograms.map((p) => ({ id: p.id.toString(), name: p.name, code: p.code, isActive: p.isActive }));
  // Filters from the URL, kept only when they name something real.
  const program = programs.find((p) => p.id === query.program)?.id ?? '';
  const yearLevel = (YEAR_LEVELS as readonly number[]).includes(Number(query.yearLevel)) ? Number(query.yearLevel) : 0;
  const status = (STUDENT_STATUSES as readonly string[]).includes(query.status ?? '') ? query.status! : '';
  // ?enrollment=none: records with no enrollment at all, which never reach Enrollments.
  // ?enrollment=current: enrolled in the current term — the Programs page counts exactly these.
  const enrollment = query.enrollment === 'none' || query.enrollment === 'current' ? query.enrollment : '';
  const term = enrollment === 'current' ? await currentTerm() : null;
  const [data, withoutEnrollment] = await Promise.all([listStudents({
    page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
    search,
    programId: program ? BigInt(program) : undefined,
    yearLevel: yearLevel || undefined,
    status: status || undefined,
    withoutEnrollment: enrollment === 'none',
    currentlyEnrolled: enrollment === 'current' ? currentlyEnrolledWhere(term) : undefined,
  }), countStudentsWithoutEnrollment()]);

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    search: search ?? '',
    filters: { program, yearLevel: yearLevel ? String(yearLevel) : '', status, enrollment },
    /** Student records with no enrollment, whatever the filters. */
    withoutEnrollment,
    programs,
    /** The term "Enrolled this term" means, when that filter is on. */
    currentTerm: term?.label ?? null,
    schoolYears: years.map((y) => ({ id: y.id.toString(), label: y.label, status: y.status, currentSemester: y.currentSemester })),
    canCreate: studentPolicy.create(user),
    canUpdate: studentPolicy.update(user),
  };
}
