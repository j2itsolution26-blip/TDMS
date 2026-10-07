/**
 * `npm run db:fresh` — return TDMS to a brand-new, uninitialized installation.
 *
 * WHAT IT DELETES: every row of every table that is not listed in KEEP below
 * — all accounts and role assignments, sessions, tokens, access codes,
 * temporary credentials, students, applications, enrolments, classes,
 * sections, grades, attendance, notifications, the audit log, throttle
 * counters, and the `system_installation` row. With that row gone and no
 * users left, /setup opens again.
 *
 * WHAT IT KEEPS: the structure (no table, column, migration or schema is
 * touched) and the institution's configuration — roles, permissions and their
 * grants, the credential-requirement checklist, programs, curricula,
 * subjects and school years.
 *
 * HOW IT ORDERS DELETES. Not from a hand-written list, which goes stale the
 * moment a table is added. The foreign keys are read from PostgreSQL itself
 * and the tables are deleted children-first. Before anything is deleted it
 * proves that no kept table references a table being emptied; if one ever
 * does, it refuses rather than guess.
 *
 * ---------------------------------------------------------------------------
 * SAFETY
 *
 * Without --apply it is a dry run: it prints what would be deleted and
 * changes nothing. With --apply it still refuses unless BOTH hold:
 *
 *   1. NODE_ENV is not production; and
 *   2. CONFIRM_DB_FRESH is set to the literal name of the target database.
 *
 * Naming the database out loud is the important one: the dangerous case is a
 * developer machine whose DATABASE_URL points at the live database.
 *
 * Before deleting, the rows about to go are written to a JSON file under
 * backups/ (git-ignored). It contains password hashes and personal data —
 * keep it private, and delete it once you no longer need it. Pass
 * --no-backup to skip it, e.g. when a Neon branch already serves as backup.
 *
 *   npm run db:fresh                                    # dry run
 *   CONFIRM_DB_FRESH=neondb npm run db:fresh -- --apply # the real thing
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from '../src/lib/database-url';

const prisma = new PrismaClient({
  ...(resolveDatabaseUrl() ? { datasourceUrl: resolveDatabaseUrl()! } : {}),
});

/** System configuration and the academic catalogue. Everything else is emptied. */
const KEEP = new Set([
  'roles',
  'permissions',
  'role_has_permissions',
  'credential_requirements',
  'programs',
  'curricula',
  'curriculum_subjects',
  'subjects',
  'school_years',
]);

/** Migration bookkeeping — Prisma's, and Laravel's from before the port. */
const NEVER_TOUCH = new Set(['_prisma_migrations', 'migrations']);

const APPLY = process.argv.includes('--apply');
const BACKUP = !process.argv.includes('--no-backup');

function targetDatabaseName(): string {
  const url = resolveDatabaseUrl();
  if (!url) return '';
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

function refuse(reason: string, hint: string): never {
  console.error(`\nRefusing to reset the database.\n\n  ${reason}\n\n  ${hint}\n`);
  process.exit(1);
}

/** Identifiers come from the catalogue, but are quoted anyway. */
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

interface ForeignKey {
  child: string;
  parent: string;
}

/**
 * Children before parents, among the tables being emptied. A cycle would
 * mean no safe order exists, so it refuses instead of guessing.
 */
function deletionOrder(tables: string[], keys: ForeignKey[]): string[] {
  const set = new Set(tables);
  const children = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
  for (const { child, parent } of keys) {
    if (set.has(child) && set.has(parent) && child !== parent) children.get(parent)!.add(child);
  }

  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (table: string, path: string[]) => {
    if (state.get(table) === 'done') return;
    if (state.get(table) === 'visiting') {
      refuse(`Foreign keys form a cycle: ${[...path, table].join(' -> ')}.`, 'Resolve it by hand.');
    }
    state.set(table, 'visiting');
    for (const child of [...children.get(table)!].sort()) visit(child, [...path, table]);
    state.set(table, 'done');
    order.push(table);
  };
  for (const table of [...tables].sort()) visit(table, []);

  // `order` has every table after all of its children; deleting in this
  // order empties children first.
  return order;
}

async function main() {
  const database = targetDatabaseName();
  const host = (() => {
    try {
      return new URL(resolveDatabaseUrl() ?? '').hostname;
    } catch {
      return 'unknown';
    }
  })();

  if (!database) refuse('No database is configured.', 'Set DATABASE_URL (or the DB_* variables) first.');

  const tables = (
    await prisma.$queryRaw<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  ).map((r) => r.name);

  const keys = await prisma.$queryRaw<ForeignKey[]>`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`;
  const strip = (name: string) => name.replace(/^"|"$/g, '');
  for (const key of keys) {
    key.child = strip(key.child);
    key.parent = strip(key.parent);
  }

  const missing = [...KEEP].filter((t) => !tables.includes(t));
  if (missing.length > 0) {
    refuse(`Expected tables are missing: ${missing.join(', ')}.`, 'Run "npm run db:migrate" first.');
  }

  const toEmpty = tables.filter((t) => !KEEP.has(t) && !NEVER_TOUCH.has(t));

  // A kept row pointing at an emptied table would block the delete or be
  // silently changed by it. Neither is acceptable for configuration.
  const crossing = keys.filter((k) => KEEP.has(k.child) && toEmpty.includes(k.parent));
  if (crossing.length > 0) {
    refuse(
      `Kept tables reference tables that would be emptied: ${crossing.map((k) => `${k.child} -> ${k.parent}`).join(', ')}.`,
      'Decide whether those tables are configuration or data, and update KEEP in scripts/db-fresh.ts.',
    );
  }

  const order = deletionOrder(toEmpty, keys);

  const counts = new Map<string, number>();
  for (const table of order) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM ${quote(table)}`,
    );
    counts.set(table, n);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  console.log(`\nTarget: "${database}" on ${host}`);
  console.log(`\n${APPLY ? 'Deleting' : 'Would delete'} (children first):`);
  for (const table of order) console.log(`  ${String(counts.get(table)).padStart(6)}  ${table}`);
  console.log(`  ${String(total).padStart(6)}  rows in total`);
  console.log(`\nKeeping: ${[...KEEP].join(', ')}`);

  if (!APPLY) {
    console.log(
      `\nDry run — nothing was changed. To reset for real:\n\n    CONFIRM_DB_FRESH=${database} npm run db:fresh -- --apply\n`,
    );
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    refuse('NODE_ENV is "production".', 'This command is for a fresh or development installation only.');
  }
  if (process.env.CONFIRM_DB_FRESH !== database) {
    refuse(
      `This would permanently delete ${total} rows in "${database}" on ${host}.`,
      `If that is what you want, name it explicitly:\n\n    CONFIRM_DB_FRESH=${database} npm run db:fresh -- --apply`,
    );
  }

  if (BACKUP && total > 0) {
    const backup: Record<string, unknown[]> = {};
    for (const table of order) {
      if (counts.get(table)! > 0) {
        backup[table] = await prisma.$queryRawUnsafe(`SELECT * FROM ${quote(table)}`);
      }
    }
    const dir = join(process.cwd(), 'backups');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `db-fresh-${database}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(
      file,
      JSON.stringify(backup, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
      { mode: 0o600 },
    );
    console.log(`\nBackup of the deleted rows: ${file}`);
    console.log('  It contains password hashes and personal data. Keep it private.');
  }

  // One transaction: it either completes or changes nothing.
  await prisma.$transaction(
    async (tx) => {
      for (const table of order) await tx.$executeRawUnsafe(`DELETE FROM ${quote(table)}`);
    },
    { timeout: 120_000 },
  );

  const [users, installation, roles, permissions] = await Promise.all([
    prisma.user.count(),
    prisma.systemInstallation.count(),
    prisma.role.count(),
    prisma.permission.count(),
  ]);

  console.log(`\nDone. Users: ${users}. Installation: ${installation === 0 ? 'UNINITIALIZED' : 'INITIALIZED'}.`);
  console.log(`Configuration kept: ${roles} roles, ${permissions} permissions.`);
  console.log('\nNext: open /setup (with SETUP_KEY set) or run `npm run admin:create`.\n');
}

main()
  .catch((error) => {
    console.error('\nFailed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
