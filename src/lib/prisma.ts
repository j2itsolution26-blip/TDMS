import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './database-url';

/**
 * One client per process. Next.js dev reloads modules on every edit, so the
 * instance is parked on globalThis to avoid exhausting the Neon connection
 * pool with a new client per reload.
 *
 * The URL is passed explicitly rather than left to schema.prisma's
 * env("DATABASE_URL"), so the runtime can also accept the Laravel-style
 * DB_* variables the Vercel project already carries. See
 * src/lib/database-url.ts. The Prisma CLI still reads DATABASE_URL from the
 * schema, which is correct: migrations are run from a developer machine or
 * CI, where that variable is set.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = resolveDatabaseUrl();

  return new PrismaClient({
    // Omitted entirely when undefined, so Prisma falls back to the schema
    // and raises its own clear initialization error.
    ...(url ? { datasourceUrl: url } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
