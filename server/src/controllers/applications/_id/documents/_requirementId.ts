import { ok, AppError } from '@/server/lib/http';
import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { uploadApplicationDocument } from '@/server/services/application-service';

type Params = { params: Promise<{ id: string; requirementId: string }> };

/** Multipart, the file in `file`. Type, size and content are checked by the storage layer. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.manageDocuments(user));
  const { id, requirementId } = await params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AppError('The upload could not be read.', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new AppError('Choose a file to upload.', 422, { file: ['Choose a file to upload.'] });
  return ok(await uploadApplicationDocument(user, idSchema.parse(id), idSchema.parse(requirementId), file, requestContext(request)), 201);
});
