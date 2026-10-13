import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import AdminAccessCodeForm from '@/components/AdminAccessCodeForm';
import { Page } from '@/lib/page-data';

/** /login/access-code — an Admin's second step, after their password. */
export default function AccessCodePage() {
  return (
    <Page<Record<string, never>>
      endpoint="/login/access-code"
      render={() => (
        <AuthBrandedLayout heading="Enter your administrator access code">
          <AdminAccessCodeForm />
        </AuthBrandedLayout>
      )}
    />
  );
}
