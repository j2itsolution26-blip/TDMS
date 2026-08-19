import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from "@/lib/audit-log-presentation";

export { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, splitActorLabel, redactSensitiveDetails } from "@/lib/audit-log-presentation";

export const auditLogFiltersSchema = z.object({
  search: z.string().trim().max(255).optional(),
  action: z.string().trim().max(255).optional(),
  actor: z.string().trim().max(255).optional(),
  target: z.string().trim().max(255).optional(),
  dateFrom: z.string().trim().max(32).optional(),
  dateTo: z.string().trim().max(32).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZE_OPTIONS as readonly number[]).includes(n), "Invalid page size")
    .default(DEFAULT_PAGE_SIZE),
});

export type AuditLogFilters = z.infer<typeof auditLogFiltersSchema>;

/**
 * Validates raw searchParams into safe, typed filter values. Every value
 * that reaches Prisma below goes through this first — nothing from the
 * URL is ever interpolated into a query unchecked.
 */
export function parseAuditLogFilters(raw: Record<string, string | undefined>): AuditLogFilters {
  const parsed = auditLogFiltersSchema.safeParse(raw);
  if (!parsed.success) {
    return auditLogFiltersSchema.parse({});
  }
  return parsed.data;
}

function buildWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  const and: Prisma.AuditLogWhereInput[] = [];

  if (filters.search) {
    and.push({
      OR: [
        { action: { contains: filters.search, mode: "insensitive" } },
        { actor: { contains: filters.search, mode: "insensitive" } },
        { target: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }

  if (filters.action) and.push({ action: filters.action });
  if (filters.actor) and.push({ actor: filters.actor });
  if (filters.target) and.push({ target: filters.target });

  if (filters.dateFrom || filters.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (!Number.isNaN(from.getTime())) range.gte = from;
    }
    if (filters.dateTo) {
      // Inclusive of the whole "to" day.
      const to = new Date(filters.dateTo);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        range.lte = to;
      }
    }
    if (range.gte || range.lte) and.push({ createdAt: range });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

export async function listAuditLogs(filters: AuditLogFilters) {
  const where = buildWhere(filters);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.perPage,
      take: filters.perPage,
      // Only the columns the table/modal actually render — no
      // over-fetching on a table that may grow into the millions.
      select: {
        id: true,
        action: true,
        actor: true,
        target: true,
        ipAddress: true,
        userAgent: true,
        details: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Distinct filter dropdown options, sourced from the audit_logs table
 * itself rather than hard-coded — an action/actor/target that has never
 * occurred never shows up as a choice, and a new action type appears
 * automatically the first time it's recorded.
 */
export async function getAuditLogFilterOptions() {
  const [actions, actors, targets] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["actor"], select: { actor: true }, orderBy: { actor: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["target"], select: { target: true }, orderBy: { target: "asc" } }),
  ]);

  return {
    actions: actions.map((a) => a.action),
    actors: actors.map((a) => a.actor),
    targets: targets.map((t) => t.target),
  };
}
