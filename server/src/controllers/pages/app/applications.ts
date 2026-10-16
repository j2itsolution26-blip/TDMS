import { requireUser, authorizePage } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { applicationCounts, listApplications } from '@/server/services/application-service';
import { activePrograms } from '@/server/services/catalogue-service';
import { listSchoolYears } from '@/server/services/teaching/school-years';
import { prisma } from '@/server/lib/prisma';
import type { PageRequest } from '@/server/controllers/pages/types';

/** /applications: the list with its filters, the counts, and what the form needs. */

const optionalId = (v?: string) => (v && /^\d+$/.test(v) ? BigInt(v) : undefined);
const isoDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

export async function loadApplications({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(applicationPolicy.viewAny(user));

  const parsed = Number(query.page ?? 1);
  const filters = {
    status: query.status ?? '',
    search: (query.search ?? '').slice(0, 100),
    program: optionalId(query.program)?.toString() ?? '',
    year: optionalId(query.year)?.toString() ?? '',
    from: isoDate(query.from),
    to: isoDate(query.to),
  };

  const [data, counts, programs, years, requirements] = await Promise.all([
    listApplications({
      page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
      status: filters.status || undefined,
      search: filters.search || undefined,
      programId: optionalId(filters.program),
      schoolYearId: optionalId(filters.year),
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    applicationCounts(),
    activePrograms(),
    listSchoolYears(),
    prisma.credentialRequirement.findMany({
      where: { isActive: true },
      orderBy: [{ isRequired: 'desc' }, { id: 'asc' }],
      select: { id: true, name: true, isRequired: true, programId: true },
    }),
  ]);

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    counts,
    filters,
    programs,
    schoolYears: years.map((y) => ({ id: y.id.toString(), label: y.label, status: y.status })),
    requirements: requirements.map((r) => ({ id: r.id.toString(), name: r.name, isRequired: r.isRequired, programId: r.programId?.toString() ?? null })),
    canCreate: applicationPolicy.create(user),
    canUpdate: applicationPolicy.update(user),
    canReview: applicationPolicy.review(user),
    canManageDocuments: applicationPolicy.manageDocuments(user),
  };
}
