/**
 * `npm run db:fresh` — return the database to a clean institutional state.
 *
 * WHAT IT DELETES: every user account, every session and token, and all
 * operational/academic records — students, applications, enrolments,
 * credentials, programmes, curricula, subjects and the audit log.
 *
 * WHAT IT KEEPS: system configuration. Roles, permissions, their pivots, and
 * the credential-requirement catalogue survive, because those are the
 * institution's configuration rather than anyone's data.
 *
 * Run `npm run db:seed` afterwards to top the configuration back up, then
 * create the first administrator (web bootstrap, or `npm run admin:create`).
 *
 * ---------------------------------------------------------------------------
 * SAFETY
 *
 * This is irreversible, so it refuses to run unless BOTH hold:
 *
 *   1. NODE_ENV is not production; and
 *   2. CONFIRM_DB_FRESH is set to the literal name of the target database.
 *
 * The second is the important one. A guard on NODE_ENV alone is close to
 * useless here, because the dangerous case is a developer machine with
 * NODE_ENV unset pointed at a production DATABASE_URL — which is exactly the
 * situation this project is in. Naming the database out loud means you cannot
 * wipe one you did not mean to.
 *
 *   CONFIRM_DB_FRESH=neondb npm run db:fresh
 */
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from '../src/lib/database-url';

const prisma = new PrismaClient({
  ...(resolveDatabaseUrl() ? { datasourceUrl: resolveDatabaseUrl()! } : {}),
});

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

async function main() {
  const database = targetDatabaseName();
  const host = (() => {
    try {
      return new URL(resolveDatabaseUrl() ?? '').hostname;
    } catch {
      return 'unknown';
    }
  })();

  if (!database) {
    refuse(
      'No database is configured.',
      'Set DATABASE_URL (or the DB_* variables) first.',
    );
  }

  if (process.env.NODE_ENV === 'production') {
    refuse(
      'NODE_ENV is "production".',
      'This command is for a fresh or development installation only.',
    );
  }

  if (process.env.CONFIRM_DB_FRESH !== database) {
    refuse(
      `This would permanently delete all accounts and academic records in "${database}" on ${host}.`,
      `If that is what you want, name it explicitly:\n\n    CONFIRM_DB_FRESH=${database} npm run db:fresh`,
    );
  }

  console.log(`Resetting "${database}" on ${host} …\n`);

  /*
   * Ordered so foreign keys are satisfied without disabling them: children
   * before parents. Several relations are onDelete: Restrict, so the order
   * genuinely matters — a wrong order fails loudly rather than half-deleting.
   * The whole thing is one transaction, so it either completes or does not.
   */
  const deleted = await prisma.$transaction(async (tx) => {
    const counts: Record<string, number> = {};
    const run = async (label: string, fn: () => Promise<{ count: number }>) => {
      counts[label] = (await fn()).count;
    };

    // Auth artefacts
    await run('sessions', () => tx.session.deleteMany({}));
    await run('emailVerificationTokens', () => tx.emailVerificationToken.deleteMany({}));
    await run('passwordResetRequests', () => tx.passwordResetRequest.deleteMany({}));
    await run('legacyPasswordResetTokens', () => tx.passwordResetToken.deleteMany({}));

    // Academic / operational records
    await run('enrollmentStatusHistory', () => tx.enrollmentStatusHistory.deleteMany({}));
    await run('enrollments', () => tx.enrollment.deleteMany({}));
    await run('studentCredentials', () => tx.studentCredential.deleteMany({}));
    await run('applications', () => tx.application.deleteMany({}));
    await run('students', () => tx.student.deleteMany({}));
    await run('curriculumSubjects', () => tx.curriculumSubject.deleteMany({}));
    await run('curricula', () => tx.curriculum.deleteMany({}));
    await run('subjects', () => tx.subject.deleteMany({}));

    /*
     * Programmes are configuration in some institutions and data in others.
     * They are removed here because the ones in this database were created
     * while testing; the real catalogue is entered by an administrator.
     * Credential REQUIREMENTS are kept — those are the standing document
     * checklist, seeded by db:seed.
     */
    await run('programs', () => tx.program.deleteMany({}));

    // Accounts and their role assignments.
    await run('modelHasRoles', () => tx.modelHasRole.deleteMany({}));
    await run('modelHasPermissions', () => tx.modelHasPermission.deleteMany({}));
    await run('users', () => tx.user.deleteMany({}));

    // The audit log describes activity that no longer exists.
    await run('auditLogs', () => tx.auditLog.deleteMany({}));

    return counts;
  });

  for (const [table, count] of Object.entries(deleted)) {
    if (count > 0) console.log(`  deleted ${String(count).padStart(5)}  ${table}`);
  }

  // Prove the configuration survived.
  const [roles, permissions, rolePerms, requirements, users] = await Promise.all([
    prisma.role.count(),
    prisma.permission.count(),
    prisma.roleHasPermission.count(),
    prisma.credentialRequirement.count(),
    prisma.user.count(),
  ]);

  console.log('\nKept (system configuration):');
  console.log(`  roles                  ${roles}`);
  console.log(`  permissions            ${permissions}`);
  console.log(`  role permissions       ${rolePerms}`);
  console.log(`  credential requirements ${requirements}`);
  console.log(`\nUsers remaining: ${users}`);

  console.log('\nNext:');
  console.log('  npm run db:seed        # top up roles, permissions, requirements');
  console.log('  npm run admin:create   # provision the first administrator');
  console.log('  …or open /login and use "Create Super Admin".\n');
}

main()
  .catch((error) => {
    console.error('\nFailed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
