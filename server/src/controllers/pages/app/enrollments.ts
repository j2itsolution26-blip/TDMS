import { requireUser, authorizePage } from '@/server/auth/current-user';
import { enrollmentPolicy, studentPolicy } from '@/server/auth/policies';
import { listAllEnrollments } from '@/server/services/enrollment-service';
import { activePrograms } from '@/server/services/catalogue-service';
import { ENROLLMENT_STATUSES, ENROLLMENT_STATUS_LABELS } from '@shared/types/domain';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * Enrollments — every student's term enrollments in one list.
 *
 * Viewing follows enrollmentPolicy.viewAny. Whoever may decide enrollments
 * (enrollmentPolicy.transition) reviews, approves and rejects pending ones
 * right here; the server re-checks the permission, the status and the
 * required documents on every decision.
 */

export async function loadEnrollments({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(enrollmentPolicy.viewAny(user));

  const params = query;
  const status = (ENROLLMENT_STATUSES as readonly string[]).includes(params.status ?? '') ? params.status! : '';
  const parsed = Number(params.page ?? 1);
  // In the order they were created (DIT-1, then DHT-2), not alphabetical.
  const programs = (await activePrograms()).sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)));
  // ?program= is one of the programs by id; anything else means all programs.
  const program = programs.find((p) => p.id.toString() === params.program)?.id.toString() ?? '';
  const search = (params.search ?? '').trim().slice(0, 100);
  const data = await listAllEnrollments({
    page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
    status: status || undefined,
    programId: program ? BigInt(program) : undefined,
    search,
  });
  const canOpenStudent = studentPolicy.view(user);

  const all = Object.values(data.counts).reduce((n, c) => n + c, 0);
  const filters = [
    { value: '', label: 'All', count: all },
    ...ENROLLMENT_STATUSES.map((s) => ({ value: s, label: ENROLLMENT_STATUS_LABELS[s], count: data.counts[s] ?? 0 })),
  ];

  const programTabs = [
    { value: '', label: 'All Programs', name: 'Every program', count: Object.values(data.programCounts).reduce((n, c) => n + c, 0) },
    ...programs.map((p) => ({ value: p.id.toString(), label: p.code, name: p.name, count: data.programCounts[p.id.toString()] ?? 0 })),
  ];

  return { canOpenStudent, canDecide: enrollmentPolicy.transition(user), data, filters, status, programTabs, program, search };
}
