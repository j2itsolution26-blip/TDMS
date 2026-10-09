import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

/**
 * The API as a Vercel Function (api/index.js re-exports this).
 *
 * On Vercel nothing calls listen(): each request arrives as a plain Node
 * (req, res) pair. The same Fastify app that `npm start` serves is built once
 * per function instance and handed each request, so routes, the request
 * guard, cookies and error handling are identical in both deployments.
 *
 * The React app is not served from here: Vercel's CDN serves client/dist,
 * and vercel.json sends only /api/* to this function.
 */
let app: Promise<FastifyInstance> | null = null;

function instance(): Promise<FastifyInstance> {
  app ??= buildApp({ logger: true }).then(async (built) => {
    await built.ready();
    return built;
  });
  // A failed start (e.g. a bad import) must not poison every later request.
  app.catch(() => {
    app = null;
  });
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const fastify = await instance();
  fastify.server.emit('request', req, res);
}
