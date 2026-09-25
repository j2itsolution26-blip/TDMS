/**
 * Demo accounts — the Node replacement for DevSeeder.
 *
 * Run with: npm run db:seed:demo
 *
 * Idempotent, keyed on email: re-running repairs the existing rows
 * (username, password, role, active flag) rather than colliding with the
 * unique index the way User::factory()->create() did.
 *
 * Refuses to run when NODE_ENV=production, because it writes a well-known
 * password. See docs/authentication.md for why that matters when the
 * production and development databases are the same instance.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const GUARD = 'web';
const USER_MODEL_TYPE = 'App\\Models\\User';

/**
 * One account per role, so every dashboard variant can be signed into.
 * Usernames are the local part of the email; both resolve to the same
 * account through the "Username or Email" field.
 */
const ACCOUNTS = [
  { name: 'Super Admin Demo', username: 'superadmin', email: 'superadmin@tdms.test', role: 'super_admin' },
  { name: 'Admin Demo', username: 'admin', email: 'admin@tdms.test', role: 'admin' },
  { name: 'Dev Director', username: 'director', email: 'director@tdms.test', role: 'director' },
  { name: 'Dev Coordinator', username: 'coordinator', email: 'coordinator@tdms.test', role: 'coordinator' },
  { name: 'Dev Secretary', username: 'secretary', email: 'secretary@tdms.test', role: 'secretary' },
  { name: 'Dev Teacher', username: 'teacher', email: 'teacher@tdms.test', role: 'teacher' },
  { name: 'Dev Student', username: 'student', email: 'student@tdms.test', role: 'student' },
];

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? 'Password123!';
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-demo creates well-known demo credentials and must never run in production.');
  }

  console.log('Seeding demo accounts…');

  // One hash for all of them: the cost is deliberate (~300ms each at 12),
  // and they share a password anyway, so hashing seven times buys nothing.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, ROUNDS);

  for (const account of ACCOUNTS) {
    const role = await prisma.role.findFirst({
      where: { name: account.role, guardName: GUARD },
      select: { id: true },
    });

    if (!role) {
      throw new Error(`Role "${account.role}" is missing. Run "npm run db:seed" first.`);
    }

    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        name: account.name,
        username: account.username,
        email: account.email,
        password: passwordHash,
        emailVerifiedAt: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        name: account.name,
        username: account.username,
        password: passwordHash,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // Preserve an existing verification timestamp rather than resetting it.
    if (!user.emailVerifiedAt) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }

    // syncRoles([role]): exactly one role, never stacked duplicates.
    await prisma.modelHasRole.deleteMany({
      where: { modelType: USER_MODEL_TYPE, modelId: user.id },
    });
    await prisma.modelHasRole.create({
      data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: user.id },
    });

    console.log(`  ${account.username.padEnd(12)} ${account.email.padEnd(26)} -> ${account.role}`);
  }

  console.log(`\nSeeded ${ACCOUNTS.length} demo accounts.`);
  console.log('Sign in with either the username or the email address.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
