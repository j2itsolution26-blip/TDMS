import { PrismaClient } from '@prisma/client';

/**
 * One client per process. Next.js dev reloads modules on every edit, so the
 * instance is parked on globalThis to avoid exhausting the Neon connection
 * pool with a new client per reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
