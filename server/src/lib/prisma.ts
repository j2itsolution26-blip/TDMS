import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './database-url';

/**
 * One client per process. In development the server restarts on every edit
 * (tsx watch); parking the instance on globalThis also keeps test runs and
 * any hot reload from opening a new connection pool each time.
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
    /*
     * Prisma's defaults (2 s to start, 5 s to finish) assume a database next
     * door. Across regions each query is a long round trip, and first-run
     * setup's five-query transaction was aborted at 5.4 s (P2028) and rolled
     * back. These bound a transaction without failing honest ones on a slow
     * link.
     */
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
