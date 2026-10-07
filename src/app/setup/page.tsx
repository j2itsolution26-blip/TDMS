import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import SetupForm from '@/components/setup/SetupForm';
import AlreadyInitialized from '@/components/setup/AlreadyInitialized';
import { isSystemInitialized } from '@/server/services/setup-service';
import { setupKeyProblem } from '@/server/auth/setup-key';
import { describeDomainPolicy } from '@/lib/institutional-email';

/**
 * /setup — first-run setup of a new installation.
 *
 * Decided on the server on every request. Hiding the page is a courtesy;
 * POST /api/setup refuses on its own once the system is initialized.
 */
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await isSystemInitialized()) {
    return (
      <AuthBrandedLayout heading="First-run setup">
        <AlreadyInitialized />
      </AuthBrandedLayout>
    );
  }

  const policy = describeDomainPolicy();

  return (
    <AuthBrandedLayout heading="First-run setup">
      <SetupForm
        keyProblem={setupKeyProblem()}
        domainRestricted={policy.enabled}
        allowedDomain={policy.allowedDomain}
      />
    </AuthBrandedLayout>
  );
}
