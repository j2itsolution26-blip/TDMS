import path from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { guardRequest, API_PREFIX } from '@/server/middleware/request-guard';
import { registerApiRoutes } from '@/server/routes/api.routes';
import { registerPageRoutes } from '@/server/routes/pages.routes';
import { sendWebResponse } from '@/server/routes/bridge';

/**
 * The TDMS HTTP server.
 *
 *   /api/v1/*        REST API and page loaders (JSON only)
 *   everything else  the React app — built files in production; in
 *                    development Vite serves them and proxies /api here
 */

/** Uploads are capped at 4 MB in the storage layer; this leaves room for the form. */
const BODY_LIMIT = 10 * 1024 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  // The camera is allowed for this site only: QR attendance scans with it.
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

export interface AppOptions {
  /** The built React app (client/dist). Omitted in development and tests. */
  clientDist?: string;
  logger?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // Behind Vercel/Render/nginx the client's address and scheme arrive in
    // X-Forwarded-* headers; the rate limits and Secure cookies need them.
    trustProxy: true,
    bodyLimit: BODY_LIMIT,
  });

  await app.register(cookie);

  /*
   * Bodies are kept raw. Controllers read them through the standard Request
   * API (request.json(), request.formData()), which needs the original bytes
   * — including multipart uploads — rather than Fastify's parsed object.
   */
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.addHook('onSend', async (_request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    return payload;
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith(`${API_PREFIX}/`)) return;
    const refusal = guardRequest(
      new Request(`${request.protocol}://${request.host}${request.url}`, {
        method: request.method,
        headers: Object.entries(request.headers).flatMap(([k, v]) =>
          v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, String(v)] as [string, string]],
        ),
      }),
    );
    if (refusal) await sendWebResponse(reply, refusal);
  });

  registerApiRoutes(app);
  registerPageRoutes(app);

  const dist = options.clientDist;
  const serveClient = dist !== undefined && existsSync(path.join(dist, 'index.html'));
  if (serveClient) {
    await app.register(fastifyStatic, { root: dist, wildcard: false, index: false });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ success: false, message: 'Not found.' });
    }
    // Client-side routes: every other GET is the React app — but a missing
    // file (anything with an extension) is a real 404, not the app's HTML.
    const pathname = request.url.split('?')[0] ?? '';
    const looksLikeFile = /\.[A-Za-z0-9]+$/.test(pathname);
    if (serveClient && !looksLikeFile && (request.method === 'GET' || request.method === 'HEAD')) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return reply.status(404).send('Not found');
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, '[TDMS] Unhandled server error');
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.status(status).send({
      success: false,
      message: status === 413 ? 'The upload is too large.' : status < 500 ? error.message : 'Something went wrong. Please try again.',
    });
  });

  return app;
}
