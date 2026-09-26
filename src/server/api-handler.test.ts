import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withErrorHandling } from './api-handler';
import { AppError } from '@/lib/http';

/**
 * The error wrapper decides what a failure looks like from outside.
 *
 * The case that prompted these: a missing table surfaced as "Something went
 * wrong. Please try again." — technically safe, but it told nobody that the
 * remedy was to run a migration. These pin the mapping, and pin the rule that
 * no message ever carries a table name, host, credential or Prisma string.
 */

function fakePrismaError(code: string) {
  const error = new Error('Prisma says something with table names in it');
  (error as unknown as { code: string }).code = code;
  error.name = 'PrismaClientKnownRequestError';
  return error;
}

async function callWith(error: unknown) {
  const handler = withErrorHandling(async () => {
    throw error;
  });
  const response = await handler();
  return { status: response.status, body: await response.json() };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The wrapper is supposed to log; silence it so test output stays readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('recognised database faults get an actionable message', () => {
  it('P2021 (missing table) says the schema is out of date', async () => {
    const { status, body } = await callWith(fakePrismaError('P2021'));
    expect(status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/schema is out of date/i);
    expect(body.message).toMatch(/migrations/i);
  });

  it('P2022 (missing column) is treated the same way', async () => {
    const { status, body } = await callWith(fakePrismaError('P2022'));
    expect(status).toBe(503);
    expect(body.message).toMatch(/schema is out of date/i);
  });

  it('P1001 (unreachable) says so and invites a retry', async () => {
    const { status, body } = await callWith(fakePrismaError('P1001'));
    expect(status).toBe(503);
    expect(body.message).toMatch(/unable to reach the database/i);
  });

  it('P1000 (credentials rejected) points at configuration', async () => {
    const { status, body } = await callWith(fakePrismaError('P1000'));
    expect(status).toBe(503);
    expect(body.message).toMatch(/not configured correctly/i);
  });

  it('P2002 (unique violation) says the record already exists', async () => {
    const { status, body } = await callWith(fakePrismaError('P2002'));
    expect(status).toBe(409);
    expect(body.message).toMatch(/already exists/i);
  });

  it('an initialization failure points at configuration', async () => {
    const error = new Error('Environment variable not found: DATABASE_URL');
    error.name = 'PrismaClientInitializationError';
    const { status, body } = await callWith(error);
    expect(status).toBe(503);
    expect(body.message).toMatch(/not configured correctly/i);
  });
});

describe('nothing internal leaks, whatever the failure', () => {
  const secrets = [
    'pending_admin_registrations',
    'postgresql://',
    'neondb_owner',
    'DATABASE_URL',
    'Prisma',
    'at Object.<anonymous>',
    'node_modules',
    'C:\\Users',
  ];

  it('a database fault names no identifier, host or path', async () => {
    const error = new Error(
      'The table `public.pending_admin_registrations` does not exist. postgresql://neondb_owner:pw@host/db',
    );
    (error as unknown as { code: string }).code = 'P2021';
    const { body } = await callWith(error);

    const serialised = JSON.stringify(body);
    for (const secret of secrets) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('an unrecognised error still gets the generic message', async () => {
    const { status, body } = await callWith(new Error('something nobody predicted'));
    expect(status).toBe(500);
    expect(body.message).toBe('Something went wrong. Please try again.');
    expect(JSON.stringify(body)).not.toContain('nobody predicted');
  });

  it('logs the real error server-side in every case', async () => {
    await callWith(fakePrismaError('P2021'));
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockClear();
    await callWith(new Error('unexpected'));
    expect(consoleError).toHaveBeenCalled();
  });
});

describe('deliberate errors are passed through unchanged', () => {
  it('an AppError keeps its message and status', async () => {
    const { status, body } = await callWith(new AppError('This email is already registered.', 422));
    expect(status).toBe(422);
    expect(body.message).toBe('This email is already registered.');
  });

  it('an AppError is not mistaken for a database fault', async () => {
    // A service-authored message must win even if something on the error
    // looks like a Prisma code.
    const error = new AppError("We couldn't send the verification email. Please try again.", 502);
    (error as unknown as { code: string }).code = 'P2021';
    const { status, body } = await callWith(error);
    expect(status).toBe(502);
    expect(body.message).toMatch(/verification email/i);
  });
});
