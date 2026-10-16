import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentCredentialPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { credentialDocumentFile } from '@/server/services/enrollment-service';
import { fileResponse } from '../../file';

type Params = { params: Promise<{ id: string; documentId: string }> };

/**
 * An earlier version of a credential's soft copy — same viewers and headers as
 * the current one. The document must belong to the credential in the address.
 */
export const GET = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentCredentialPolicy.view(user));
  const { id, documentId } = await params;
  return fileResponse(request, await credentialDocumentFile(idSchema.parse(id), idSchema.parse(documentId)));
});
