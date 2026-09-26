/**
 * Resolve the PostgreSQL connection string.
 *
 * `DATABASE_URL` is the single variable this application wants, and it wins
 * whenever it is set.
 *
 * The fallback exists because the Vercel project was configured for the
 * Laravel deployment and carries the connection as Laravel's separate parts
 * — DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD, DB_SSLMODE.
 * Those are the same credentials for the same database, so composing them
 * is strictly better than asking someone to copy a password into a second
 * variable by hand: fewer places for the secret to live, and no chance of a
 * transcription error.
 *
 * This is a migration compatibility shim, not the intended long-term shape.
 * Once `DATABASE_URL` is set in the project, the DB_* variables can be
 * deleted and this fallback stops being reachable.
 */
export type DatabaseUrlSource = 'DATABASE_URL' | 'DB_* parts' | 'none';

export function databaseUrlSource(): DatabaseUrlSource {
  if (process.env.DATABASE_URL) return 'DATABASE_URL';
  if (composeFromParts()) return 'DB_* parts';
  return 'none';
}

function composeFromParts(): string | undefined {
  const host = process.env.DB_HOST;
  const database = process.env.DB_DATABASE;
  const username = process.env.DB_USERNAME;

  // Without these three there is nothing to build.
  if (!host || !database || !username) return undefined;

  const password = process.env.DB_PASSWORD ?? '';
  const port = process.env.DB_PORT ?? '5432';

  /*
   * The credentials go through encodeURIComponent because a password is
   * free-form: an unescaped @, / or : would silently produce a URL that
   * parses as a different host, database or port.
   */
  const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;

  const params = new URLSearchParams();
  // Neon refuses plaintext connections, and Laravel defaulted this to require.
  params.set('sslmode', process.env.DB_SSLMODE ?? 'require');

  return `postgresql://${auth}@${host}:${port}/${encodeURIComponent(database)}?${params.toString()}`;
}

/**
 * The URL to hand to PrismaClient, or undefined if nothing is configured —
 * in which case Prisma raises its own initialization error, which
 * /api/health reports.
 */
export function resolveDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? composeFromParts();
}
