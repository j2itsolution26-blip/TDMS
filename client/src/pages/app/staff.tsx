import StaffScreen from '@/components/screens/StaffScreen';
import { Page } from '@/lib/page-data';
import type { loadStaff } from '@/server/controllers/pages/app/staff';

type Data = Awaited<ReturnType<typeof loadStaff>>;

/** /staff */
export default function StaffPage() {
  return <Page<Data> endpoint={'/staff'} render={(d) => <StaffScreen {...d} />} />;
}
