import { teachingPolicy } from '@shared/lib/policies';
import { PageShell } from '@/components/teaching/kit';
import StatusRequestsScreen from '@/components/teaching/StatusRequestsScreen';
import { Page } from '@/lib/page-data';
import type { loadStatusRequests } from '@/server/controllers/pages/app/status-requests';

type Data = Awaited<ReturnType<typeof loadStatusRequests>>;

function View({ rows, user }: Data) {
  return (
    <PageShell eyebrow="Academic Oversight" title="Student Status Requests" description="Diploma Instructors recommend status changes; nothing changes on a student record until one of you approves it.">
      <StatusRequestsScreen rows={rows} canDecide={teachingPolicy.decideStatusRequests(user)} />
    </PageShell>
  );
}

/** /status-requests */
export default function StatusRequestsPage() {
  return <Page<Data> endpoint={'/status-requests'} render={(d) => <View {...d} />} />;
}
