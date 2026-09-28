import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Port of App\Models\AuditLog::record().
 *
 * Same table, same column semantics, so entries written by Laravel and by
 * Node interleave in one continuous trail. `details` stays `json` (not
 * jsonb) to match the existing column.
 */
export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(params: {
  action: string;
  actor: string;
  target: string;
  details?: Record<string, unknown>;
  context?: AuditContext;
}): Promise<void> {
  const { action, actor, target, details, context } = params;

  await prisma.auditLog.create({
    data: {
      action,
      actor,
      target,
      ipAddress: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
      // Laravel stored NULL rather than an empty object.
      details: details && Object.keys(details).length > 0 ? (details as object) : undefined,
    },
  });
}

/** How Laravel rendered the acting user into the `actor` column. */
export function actorLabel(user: { name: string; email: string }): string {
  return `${user.name} <${user.email}>`;
}
