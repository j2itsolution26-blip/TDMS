import { redirect } from 'next/navigation';

/**
 * Retired. The first Super Admin is created through first-run setup at
 * /setup; this address survives only so old links and bookmarks land there.
 */
export default function CreateSuperAdminPage() {
  redirect('/setup');
}
