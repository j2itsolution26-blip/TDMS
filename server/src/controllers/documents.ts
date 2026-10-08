import { ok } from '@/server/lib/http';
import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { AppError } from '@/server/lib/http';
import { teachingPolicy } from '@/server/auth/policies';
import { documentFieldsSchema } from '@/server/schemas/teaching';
import { createDocument } from '@/server/services/teaching/documents';

/**
 * Multipart: the fields as JSON in `data`, the file (optional) in `file`.
 * The file is checked by the storage layer — type, size and signature.
 */
async function readForm(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AppError('The upload could not be read.', 400);
  }
  let data: unknown;
  try {
    data = JSON.parse(String(form.get('data') ?? '{}'));
  } catch {
    throw new AppError('The form data could not be read.', 400);
  }
  const file = form.get('file');
  return { fields: documentFieldsSchema.parse(data), file: file instanceof File && file.size > 0 ? file : null };
}

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { fields, file } = await readForm(request);
  return ok(await createDocument(user, fields, file, requestContext(request)), 201);
});
