import 'server-only';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError, fail } from '@/lib/http';
import { fieldErrors } from '@/server/validation/schemas';
import type { NextRequest } from 'next/server';

/**
 * A Prisma failure translated into something the reader can act on.
 *
 * The generic "Something went wrong" is the right answer for a genuinely
 * unexpected error, but it is the wrong answer for an infrastructure fault
 * that has an obvious remedy. A missing table means migrations have not been
 * run; an unreachable host means the database is down or misconfigured.
 * Saying so turns a support ticket into a one-line fix.
 *
 * What these messages never contain: a table or column name, a constraint
 * name, a host, a connection string, a credential, or any part of Prisma's
 * own message. They name a *class* of problem and a remedy, nothing more.
 * The full error, including the stack, goes to the server log.
 */
function describePrismaFailure(error: unknown): { message: string; status: number } | null {
  const e = error as { name?: unknown; code?: unknown };
  const name = typeof e?.name === 'string' ? e.name : '';
  const code = typeof e?.code === 'string' ? e.code : '';

  // The client could not be constructed at all — almost always a missing or
  // malformed connection string.
  if (name === 'PrismaClientInitializationError') {
    return {
      message: 'The database is not configured correctly. Please contact the administrator.',
      status: 503,
    };
  }

  switch (code) {
    // P2021 table missing, P2022 column missing: the schema is behind the code.
    case 'P2021':
    case 'P2022':
      return {
        message:
          'The database schema is out of date, so this action cannot be completed. Pending migrations need to be applied.',
        status: 503,
      };

    // Cannot reach the server / timed out.
    case 'P1001':
    case 'P1002':
    case 'P1008':
      return {
        message: 'Unable to reach the database. Please try again in a moment.',
        status: 503,
      };

    // Credentials rejected, or the named database does not exist.
    case 'P1000':
    case 'P1003':
      return {
        message: 'The database is not configured correctly. Please contact the administrator.',
        status: 503,
      };

    /*
     * A unique violation that reached here rather than being handled by the
     * service is still worth naming, because "already exists" is actionable
     * where "went wrong" is not. The offending field is deliberately not
     * echoed: the service layer is where a per-field message belongs.
     */
    case 'P2002':
      return { message: 'That record already exists.', status: 409 };

    default:
      return null;
  }
}

/**
 * Centralised error handling for route handlers.
 *
 * What can reach the browser:
 *   * an AppError, whose message the service author wrote for a user;
 *   * a validation failure, as { field: [messages] };
 *   * a recognised infrastructure fault, described by class and remedy;
 *   * "Something went wrong." for anything genuinely unexpected.
 *
 * Everything is logged server-side with its stack. No Prisma message,
 * constraint name, connection URL or file path is ever echoed back.
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

      const described = describePrismaFailure(error);
      if (described) {
        // Logged in full: the safe message above names no specifics.
        console.error('[TDMS] Database error:', error);
        return fail(described.message, described.status);
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
