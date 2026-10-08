import AdminAccessCodesScreen from '@/components/screens/AdminAccessCodesScreen';
import { Page } from '@/lib/page-data';
import type { loadAdminAccessCodes } from '@/server/controllers/pages/app/admin-access-codes';

type Data = Awaited<ReturnType<typeof loadAdminAccessCodes>>;

/** /admin-access-codes */
export default function AdminAccessCodesPage() {
  return <Page<Data> endpoint={'/admin-access-codes'} render={(d) => <AdminAccessCodesScreen {...d} />} />;
}
