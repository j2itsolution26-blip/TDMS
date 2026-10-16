import { ok, AppError } from '@/server/lib/http';
import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentCredentialPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { credentialFile, uploadCredentialFile } from '@/server/services/enrollment-service';
import { isPreviewable } from '@shared/lib/credential-files';

type Params = { params: Promise<{ id: string }> };

/** Send a stored credential file: ?inline=1 opens a PDF or image in the browser, anything else downloads. Never cached. */
export function fileResponse(request: Request, file: { name: string; type: string; size: number | null; body: ReadableStream<Uint8Array> | Buffer }) {
  const inline = new URL(request.url).searchParams.get('inline') === '1' && isPreviewable(file.type);
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_');
  const body = file.body instanceof ReadableStream ? file.body : new Uint8Array(file.body);
  return new Response(body, {
    headers: {
      'Content-Type': file.type,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      ...(file.size ? { 'Content-Length': String(file.size) } : {}),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * A credential's current soft copy, streamed after the policy check. The
 * storage key never leaves the server.
 */
export const GET = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentCredentialPolicy.view(user));
  return fileResponse(request, await credentialFile(idSchema.parse((await params).id)));
});

/** Multipart, the file in `file`. Type, size and content are checked on the server (enrollment-service). */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentCredentialPolicy.upload(user));
  const id = idSchema.parse((await params).id);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AppError('The upload could not be read.', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new AppError('Choose a file to upload.', 422, { file: ['Choose a file to upload.'] });
  return ok(await uploadCredentialFile(user, id, file, requestContext(request)), 201);
});
