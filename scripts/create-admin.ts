/**
 * `npm run admin:create` — provision the first administrator from the shell.
 *
 * WHY THIS EXISTS
 *
 * The web bootstrap at /create-super-admin emails a six-digit code and creates
 * nothing until it comes back, which is right: it proves the person holds an
 * institutional mailbox before any account exists. But it presupposes a
 * working mail provider, and a brand-new installation may not have one yet —
 * leaving nobody able to sign in and configure the thing that would send the
 * mail.
 *
 * This command breaks that circle without weakening anything. It is not a
 * backdoor:
 *
 *   * it requires shell access AND the database credentials, which is a
 *     strictly higher bar than any web flow;
 *   * it invents no password — the operator types one, and it must satisfy
 *     the same strength rules as every other password in the system;
 *   * it enforces the same institutional-domain rule;
 *   * it refuses to run if an administrator already exists, so it cannot be
 *     used to quietly add a second one;
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
import bcrypt from 'bcryptjs';
import { resolveDatabaseUrl } from '../src/lib/database-url';
import { checkInstitutionalEmail } from '../src/lib/institutional-email';

const prisma = new PrismaClient({
  ...(resolveDatabaseUrl() ? { datasourceUrl: resolveDatabaseUrl()! } : {}),
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

  const existing = await prisma.modelHasRole.findFirst({
    where: { roleId: role.id, modelType: USER_MODEL_TYPE },
    select: { modelId: true },
  });
  if (existing) {
    console.error(
      [
        '',
        'An administrator already exists, so this command will not create another.',
        'Sign in and invite colleagues from the Staff screen instead.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const clash = await prisma.user.findUnique({
    where: { email: check.email },
    select: { id: true },
  });
  if (clash) {
    console.error(`\nAn account already exists for ${check.email}.\n`);
    process.exit(1);
  }

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

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const user = await prisma.user.create({
    data: {
      name,
      email: check.email,
      password: await bcrypt.hash(password, rounds),
      // Provisioning out-of-band is itself the proof of mailbox control.
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.modelHasRole.create({
    data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: user.id },
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
