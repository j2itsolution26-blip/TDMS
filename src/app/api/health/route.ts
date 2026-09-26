import { NextResponse } from 'next/server';

/**
 * GET /api/health — operational diagnostics.
 *
 * This exists because the first production failure of this application was
 * a missing DATABASE_URL, and the only symptom was an opaque
 * "Something went wrong / Reference: 2214728234" on every page that touched
 * the database. That is unnecessarily hard to diagnose from the outside.
 *
 * WHAT IT DISCLOSES, deliberately:
 *   * whether a trivial query succeeds;
 *   * the Prisma error CODE if it does not (P1001 unreachable, P1000 auth
 *     rejected, P2021 missing table, …) — a code, never a message;
 *   * for each required environment variable, whether it is SET — a boolean,
 *     never the value.
 *
 * WHAT IT NEVER DISCLOSES: any value, connection string, host, credential,
 * error message or stack trace. The variable names are already public in
 * .env.example and docs/deployment.md, so their presence leaks nothing an
 * attacker could not read in the repository.
 *
 * It is unauthenticated on purpose: it is needed precisely when nobody can
 * sign in.
 */
export const dynamic = 'force-dynamic';

/** Names only — see the note above. */
const REQUIRED_ENV = ['DATABASE_URL'] as const;
const OPTIONAL_ENV = ['SESSION_LIFETIME_MINUTES', 'BCRYPT_ROUNDS'] as const;

function prismaErrorCode(error: unknown): string | null {
  const e = error as { code?: unknown; name?: unknown };
  if (typeof e?.code === 'string') return e.code;
  // Initialization errors carry a name but not always a code.
  if (typeof e?.name === 'string') return e.name;
  return null;
}

export async function GET() {
  const env: Record<string, boolean> = {};
  for (const key of [...REQUIRED_ENV, ...OPTIONAL_ENV]) {
    env[key] = Boolean(process.env[key]);
  }

  const missingRequired = REQUIRED_ENV.filter((k) => !process.env[k]);

  /*
   * When a required variable is missing, list the NAMES of the database-ish
   * variables that ARE present. This distinguishes the three ways it goes
   * wrong — set on the wrong environment (nothing here), a typo (a
   * near-miss shows up), or only the old Laravel names surviving (DB_URL,
   * DB_HOST, …) — without which you are reduced to guessing.
   *
   * Names only, never values, and only while something is actually broken:
   * once the variable is set this disappears from the response.
   */
  const databaseEnvNamesPresent =
    missingRequired.length > 0
      ? Object.keys(process.env)
          .filter((k) => /DATABASE|POSTGRES|NEON|^DB_|_URL$/i.test(k))
          .sort()
      : undefined;

  let database: 'ok' | 'unreachable' = 'unreachable';
  let errorCode: string | null = null;
  let latencyMs: number | null = null;

  const startedAt = Date.now();
  try {
    /*
     * Imported lazily, inside the try. PrismaClient validates its datasource
     * when it is constructed, so a missing DATABASE_URL throws at module
     * scope — which would make this endpoint 500 in exactly the situation it
     * exists to explain. A dynamic import keeps that failure catchable.
     */
    const { prisma } = await import('@/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    database = 'ok';
    latencyMs = Date.now() - startedAt;
  } catch (error) {
    errorCode = prismaErrorCode(error);
    // Full detail goes to the server log only.
    console.error('[TDMS] Health check: database unreachable.', error);
  }

  const healthy = database === 'ok' && missingRequired.length === 0;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database,
      ...(latencyMs !== null ? { latencyMs } : {}),
      ...(errorCode ? { errorCode } : {}),
      env,
      ...(missingRequired.length > 0 ? { missingRequiredEnv: missingRequired } : {}),
      ...(databaseEnvNamesPresent ? { databaseEnvNamesPresent } : {}),
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
