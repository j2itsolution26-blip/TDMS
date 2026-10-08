import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import VerifyEmailPanel from '@/components/VerifyEmailPanel';
import { useDocumentTitle } from '@/lib/document-title';

/** /verify-email?token=… — reached from the verification email. */
export default function VerifyEmailPage() {
  useDocumentTitle('Verify your email · TDMS');
  return (
    <AuthBrandedLayout heading="Verify your email address">
      <VerifyEmailPanel />
    </AuthBrandedLayout>
  );
}
