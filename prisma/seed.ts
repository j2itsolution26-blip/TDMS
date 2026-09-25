/**
 * Production-safe seed — the Node replacement for DatabaseSeeder.
 *
 * Contains system configuration only (roles, permissions, credential
 * requirements), never demo accounts, exactly as the Laravel
 * DatabaseSeeder was scoped. Run with: npm run db:seed
 *
 * Fully idempotent: every write is an upsert or a findFirst-then-create, so
 * running it repeatedly converges rather than duplicating or failing. It is
 * safe against the live database.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GUARD = 'web';

/**
 * The role/permission matrix from
 * database/seeders/RolesAndPermissionsSeeder.php, copied without change.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [
    'dashboard.view.institutional',
    'programs.manage',
    'subjects.manage',
    'schedule.manage',
    'grades.review-change',
    'grades.publish',
    'practicum.manage',
    'graduation.evaluate',
    'reports.view.full',
    'audit-logs.view',
    'accounts.manage',
    'system.configure',
  ],
  admin: [
    'dashboard.view.institutional',
    'programs.manage',
    'subjects.manage',
    'schedule.manage',
    'grades.review-change',
    'grades.publish',
    'graduation.evaluate',
    'reports.view.full',
    'audit-logs.view',
    'accounts.manage',
    // Operational permissions so Admin can cover Secretary-level day-to-day
    // work without waiting on Super Admin — the point of this role.
    'applications.review',
    'credentials.verify',
    'students.manage',
    'students.enroll',
  ],
  director: [
    'dashboard.view.institutional',
    'programs.manage',
    'subjects.manage',
    'grades.review-change',
    'grades.publish',
    'graduation.evaluate',
    'reports.view.full',
    'audit-logs.view',
    'accounts.manage',
  ],
  coordinator: [
    'dashboard.view.institutional',
    'programs.manage',
    'subjects.manage',
    'schedule.manage',
    'grades.review-change',
    'grades.publish',
    'practicum.manage',
    'graduation.evaluate',
    'reports.view.full',
    'audit-logs.view.scoped',
  ],
  secretary: [
    'applications.review',
    'credentials.verify',
    'students.manage',
    'students.enroll',
    'reports.view.limited',
  ],
  teacher: [
    'attendance.record',
    'grades.enter',
    'grades.request-change',
    'practicum.evaluate',
    'reports.view.own-classes',
  ],
  student: ['academic-records.view.own'],
};

/** Port of CredentialRequirementsSeeder::GLOBAL_REQUIREMENTS. */
const GLOBAL_REQUIREMENTS = [
  'PSA Birth Certificate',
  'Form 137 / Transcript of Records',
  'Good Moral Character Certificate',
  '2x2 ID Photos',
];

async function seedRolesAndPermissions() {
  const permissionNames = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];

  // Permission::findOrCreate
  for (const name of permissionNames) {
    await prisma.permission.upsert({
      where: { name_guardName: { name, guardName: GUARD } },
      create: { name, guardName: GUARD, createdAt: new Date(), updatedAt: new Date() },
      update: {},
    });
  }

  const permissions = await prisma.permission.findMany({ where: { guardName: GUARD } });
  const permissionId = new Map(permissions.map((p) => [p.name, p.id]));

  for (const [roleName, granted] of Object.entries(ROLE_PERMISSIONS)) {
    // Role::findOrCreate
    const role = await prisma.role.upsert({
      where: { name_guardName: { name: roleName, guardName: GUARD } },
      create: { name: roleName, guardName: GUARD, createdAt: new Date(), updatedAt: new Date() },
      update: {},
    });

    /*
     * syncPermissions(): the role ends up with exactly this set. Detaching
     * first is what makes it a sync rather than an append — a permission
     * removed from the matrix above is removed from the database too.
     */
    const wanted = granted.map((n) => permissionId.get(n)).filter((id): id is bigint => id !== undefined);

    await prisma.roleHasPermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: wanted } },
    });

    for (const pid of wanted) {
      await prisma.roleHasPermission.upsert({
        where: { permissionId_roleId: { permissionId: pid, roleId: role.id } },
        create: { permissionId: pid, roleId: role.id },
        update: {},
      });
    }
  }

  console.log(
    `  roles: ${Object.keys(ROLE_PERMISSIONS).length}, permissions: ${permissionNames.length}`,
  );
}

async function seedCredentialRequirements() {
  for (const name of GLOBAL_REQUIREMENTS) {
    // firstOrCreate(['program_id' => null, 'name' => $name], [...])
    const existing = await prisma.credentialRequirement.findFirst({
      where: { programId: null, name },
      select: { id: true },
    });

    if (!existing) {
      await prisma.credentialRequirement.create({
        data: {
          programId: null,
          name,
          isRequired: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
  }

  console.log(`  credential requirements: ${GLOBAL_REQUIREMENTS.length}`);
}

async function main() {
  console.log('Seeding system configuration…');
  await seedRolesAndPermissions();
  await seedCredentialRequirements();
  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
