import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import AuthError from '@/components/auth/AuthError';
import SetupForm from '@/components/setup/SetupForm';
import AlreadyInitialized from '@/components/setup/AlreadyInitialized';
import { Page } from '@/lib/page-data';

type SetupData =
  | { state: 'unavailable' }
  | { state: 'initialized' }
  | { state: 'open'; domainRestricted: boolean; allowedDomain: string };

/**
 * /setup — first-run setup. Which of the three screens shows is decided by
 * the server from the database, never by anything kept in the browser.
 */
export default function SetupPage() {
  return (
    <Page<SetupData>
      endpoint="/setup"
      render={(d) => (
        <AuthBrandedLayout heading="First-run setup">
          {d.state === 'unavailable' && (
            <div className="panel__status">
              <AuthError tone="warning" title="Service temporarily unavailable">
                Please try again shortly, or contact an administrator if this persists.
              </AuthError>
            </div>
          )}
          {d.state === 'initialized' && <AlreadyInitialized />}
          {d.state === 'open' && <SetupForm domainRestricted={d.domainRestricted} allowedDomain={d.allowedDomain} />}
        </AuthBrandedLayout>
      )}
    />
  );
}
