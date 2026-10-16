import path from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { guardRequest, API_PREFIX } from '@/server/middleware/request-guard';
import { registerApiRoutes } from '@/server/routes/api.routes';
import { registerPageRoutes } from '@/server/routes/pages.routes';
import { sendWebResponse } from '@/server/routes/bridge';
import { securityHeaders } from '@/server/lib/security-headers';

/**
 * The TDMS HTTP server.
 *
 *   /api/v1/*        REST API and page loaders (JSON only)
 *   everything else  the React app — built files in production; in
 *                    development Vite serves them and proxies /api here
 */

/** Uploads are capped at 4 MB in the storage layer; this leaves room for the form. */
const BODY_LIMIT = 10 * 1024 * 1024;

const SECURITY_HEADERS = securityHeaders(process.env.NODE_ENV === 'production');

/**
 * Whether X-Forwarded-* headers come from a proxy we trust.
 *
 * True by default: on Vercel (and behind Render or nginx) the platform sets
 * X-Forwarded-For and strips anything the client sent, and the rate limits
 * and Secure cookies depend on it. A self-hosted server that faces the
 * internet directly must set TRUST_PROXY=false — otherwise any client could
 * send its own X-Forwarded-For and appear to come from a fresh address on
 * every request, walking straight past the sign-in throttle.
 */
export function proxyTrusted(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.TRUST_PROXY?.trim().toLowerCase();
  return !(value === 'false' || value === '0' || value === 'no');
}

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
    trustProxy: proxyTrusted(),
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

  /*
   * Without a trusted proxy the forwarded headers are whatever the client
   * typed. Replace them with the socket address, so every reader — the rate
   * limits (clientIp), the audit log, the request context — sees the real one.
   */
  if (!proxyTrusted()) {
    app.addHook('onRequest', async (request) => {
      request.headers['x-forwarded-for'] = request.socket.remoteAddress ?? '';
      delete request.headers['x-real-ip'];
    });
  }

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
