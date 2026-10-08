import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { runWithRequest } from '@/server/plugins/request-context';
import { AppError } from '@/server/lib/http';
import { describePrismaFailure } from '@/server/lib/api-handler';
import { PageRedirect } from '@/server/lib/page-signals';
import { encodePageData } from '@/server/lib/page-encoding';
import { API_PREFIX } from '@/server/middleware/request-guard';
import type { PageLoader } from '@/server/controllers/pages/types';

/**
 * GET /api/v1/pages/<page path> — run one page loader.
 *
 * Answers, always as JSON:
 *   200 { success: true, data }        the props for the screen
 *   200 { success: true, redirect }    go here instead (e.g. not signed in yet)
 *   401 / 403 / 404                    the React app shows sign-in, a 403 or a 404
 *   503                                the database is unavailable
 *
 * A redirect is a 200 on purpose: fetch() follows real 3xx responses
 * silently, which would hide the destination from the app.
 */
export function mountPage(app: FastifyInstance, path: string, loader: PageLoader): void {
  app.get(`${API_PREFIX}/pages${path}`, (request, reply) =>
    runWithRequest(request, reply, async () => {
      reply.header('Cache-Control', 'no-store');
      const query: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries((request.query ?? {}) as Record<string, unknown>)) {
        query[key] = Array.isArray(value) ? String(value[0]) : value === undefined ? undefined : String(value);
      }

      try {
        const data = await loader({ params: (request.params ?? {}) as Record<string, string>, query });
        return reply.send({ success: true, data: encodePageData(data) });
      } catch (error) {
        if (error instanceof PageRedirect) return reply.send({ success: true, redirect: error.location });
        if (error instanceof AppError) {
          return reply.status(error.status).send({ success: false, message: error.message, ...(error.code ? { code: error.code } : {}) });
        }
        if (error instanceof ZodError) return reply.status(404).send({ success: false, message: 'Not found.' });

        const described = describePrismaFailure(error);
        if (described) {
          request.log.error({ err: error }, '[TDMS] Database error while loading a page');
          return reply.status(described.status).send({ success: false, code: 'DATABASE_ERROR', message: described.message });
        }

        request.log.error({ err: error }, '[TDMS] Page loader failed');
        return reply.status(500).send({ success: false, message: 'Something went wrong. Please try again.' });
      }
    }),
  );
}
