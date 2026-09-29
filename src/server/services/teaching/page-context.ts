import 'server-only';
import { notFound } from 'next/navigation';
import { AppError } from '@/lib/http';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import type { AuthUser } from '@/types/domain';
import { resolveSchoolYear } from './school-years';

/**
 * What every school-year-scoped page starts with: the signed-in user, the
 * page's policy enforced (403 otherwise), and the school year it shows —
 * the one in ?year=, else the active one.
 */
export async function yearPage(allowed: (user: AuthUser) => boolean, yearParam?: string | null) {
  const user = await requireUser();
  authorizePage(allowed(user));
  const { years, current } = await resolveSchoolYear(yearParam);
  return {
    user,
    current,
    years: years.map((y) => ({ id: y.id.toString(), label: y.label, status: y.status })),
    yearId: current?.id ?? null,
    archived: current?.status === 'ARCHIVED',
  };
}

/**
 * A service's "not found" — including "not your class", which is reported the
 * same way on purpose — as the page's 404 rather than an error screen.
 */
export async function orNotFound<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

/** A positive integer id from a query string, or null. */
export function queryId(value: string | string[] | undefined): bigint | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^\d+$/.test(v) ? BigInt(v) : null;
}
