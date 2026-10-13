/**
 * `npm run admin:create` — provision the first administrator from the shell.
 *
 * WHY THIS EXISTS
 *
 * First-run setup normally happens in the browser, at /setup. This is the
 * same step from a shell, for an operator who would rather not open a
 * browser. It is not a backdoor:
 *
 *   * it requires shell access AND the database credentials, which is a
 *     strictly higher bar than any web flow;
 *   * it invents no password — the operator types one, and it must satisfy
 *     the same strength rules as every other password in the system;
 *   * it enforces the same institutional-domain rule;
 *   * it refuses to run once the system is initialized (any user exists, or
 *     first-run setup has completed), so it cannot quietly add a second
 *     administrator, and it marks the system initialized in the same
 *     transaction that creates the account;
 *   * it writes an audit record naming itself.
 *
 * Marking the email verified is justified because provisioning out-of-band
 * IS the proof of control — the same reasoning behind `createsuperuser` in
 * other frameworks.
 *
 * Usage:
 *   npm run admin:create -- --name "Maria Santos" --email maria.santos@asiancollege.edu.ph
 *
 * The password is read from ADMIN_PASSWORD, or prompted for (hidden) if that
 * is not set. It is never passed as an argument, because arguments show up in
 * shell history and in the process list.
 */
import { createInterface } from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { hash as argon2Hash } from '@node-rs/argon2';
import { resolveDatabaseUrl } from '../server/src/lib/database-url';
import { checkInstitutionalEmail } from '../server/src/lib/institutional-email';

const prisma = new PrismaClient({
  ...(resolveDatabaseUrl() ? { datasourceUrl: resolveDatabaseUrl()! } : {}),
  // Same as src/lib/prisma.ts: the default 5 s is too short over a slow link.
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});

const USER_MODEL_TYPE = 'App\\Models\\User';
const GUARD = 'web';
const ROLE = 'super_admin';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/** Same rules as src/server/validation/schemas.ts strongPassword. */
function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push('at least 12 characters');
  if (!/[a-z]/.test(password)) problems.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('a symbol');
  return problems;
}

async function promptHidden(question: string): Promise<string> {
  const input = process.stdin;
  const rl = createInterface({ input, output: process.stdout, terminal: true });

  return new Promise((resolve) => {
    // Suppress echo so the password does not appear on screen.
    const asAny = rl as unknown as { _writeToOutput: (s: string) => void };
    const original = asAny._writeToOutput.bind(rl);
    asAny._writeToOutput = (s: string) => {
      original(s.includes(question) ? s : '');
    };

    rl.question(question, (answer) => {
      asAny._writeToOutput = original;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function initialized(): Promise<boolean> {
  const [installation, users] = await Promise.all([
    prisma.systemInstallation.findUnique({ where: { id: 1 }, select: { id: true } }),
    prisma.user.count(),
  ]);
  return installation !== null || users > 0;
}

function refuseInitialized(): never {
  console.error(
    [
      '',
      'TDMS has already been initialized, so this command will not create another administrator.',
      'Sign in and add colleagues from the Admin Accounts and Staff screens instead.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

async function main() {
  const name = arg('name')?.trim();
  const rawEmail = arg('email')?.trim();

  if (!name || !rawEmail) {
    console.error(
      [
        '',
        'Usage:',
        '  npm run admin:create -- --name "Full Name" --email name@asiancollege.edu.ph',
        '',
        'The password is read from ADMIN_PASSWORD, or prompted for if unset.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const check = checkInstitutionalEmail(rawEmail);
  if (!check.ok) {
    console.error(`\n${check.message}\n`);
    process.exit(1);
  }

  // Refuse to add a second administrator behind the application's back.
  const role = await prisma.role.findFirst({
    where: { name: ROLE, guardName: GUARD },
    select: { id: true },
  });
  if (!role) {
    console.error('\nRoles are not seeded yet. Run "npm run db:seed" first.\n');
    process.exit(1);
  }

  if (await initialized()) refuseInitialized();

  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden('Choose a password: '));

  const problems = passwordProblems(password);
  if (problems.length > 0) {
    console.error(`\nThat password needs ${problems.join(', ')}.\n`);
    process.exit(1);
  }

  if (!process.env.ADMIN_PASSWORD) {
    const again = await promptHidden('Confirm password: ');
    if (again !== password) {
      console.error('\nThose passwords do not match.\n');
      process.exit(1);
    }
  }

  // Same Argon2id parameters as src/server/auth/password.ts, which is
  // server-only and cannot be imported from a script.
  const passwordHash = await argon2Hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const now = new Date();

  // Same shape as first-run setup at /setup: the installation row's primary
  // key is what stops this racing a browser setup into two administrators.
  const user = await prisma
    .$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) refuseInitialized();
      await tx.systemInstallation.create({ data: { id: 1, initializedAt: now, method: 'cli' } });

      const created = await tx.user.create({
        data: {
          name,
          email: check.email,
          password: passwordHash,
          mustChangePassword: false,
          passwordChangedAt: now,
          // Provisioning out-of-band is itself the proof of mailbox control.
          emailVerifiedAt: now,
          status: 'ACTIVE',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.modelHasRole.create({
        data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: created.id },
      });

      return created;
    })
    .catch((error) => {
      if ((error as { code?: string }).code === 'P2002') refuseInitialized();
      throw error;
    });

  await prisma.auditLog.create({
    data: {
      action: 'INITIAL_SUPER_ADMIN_PROVISIONED',
      actor: 'CLI_ADMIN_CREATE',
      target: `Super Admin Account (${user.email})`,
      details: { user_id: user.id.toString(), name: user.name, role: ROLE },
    },
  });

  console.log(
    [
      '',
      `Created administrator ${user.email}`,
      `  role    ${ROLE}`,
      '  status  ACTIVE (email marked verified — provisioned out-of-band)',
      '',
      'Sign in at /login with that email address and the password you chose.',
      '',
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    console.error('\nFailed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
