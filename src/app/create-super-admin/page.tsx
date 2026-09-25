import { redirect } from 'next/navigation';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import CreateSuperAdminForm from '@/components/CreateSuperAdminForm';
import { isBootstrapAllowed } from '@/server/services/super-admin-service';

/**
 * Port of the create-super-admin Volt route.
 *
 * The EnsureSuperAdminNotBootstrapped middleware becomes this check: once a
 * Super Admin exists the page is simply gone, and the POST behind it
 * refuses independently, so the guard cannot be walked around by calling
 * the endpoint directly.
 */
export const dynamic = 'force-dynamic';

export default async function CreateSuperAdminPage() {
  if (!(await isBootstrapAllowed())) redirect('/login');

  return (
    <AuthBrandedLayout>
      <CreateSuperAdminForm />
    </AuthBrandedLayout>
  );
}
