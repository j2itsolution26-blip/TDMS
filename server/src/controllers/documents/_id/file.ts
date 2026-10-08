import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { documentFile } from '@/server/services/teaching/documents';

type Params = { params: Promise<{ id: string }> };

/**
 * The only way to read an uploaded document: streamed through here after the
 * service has checked the caller is its owner or a reviewer. The storage URL
 * never leaves the server.
 */
export const GET = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  const file = await documentFile(user, idSchema.parse((await params).id));
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
