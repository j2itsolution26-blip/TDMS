import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import LoginForm from '@/components/login/LoginForm';
import type { ProviderAvailability } from '@/components/login/SocialProviders';
import { Page } from '@/lib/page-data';

interface LoginData {
  uninitialized: boolean;
  systemUnavailable: boolean;
  providers: ProviderAvailability;
  domainNotice: string | null;
  allowedDomain: string | null;
}

/** /login — the branded sign-in screen. */
export default function LoginPage() {
  return (
    <Page<LoginData>
      endpoint="/login"
      render={(d) => (
        <AuthBrandedLayout>
          <LoginForm
            uninitialized={d.uninitialized}
            systemUnavailable={d.systemUnavailable}
            providers={d.providers}
            domainNotice={d.domainNotice}
            allowedDomain={d.allowedDomain}
          />
        </AuthBrandedLayout>
      )}
    />
  );
}
