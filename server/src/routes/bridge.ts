import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import { runWithRequest } from '@/server/plugins/request-context';

/**
 * Controllers are written against the platform's own Fetch API — they take a
 * standard `Request` and return a standard `Response` — which keeps them
 * independent of the HTTP framework and trivially testable (the tests build a
 * `new Request(...)` and call them directly).
 *
 * This file is the only place Fastify meets them: it turns the incoming
 * Fastify request into a `Request`, runs the controller inside the request
 * context (so cookies() works anywhere below it), and writes the `Response`
 * back through Fastify's reply.
 */

export type RouteParams = Record<string, string>;
/** P is the controller's own parameter shape, e.g. { id: string } for /students/:id. */
export type Controller<P = RouteParams> = (request: Request, context: { params: Promise<P> }) => Promise<Response>;

export function toWebRequest(request: FastifyRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else headers.set(name, String(value));
  }

  const url = `${request.protocol}://${request.host}${request.url}`;
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && Buffer.isBuffer(request.body);

  return new Request(url, {
    method: request.method,
    headers,
    ...(hasBody ? { body: request.body as Buffer } : {}),
  });
}

export async function sendWebResponse(reply: FastifyReply, response: Response): Promise<FastifyReply> {
  reply.status(response.status);

  response.headers.forEach((value, name) => {
    // Set-Cookie is the one header that must stay as separate lines.
    if (name.toLowerCase() !== 'set-cookie') reply.header(name, value);
  });
  for (const cookie of response.headers.getSetCookie()) {
    const existing = reply.getHeader('set-cookie');
    const list = existing === undefined ? [] : Array.isArray(existing) ? existing : [String(existing)];
    reply.header('set-cookie', [...list, cookie]);
  }

  if (response.body === null) return reply.send();
  return reply.send(Buffer.from(await response.arrayBuffer()));
}

/**
 * Fastify fills request.params from the :names in `url`, which are the same
 * names the controller's file path declares — so the cast to P is exact.
 */
export function mount<P>(app: FastifyInstance, method: HTTPMethods, url: string, controller: Controller<P>): void {
  app.route({
    method,
    url,
    handler: (request, reply) =>
      runWithRequest(request, reply, async () => {
        const response = await controller(toWebRequest(request), {
          params: Promise.resolve((request.params ?? {}) as P),
        });
        return sendWebResponse(reply, response);
      }),
  });
}
