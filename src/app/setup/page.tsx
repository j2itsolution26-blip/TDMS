import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import SetupForm from '@/components/setup/SetupForm';
import AlreadyInitialized from '@/components/setup/AlreadyInitialized';
import AuthError from '@/components/auth/AuthError';
import { isSystemInitialized } from '@/server/services/setup-service';
import { describeDomainPolicy } from '@/lib/institutional-email';

/**
 * /setup — first-run setup of a new installation.
 *
 * Decided on the server on every request. Hiding the page is a courtesy;
 * POST /api/setup refuses on its own once the system is initialized.
 */
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  let initialized: boolean;
  try {
    initialized = await isSystemInitialized();
  } catch (error) {
    // A database failure is not "no accounts". Say so, rather than offering
    // a setup form that cannot be completed.
    console.error('[TDMS] /setup could not reach the database. See /api/health.', error);
    return (
      <AuthBrandedLayout heading="First-run setup">
        <div className="panel__status">
          <AuthError tone="warning" title="Service temporarily unavailable">
            Please try again shortly, or contact an administrator if this persists.
          </AuthError>
        </div>
      </AuthBrandedLayout>
    );
  }

  if (initialized) {
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
        domainRestricted={policy.enabled}
        allowedDomain={policy.allowedDomain}
      />
    </AuthBrandedLayout>
  );
}

