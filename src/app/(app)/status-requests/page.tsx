import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { listStatusRequests } from '@/server/services/teaching/student-support';
import { PageShell } from '@/components/teaching/kit';
import StatusRequestsScreen from '@/components/teaching/StatusRequestsScreen';

export const dynamic = 'force-dynamic';

/** Status Requests — the Director, Coordinator and Secretary confirm or reject Instructor recommendations. */
export default async function StatusRequestsPage() {
  const user = await requireUser();
  authorizePage(teachingPolicy.viewStatusRequests(user));
  const rows = await listStatusRequests(user, {});
  return (
    <PageShell eyebrow="Academic Oversight" title="Student Status Requests" description="Diploma Instructors recommend status changes; nothing changes on a student record until one of you approves it.">
      <StatusRequestsScreen rows={rows} canDecide={teachingPolicy.decideStatusRequests(user)} />
    </PageShell>
  );
}
