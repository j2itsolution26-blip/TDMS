import ApplicationsScreen from '@/components/screens/ApplicationsScreen';
import { Page } from '@/lib/page-data';
import type { loadApplications } from '@/server/controllers/pages/app/applications';

type Data = Awaited<ReturnType<typeof loadApplications>>;

/** /applications */
export default function ApplicationsPage() {
  return <Page<Data> endpoint={'/applications'} render={(d) => <ApplicationsScreen {...d} />} />;
}
