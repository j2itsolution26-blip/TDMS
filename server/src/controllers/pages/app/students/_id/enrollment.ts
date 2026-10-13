import { notFound } from '@/server/lib/page-signals';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { studentPolicy, studentCredentialPolicy, enrollmentPolicy } from '@/server/auth/policies';
import { getStudent, fullName, hasAllRequiredCredentialsVerified } from '@/server/services/student-service';
import {
  listStudentCredentials, listEnrollments, defaultSchoolYear,
} from '@/server/services/enrollment-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/enrollment/show.blade.php. */

export async function loadStudentsIdEnrollment({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPolicy.view(user));

  const { id } = params;
  if (!/^\d+$/.test(id)) notFound();

  const student = await getStudent(BigInt(id)).catch(() => null);
  if (!student) notFound();

  const [credentials, enrollments, allVerified] = await Promise.all([
    listStudentCredentials(student.id),
    listEnrollments(student.id),
    hasAllRequiredCredentialsVerified(student.id),
  ]);

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
    defaultSchoolYear: defaultSchoolYear(),
    canVerify: studentCredentialPolicy.verify(user),
    canEnroll: enrollmentPolicy.create(user),
  };
}
