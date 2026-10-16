import { notFound } from '@/server/lib/page-signals';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { studentPolicy, studentCredentialPolicy, enrollmentPolicy } from '@/server/auth/policies';
import { getStudent, fullName, hasAllRequiredCredentialsVerified } from '@/server/services/student-service';
import { listStudentCredentials, listEnrollments } from '@/server/services/enrollment-service';
import { prisma } from '@/server/lib/prisma';
import { validYearLevels } from '@shared/lib/enrollment-term';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/enrollment/show.blade.php. */

export async function loadStudentsIdEnrollment({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPolicy.view(user));

  const { id } = params;
  if (!/^\d+$/.test(id)) notFound();

  const student = await getStudent(BigInt(id)).catch(() => null);
  if (!student) notFound();

  const [credentials, enrollments, allVerified, years, [{ final_year: finalYear } = { final_year: null }]] = await Promise.all([
    listStudentCredentials(student.id),
    listEnrollments(student.id),
    hasAllRequiredCredentialsVerified(student.id),
    // The New Enrollment Term choices: school years that are set up and not archived, the active one first.
    prisma.schoolYear.findMany({ where: { status: { not: 'ARCHIVED' } }, orderBy: [{ startsOn: 'desc' }], select: { label: true, status: true, currentSemester: true } }),
    prisma.$queryRaw<{ final_year: number | null }[]>`SELECT max(year_level)::int AS final_year FROM curriculum_subjects WHERE curriculum_id = ${student.curriculumId}`,
  ]);
  const schoolYears = [...years.filter((y) => y.status === 'ACTIVE'), ...years.filter((y) => y.status !== 'ACTIVE')];

  return {
    student: {
        id: student.id.toString(),
        studentNumber: student.studentNumber,
        fullName: fullName(student),
        yearLevel: student.yearLevel,
        status: student.status,
        program: { name: student.program.name, code: student.program.code },
        curriculum: { versionLabel: student.curriculum.versionLabel },
      },
    credentials,
    enrollments,
    allVerified,
    termOptions: {
      schoolYears: schoolYears.map((y) => ({ label: y.label, active: y.status === 'ACTIVE', currentSemester: y.currentSemester })),
      /** Up to the curriculum's final year (shared/lib/enrollment-term.ts). */
      yearLevels: validYearLevels(finalYear),
    },
    canVerify: studentCredentialPolicy.verify(user),
    // Uploading a credential's soft copy (Secretary, Processing Officer, Admin).
    canUpload: studentCredentialPolicy.upload(user),
    // Replacing a verified document (it goes back to review): verifiers only.
    canReplaceVerified: studentCredentialPolicy.replaceVerified(user),
    canEnroll: enrollmentPolicy.create(user),
  };
}
