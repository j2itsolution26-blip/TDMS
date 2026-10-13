import { AsyncLocalStorage } from 'node:async_hooks';
// Brings in @fastify/cookie's request.cookies / reply.setCookie types.
import type {} from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Per-request context for code far from the route handler.
 *
 * The session, the Admin login challenge and the Google sign-in state all
 * read and write cookies from inside services, without the request being
 * threaded through every call. Each request runs inside this store (see
 * runWithRequest, wrapped around every route in src/routes), so `cookies()`
 * always refers to the request being served — never to another one in
 * flight.
 */

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  maxAge?: number;
  expires?: Date;
  domain?: string;
}

interface Store {
  request: FastifyRequest;
  reply: FastifyReply;
  /** Cookie values as this request now sees them, including its own writes. */
  jar: Map<string, string | null>;
  /** Results of requestMemo() calls, for this request only. */
  memo: Map<symbol, Map<string, Promise<unknown>>>;
}

const storage = new AsyncLocalStorage<Store>();

export function runWithRequest<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  fn: () => Promise<T>,
): Promise<T> {
  const jar = new Map<string, string | null>();
  for (const [name, value] of Object.entries(request.cookies ?? {})) {
    if (typeof value === 'string') jar.set(name, value);
  }
  return storage.run({ request, reply, jar, memo: new Map() }, fn);
}

function current(): Store {
  const store = storage.getStore();
  if (!store) throw new Error('No request in scope: cookies() was called outside a request.');
  return store;
}

export interface CookieJar {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string): void;
}

/** The current request's cookies. Writes go out on the response. */
export async function cookies(): Promise<CookieJar> {
  const store = current();
  return {
    get(name) {
      const value = store.jar.get(name);
      return typeof value === 'string' ? { name, value } : undefined;
    },
    set(name, value, options = {}) {
      store.jar.set(name, value);
      store.reply.setCookie(name, value, { path: '/', ...options });
    },
    delete(name) {
      store.jar.set(name, null);
      store.reply.clearCookie(name, { path: '/' });
    },
  };
}

/** The current request's headers, for code that needs the client's details. */
export function requestHeaders(): FastifyRequest['headers'] {
  return current().request.headers;
}

/**
 * Memoize an async function for the duration of one request.
 *
 * Several things a page needs (the signed-in user, the active school year)
 * are asked for more than once while serving it; this makes the second ask
 * free without letting the answer leak into another request.
 */
export function requestMemo<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  // One identity per wrapped function, so two functions never share entries.
  const self = Symbol(fn.name || 'memo');
  return (...args: A) => {
    const store = storage.getStore();
    if (!store) return fn(...args);

    let perFunction = store.memo.get(self) as Map<string, Promise<R>> | undefined;
    if (!perFunction) {
      perFunction = new Map();
      store.memo.set(self, perFunction as Map<string, Promise<unknown>>);
    }

    // Arguments are ids, users and plain options; BigInt ids need a string form.
    const key = JSON.stringify(args, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));
    const cached = perFunction.get(key);
    if (cached) return cached;

    const result = fn(...args);
    perFunction.set(key, result);
    return result;
  };
}
