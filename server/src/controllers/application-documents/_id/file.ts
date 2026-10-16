import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { applicationDocumentFile } from '@/server/services/application-service';

type Params = { params: Promise<{ id: string }> };

/** An applicant's document, streamed after the policy check; the storage key never leaves the server. */
export const GET = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.view(user));
  const file = await applicationDocumentFile(idSchema.parse((await params).id));
  const inline = new URL(request.url).searchParams.get('inline') === '1' && (file.type === 'application/pdf' || file.type.startsWith('image/'));
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
});
