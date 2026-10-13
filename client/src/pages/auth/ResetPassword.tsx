import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import ResetPasswordForm from '@/components/ResetPasswordForm';
import { useDocumentTitle } from '@/lib/document-title';

/** /reset-password?token=… — reached from the reset email. */
export default function ResetPasswordPage() {
  useDocumentTitle('Set your password · TDMS');
  return (
    <AuthBrandedLayout heading="Choose a new password">
      <ResetPasswordForm />
    </AuthBrandedLayout>
  );
}
