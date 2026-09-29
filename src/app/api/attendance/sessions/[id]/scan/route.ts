import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { AppError } from '@/lib/http';
import { teachingPolicy } from '@/server/auth/policies';
import { consumeRateLimit } from '@/server/auth/rate-limit';
import { scanSchema } from '@/server/validation/teaching';
import { scan } from '@/server/services/teaching/attendance';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  // Generous for a queue of students at the door; a ceiling on guessing IDs.
  const verdict = await consumeRateLimit('attendance-scan', user.id, { max: 240, windowSeconds: 60 });
  if (verdict.limited) throw new AppError('Too many scans in a minute. Wait a moment and try again.', 429, undefined, 'RATE_LIMITED');
  const { code } = await parseJson(request, scanSchema);
  return ok(await scan(user, idSchema.parse((await params).id), code, requestContext(request)));
});
