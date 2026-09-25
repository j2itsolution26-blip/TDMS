import { notFound } from 'next/navigation';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { studentPolicy, studentCredentialPolicy, enrollmentPolicy } from '@/server/auth/policies';
import { getStudent, fullName, hasAllRequiredCredentialsVerified } from '@/server/services/student-service';
import {
  listStudentCredentials, listEnrollments, defaultSchoolYear,
} from '@/server/services/enrollment-service';
import EnrollmentScreen from '@/components/screens/EnrollmentScreen';

/** Port of livewire/enrollment/show.blade.php. */
export const dynamic = 'force-dynamic';

export default async function EnrollmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  authorizePage(studentPolicy.view(user));

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const student = await getStudent(BigInt(id)).catch(() => null);
  if (!student) notFound();

  const [credentials, enrollments, allVerified] = await Promise.all([
    listStudentCredentials(student.id),
    listEnrollments(student.id),
    hasAllRequiredCredentialsVerified(student.id),
  ]);

  return (
    <EnrollmentScreen
      student={{
        id: student.id.toString(),
        studentNumber: student.studentNumber,
        fullName: fullName(student),
        yearLevel: student.yearLevel,
        status: student.status,
        program: { name: student.program.name, code: student.program.code },
        curriculum: { versionLabel: student.curriculum.versionLabel },
      }}
      credentials={credentials}
      enrollments={enrollments}
      allVerified={allVerified}
      defaultSchoolYear={defaultSchoolYear()}
      canVerify={studentCredentialPolicy.verify(user)}
      canEnroll={enrollmentPolicy.create(user)}
    />
  );
}
