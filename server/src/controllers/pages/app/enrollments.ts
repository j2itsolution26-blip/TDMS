import { requireUser, authorizePage } from '@/server/auth/current-user';
import { enrollmentPolicy, studentPolicy } from '@/server/auth/policies';
import { listAllEnrollments } from '@/server/services/enrollment-service';
import { ENROLLMENT_STATUSES } from '@shared/types/domain';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * Enrollments — every student's term enrollments in one list.
 *
 * Read-only, under the same policy as each student's enrollment tab
 * (enrollmentPolicy.viewAny). Approving or dropping still happens on the
 * student's record, where the check for verified credentials lives; each row
 * links there.
 */

const STATUS_LABELS: Record<string, string> = { pending: 'Pending', enrolled: 'Enrolled', dropped: 'Dropped' };

export async function loadEnrollments({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(enrollmentPolicy.viewAny(user));

  const params = query;
  const status = (ENROLLMENT_STATUSES as readonly string[]).includes(params.status ?? '') ? params.status! : '';
  const parsed = Number(params.page ?? 1);
  const data = await listAllEnrollments({ page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1, status: status || undefined });
  const canOpenStudent = studentPolicy.view(user);

  const filters = [{ value: '', label: 'All' }, ...ENROLLMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))];

  return { canOpenStudent, data, filters, status };
}
