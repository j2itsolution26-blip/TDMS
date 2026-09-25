import { requireUser } from '@/server/auth/current-user';
import ProfileScreen from '@/components/screens/ProfileScreen';

/** Port of resources/views/profile.blade.php. */
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <ProfileScreen
      user={{
        name: user.name,
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerifiedAt !== null,
      }}
    />
  );
}
