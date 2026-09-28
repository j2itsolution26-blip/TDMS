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

// --- Reading the trail (Super Admin: Audit Logs) ---------------------------

export interface AuditLogRow {
  id: string;
  action: string;
  actor: string;
  target: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const AUDIT_PAGE_SIZE = 25;

/**
 * The audit trail, newest first, optionally narrowed to one action and/or a
 * text match on the actor or target.
 *
 * Nothing secret can come out of here, because nothing secret goes in: every
 * writer of this table records that a credential was issued, used or revealed,
 * never its value.
 */
export async function listAuditLogs(options: { page?: number; action?: string | null; q?: string | null }) {
  const page = options.page && options.page > 0 ? options.page : 1;
  const q = options.q?.trim() || null;

  const where = {
    ...(options.action ? { action: options.action } : {}),
    ...(q
      ? {
          OR: [
            { actor: { contains: q, mode: 'insensitive' as const } },
            { target: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);

  return {
    rows: rows.map(
      (r): AuditLogRow => ({
        id: r.id.toString(),
        action: r.action,
        actor: r.actor,
        target: r.target,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        details: (r.details as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt.toISOString(),
      }),
    ),
    actions: actions.map((a) => a.action),
    page,
    total,
    lastPage: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}
