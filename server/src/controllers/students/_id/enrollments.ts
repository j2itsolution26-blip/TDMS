import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { enrollmentPolicy } from '@/server/auth/policies';
import { enrollmentSchema, idSchema } from '@/server/schemas/schemas';
import { listEnrollments, createEnrollment } from '@/server/services/enrollment-service';
import { getStudent } from '@/server/services/student-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(enrollmentPolicy.viewAny(user));
  const { id } = await params;
  return ok(await listEnrollments(idSchema.parse(id)));
});

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(enrollmentPolicy.create(user));
  const { id } = await params;
  const studentId = idSchema.parse(id);
  // The curriculum always comes from the student record, never the client.
  const student = await getStudent(studentId);
  const body = (await request.json()) as Record<string, unknown>; // Zod validates it below
  const input = enrollmentSchema.parse({
    ...body,
    studentId: studentId.toString(),
    curriculumId: student.curriculumId.toString(),
  });
  return ok(await createEnrollment(input), 201);
});
