import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/server/session";
import { userHasPermission, userHasRole } from "@/server/rbac";
import { recordAudit } from "@/server/audit";
import { hashPassword } from "@/server/password";
import { isPasswordValid } from "@/lib/password-policy";
import { randomInt } from "crypto";

// Staff-manageable roles — deliberately excludes super_admin (created
// only via the one-time /setup flow) and student (not a staff account).
export const STAFF_ROLES = ["admin", "director", "coordinator", "secretary", "teacher"] as const;

/**
 * Which roles the given actor may assign. Only a super_admin can grant
 * the admin role itself — an admin can staff every operational role
 * below it, but can't create peers or escalate anyone to admin.
 */
export function assignableRoles(actor: SessionUser): string[] {
  return userHasRole(actor, ["super_admin"])
    ? [...STAFF_ROLES]
    : ["director", "coordinator", "secretary", "teacher"];
}

function assertCanManageAccounts(actor: SessionUser) {
  if (!userHasPermission(actor, "accounts.manage")) {
    throw new Error("You do not have permission to manage staff accounts.");
  }
}

/**
 * Only a super_admin may create or modify a super_admin/admin account —
 * enforced here, not just by hiding the option in the UI, so a direct
 * server action call can't be used to escalate privileges.
 */
async function assertCanTargetRole(actor: SessionUser, role: string) {
  if ((role === "super_admin" || role === "admin") && !userHasRole(actor, ["super_admin"])) {
    throw new Error("Only a Super Admin can manage Admin accounts.");
  }
}

async function assertCanTargetUser(actor: SessionUser, targetUserId: number) {
  const roles = await prisma.userRole.findMany({
    where: { userId: targetUserId },
    include: { role: true },
  });
  const roleNames = roles.map((r) => r.role.name);
  if (
    (roleNames.includes("super_admin") || roleNames.includes("admin")) &&
    !userHasRole(actor, ["super_admin"])
  ) {
    throw new Error("Only a Super Admin can manage Admin accounts.");
  }
}

export const staffInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  role: z.string().min(1, "Role is required"),
});

export type StaffInput = z.infer<typeof staffInputSchema>;

// Only the columns the staff list/edit UI actually renders — this
// list is small today but the point stands regardless: no reason to
// pull every user's password hash out of the database to display a
// name and a role.
const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  roles: { select: { role: { select: { name: true } } } },
} as const;

export async function listStaff(actor: SessionUser) {
  assertCanManageAccounts(actor);
  const users = await prisma.user.findMany({
    where: { roles: { some: { role: { name: { in: [...STAFF_ROLES] } } } } },
    select: STAFF_SELECT,
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    role: u.roles[0]?.role.name ?? "",
  }));
}

export async function getStaffMember(actor: SessionUser, id: number) {
  assertCanManageAccounts(actor);
  const user = await prisma.user.findUnique({
    where: { id },
    select: STAFF_SELECT,
  });
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.roles[0]?.role.name ?? "" };
}

export async function createStaff(actor: SessionUser, input: StaffInput) {
  assertCanManageAccounts(actor);
  const data = staffInputSchema.parse(input);
  await assertCanTargetRole(actor, data.role);

  if (!assignableRoles(actor).includes(data.role)) {
    throw new Error("You cannot assign that role.");
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) throw new Error(`A user with email "${data.email}" already exists.`);

  // Generated, not chosen — the account owner resets it on first login.
  // Never logged, never stored anywhere but the one-time reveal below.
  const generatedPassword = generateStrongPassword();
  const passwordHash = await hashPassword(generatedPassword);

  const role = await prisma.role.upsert({
    where: { name: data.role },
    update: {},
    create: { name: data.role },
  });

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: passwordHash,
      emailVerifiedAt: new Date(),
      isActive: true,
      roles: { create: { roleId: role.id } },
    },
  });

  await recordAudit({
    action: "STAFF_ACCOUNT_CREATED",
    actor: { name: actor.name, email: actor.email },
    target: `${user.name} <${user.email}>`,
    details: { role: data.role },
  });

  return { id: user.id, generatedPassword };
}

export async function updateStaff(actor: SessionUser, id: number, input: StaffInput) {
  assertCanManageAccounts(actor);
  const data = staffInputSchema.parse(input);
  await assertCanTargetUser(actor, id);
  await assertCanTargetRole(actor, data.role);

  if (!assignableRoles(actor).includes(data.role)) {
    throw new Error("You cannot assign that role.");
  }

  const conflict = await prisma.user.findFirst({
    where: { email: data.email, NOT: { id } },
    select: { id: true },
  });
  if (conflict) throw new Error(`A user with email "${data.email}" already exists.`);

  const before = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: { email: true, roles: { select: { role: { select: { name: true } } } } },
  });
  const oldRole = before.roles[0]?.role.name;

  const role = await prisma.role.upsert({
    where: { name: data.role },
    update: {},
    create: { name: data.role },
  });

  const user = await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userRole.create({ data: { userId: id, roleId: role.id } });
    return tx.user.update({ where: { id }, data: { name: data.name, email: data.email } });
  });

  await recordAudit({
    action: "STAFF_ACCOUNT_UPDATED",
    actor: { name: actor.name, email: actor.email },
    target: `${user.name} <${user.email}>`,
    details: { oldRole, newRole: data.role, oldEmail: before.email, newEmail: data.email },
  });

  return user;
}

export async function toggleStaffActive(actor: SessionUser, id: number) {
  assertCanManageAccounts(actor);
  if (id === actor.id) throw new Error("You cannot deactivate your own account.");
  await assertCanTargetUser(actor, id);

  const target = await prisma.user.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
  const user = await prisma.user.update({ where: { id }, data: { isActive: !target.isActive } });

  await recordAudit({
    action: user.isActive ? "STAFF_ACCOUNT_ACTIVATED" : "STAFF_ACCOUNT_DEACTIVATED",
    actor: { name: actor.name, email: actor.email },
    target: `${user.name} <${user.email}>`,
  });

  return user;
}

export async function resetStaffPassword(actor: SessionUser, id: number) {
  assertCanManageAccounts(actor);
  await assertCanTargetUser(actor, id);

  const generatedPassword = generateStrongPassword();
  const passwordHash = await hashPassword(generatedPassword);
  const user = await prisma.user.update({ where: { id }, data: { password: passwordHash } });

  await recordAudit({
    action: "STAFF_PASSWORD_RESET",
    actor: { name: actor.name, email: actor.email },
    target: `${user.name} <${user.email}>`,
  });

  return generatedPassword;
}

function generateStrongPassword(): string {
  // Guaranteed to satisfy PASSWORD_RULES (length/case/number/special)
  // rather than hoping a random byte string happens to, and drawn from
  // Node's CSPRNG rather than Math.random() since this becomes a real
  // (if temporary) account credential.
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%^&*-_=+";
  const all = lower + upper + digits + special;

  const pick = (chars: string) => chars[randomInt(chars.length)];

  const chars = [pick(lower), pick(upper), pick(digits), pick(special)];
  for (let i = 0; i < 16; i++) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  const password = chars.join("");
  return isPasswordValid(password) ? password : generateStrongPassword();
}
