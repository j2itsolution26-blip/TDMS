import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditActor = { name: string; email: string } | "system";

function formatActor(actor: AuditActor): string {
  return actor === "system" ? "system" : `${actor.name} <${actor.email}>`;
}

/**
 * Mirrors the Laravel app's AuditLog::record() convention exactly
 * (same table, same column shapes) so both codebases produce a single
 * consistent audit trail during the migration.
 */
export async function recordAudit(params: {
  action: string;
  actor: AuditActor;
  target: string;
  details?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      actor: formatActor(params.actor),
      target: params.target,
      details: params.details ?? undefined,
      ipAddress: params.ipAddress ?? undefined,
      userAgent: params.userAgent ?? undefined,
    },
  });
}
