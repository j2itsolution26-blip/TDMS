import type { NextRequest } from 'next/server';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { gradebookCsv } from '@/server/services/teaching/gradebook';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { filename, body } = await gradebookCsv(user, idSchema.parse((await params).id), requestContext(request));
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
