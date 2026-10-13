import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Two test projects, because "@/lib" means different folders on each side.
 * Both are offline: the database is src/test/fake-prisma.ts.
 */
export default defineWorkspace([
  {
    test: {
      name: 'server',
      environment: 'node',
      include: ['server/src/**/*.test.ts', 'shared/**/*.test.ts'],
    },
    resolve: {
      alias: [
        { find: /^@\/server\//, replacement: `${here('./server/src')}/` },
        { find: /^@shared\//, replacement: `${here('./shared')}/` },
      ],
    },
  },
  {
    test: {
      name: 'client',
      environment: 'node',
      include: ['client/src/**/*.test.ts'],
    },
    resolve: {
      alias: [
        { find: /^@\/components\//, replacement: `${here('./client/src/components')}/` },
        { find: /^@\/lib\//, replacement: `${here('./client/src/lib')}/` },
        { find: /^@shared\//, replacement: `${here('./shared')}/` },
      ],
    },
  },
]);
