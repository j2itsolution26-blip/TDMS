import { redirect } from 'next/navigation';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import CreateSuperAdminForm from '@/components/CreateSuperAdminForm';
import { isBootstrapAllowed } from '@/server/services/super-admin-service';
import { describeDomainPolicy } from '@/lib/institutional-email';
import { mailConfigurationProblem } from '@/server/mail/mailer';

/**
 * The one-time setup screen.
 *
 * Once a Super Admin exists the page is simply gone, and every endpoint
 * behind it refuses independently, so the guard cannot be walked around by
 * calling the API directly.
 *
 * The mail configuration is checked here as well as on the server side of
 * each request, so an operator whose environment is incomplete is told before
 * they type a password rather than after. The message names environment
 * variables; it never contains their values.
 *
 * The domain policy is read here and passed down, rather than the form
 * assuming the institutional domain. The form used to hard-code it, so with
 * the restriction switched off for development the server would accept a
 * personal address while the browser still refused to submit one — the
 * validation has to come from one place to behave as one rule.
 */
export const dynamic = 'force-dynamic';

export default async function CreateSuperAdminPage() {
  if (!(await isBootstrapAllowed())) redirect('/login');

  const policy = describeDomainPolicy();

  return (
    <AuthBrandedLayout heading="Set up the first administrator account">
      <CreateSuperAdminForm
        domainRestricted={policy.enabled}
        allowedDomain={policy.allowedDomain}
        mailProblem={mailConfigurationProblem()}
      />
    </AuthBrandedLayout>
  );
}
