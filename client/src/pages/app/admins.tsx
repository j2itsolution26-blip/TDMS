import AdminAccountsScreen from '@/components/screens/AdminAccountsScreen';
import { Page } from '@/lib/page-data';
import type { loadAdmins } from '@/server/controllers/pages/app/admins';

type Data = Awaited<ReturnType<typeof loadAdmins>>;

/** /admins */
export default function AdminsPage() {
  return <Page<Data> endpoint={'/admins'} render={(d) => <AdminAccountsScreen {...d} />} />;
}
