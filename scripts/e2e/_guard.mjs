// Refuse to run an end-to-end script against anything but a local database.
//
// Every script here creates and deletes throwaway rows. Prisma Client reads
// DATABASE_URL from the environment, or else from the project's .env — and a
// developer's .env usually points at the shared production database. So a
// plain `npm run test:…` would quietly write test data into production.
//
// Imported first by each script (ES modules evaluate imports in order, so this
// runs before any PrismaClient is created). Set ALLOW_REMOTE_DB=1 to override
// deliberately, e.g. for a disposable cloud database.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The URL Prisma will use: the environment first, then the project's .env. */
export function effectiveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(fileURLToPath(new URL('../../.env', import.meta.url)), 'utf8');
    const line = env.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    if (!line) return null;
    return line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  } catch {
    return null;
  }
}

export function isLocalDatabase(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

const url = effectiveDatabaseUrl();
if (process.env.ALLOW_REMOTE_DB !== '1' && (!url || !isLocalDatabase(url))) {
  // Never print the URL: it carries the password.
  const where = !url ? 'no DATABASE_URL is set' : `DATABASE_URL points at ${(() => { try { return new URL(url).hostname; } catch { return 'an unparseable address'; } })()}`;
  console.error(`Refusing to run: ${where}, not a local database.\n`
    + 'These scripts create and delete records. Point DATABASE_URL at a disposable local\n'
    + 'Postgres (e.g. postgresql://postgres:postgres@localhost:5432/tdms_test), or set\n'
    + 'ALLOW_REMOTE_DB=1 if you really mean a remote, disposable database.');
  process.exit(2);
}
