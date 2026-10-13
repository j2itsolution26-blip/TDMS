import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { isSystemInitialized } from '@/server/services/setup-service';

/**
 * GET /api/v1/setup/status — whether this installation still needs its first
 * Super Admin. The database is the only authority; a database failure is a
 * 503 from the error handler, never "setup required".
 */
export const GET = withErrorHandling(async () => ok({ setupRequired: !(await isSystemInitialized()) }));
