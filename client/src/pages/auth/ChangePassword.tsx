import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import ChangeTemporaryPasswordForm from '@/components/ChangeTemporaryPasswordForm';
import { Page } from '@/lib/page-data';

/** /change-password — replacing a Super Admin-issued temporary password. */
export default function ChangePasswordPage() {
  return (
    <Page<{ name: string; email: string }>
      endpoint="/change-password"
      render={(d) => (
        <AuthBrandedLayout heading="Set a new password to continue">
          <ChangeTemporaryPasswordForm name={d.name} email={d.email} />
        </AuthBrandedLayout>
      )}
    />
  );
}
