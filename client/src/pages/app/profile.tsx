import ProfileScreen from '@/components/screens/ProfileScreen';
import { Page } from '@/lib/page-data';
import type { loadProfile } from '@/server/controllers/pages/app/profile';

type Data = Awaited<ReturnType<typeof loadProfile>>;

/** /profile */
export default function ProfilePage() {
  return <Page<Data> endpoint={'/profile'} render={(d) => <ProfileScreen {...d} />} />;
}
