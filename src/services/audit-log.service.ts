import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

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

const SENSITIVE_KEY_PATTERN = /password|hash|token|secret|credential|api[_-]?key/i;

/**
 * Recursively strips any key that looks credential-shaped from a details
 * payload before it's ever sent to the client, in case one was ever
 * accidentally logged. Defense in depth: recordAudit() callers shouldn't
 * be passing secrets in the first place, but this is the last line.
 */
export function redactSensitiveDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveDetails);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactSensitiveDetails(val);
    }
    return result;
  }
  return value;
}

/** Splits the "Name <email>" convention formatActor() writes, for display. */
export function splitActorLabel(value: string): { name: string; email: string | null } {
  const match = value.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { name: value, email: null };
  return { name: match[1], email: match[2] };
}
