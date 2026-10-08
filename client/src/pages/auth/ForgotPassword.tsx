import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';
import { Page } from '@/lib/page-data';
import { useDocumentTitle } from '@/lib/document-title';

/** /forgot-password */
export default function ForgotPasswordPage() {
  useDocumentTitle('Forgot Password · TDMS');
  return (
    <Page<{ domain: string | null }>
      endpoint="/forgot-password"
      render={(d) => (
        <AuthBrandedLayout heading="Reset your password">
          <ForgotPasswordForm domain={d.domain} />
        </AuthBrandedLayout>
      )}
    />
  );
}
