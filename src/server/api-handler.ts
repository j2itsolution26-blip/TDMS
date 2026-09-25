import 'server-only';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError, fail } from '@/lib/http';
import { fieldErrors } from '@/server/validation/schemas';
import type { NextRequest } from 'next/server';

/**
 * Centralised error handling for route handlers (Phase 13).
 *
 * Exactly three things can reach the browser:
 *   * an AppError, whose message the service author wrote for a user;
 *   * a validation failure, as { field: [messages] };
 *   * "Something went wrong." for everything else.
 *
 * Anything unrecognised is logged server-side with its stack and replaced
 * with the generic message, so a Prisma error string, a constraint name, a
 * connection URL or an absolute file path can never be echoed back.
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ZodError) {
        return fail('The given data was invalid.', 422, fieldErrors(error));
      }

      if (error instanceof AppError) {
        return fail(error.message, error.status, error.errors);
      }

      console.error('[TDMS] Unhandled API error:', error);
      return fail('Something went wrong. Please try again.', 500);
    }
  };
}

/**
 * Parse and validate a JSON body, throwing ZodError for the wrapper.
 *
 * Generic over the schema rather than over a payload type, so the result is
 * z.output<S> — the type AFTER defaults are applied and ids are coerced to
 * bigint. Typing it as ZodSchema<T> would hand back the *input* type, where
 * every .default() field is still optional and every id is still a string.
 */
export async function parseJson<S extends ZodTypeAny>(
  request: NextRequest,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('The request body must be valid JSON.', 400);
  }
  return schema.parse(body);
}

/**
 * Best-effort client IP.
 *
 * On Vercel the platform sets x-forwarded-for and strips any client-supplied
 * copy, so the leftmost entry is trustworthy there. It is used only for
 * throttling and audit records, never for an authorisation decision.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? '127.0.0.1';
}

export function requestContext(request: NextRequest) {
  return { ip: clientIp(request), userAgent: request.headers.get('user-agent') };
}
