import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    for (const permName of permissions) {
      const permission = await prisma.permission.upsert({
        where: { name: permName },
        update: {},
        create: { name: permName },
      });

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const superAdminEmail = "superadmin@gmail.com";
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "super_admin" },
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      name: "Super Admin",
      email: superAdminEmail,
      password: await bcrypt.hash("Css@123456", 12),
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: superAdmin.id, roleId: superAdminRole.id },
  });

  console.log(`Seeded ${Object.keys(ROLE_PERMISSIONS).length} roles and super admin (${superAdminEmail}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
