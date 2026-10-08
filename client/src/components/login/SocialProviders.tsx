import type { ReactNode } from 'react';
import { GoogleMark, MicrosoftMark } from '@/components/auth/icons';

/**
 * "or continue with" — the external identity providers.
 *
 * A provider is a link only when its OAuth route is actually configured for
 * this environment. Otherwise its button is drawn but disabled and says why,
 * so the layout is ready for it without pretending it works. Connecting one
 * later means passing its start URL as `href`; nothing here changes.
 */
export type ProviderAvailability = {
  /** The route that starts the OAuth flow, or null when not configured. */
  microsoft: string | null;
  google: string | null;
};

const NOTE_ID = 'providers-unavailable';

function ProviderButton({ href, mark, label }: { href: string | null; mark: ReactNode; label: string }) {
  const base =
    'flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[#D5DCE6] bg-white px-3 text-[15px] lg:gap-2 lg:text-[14px] xl:gap-3 xl:text-[15px] font-medium text-tvet-navy shadow-[0_1px_2px_rgba(15,23,42,0.05)] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0';

  if (href) {
    return (
      <a
        href={href}
        className={`${base} transition-colors hover:border-[#94A3B8] hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tvet-blue`}
      >
        {mark}
        <span className="truncate">{label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled
      title={`${label} sign-in is not available yet`}
      aria-describedby={NOTE_ID}
      className={`${base} cursor-not-allowed opacity-60`}
    >
      {mark}
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function SocialProviders({
  providers,
  allowedDomain = null,
}: {
  providers: ProviderAvailability;
  /** Shown under the buttons when the email-domain restriction is on. */
  allowedDomain?: string | null;
}) {
  const unavailable = [
    !providers.microsoft && 'Microsoft',
    !providers.google && 'Google',
  ].filter(Boolean);

  return (
    <div className="mt-7">
      <div className="tdms-or-divider">
        <span>or continue with</span>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:gap-5">
        <ProviderButton href={providers.microsoft} mark={<MicrosoftMark />} label="Microsoft Account" />
        <ProviderButton href={providers.google} mark={<GoogleMark />} label="Google Account" />
      </div>
      {unavailable.length > 0 && (
        <p id={NOTE_ID} className="sr-only">
          {unavailable.join(' and ')} sign-in {unavailable.length > 1 ? 'are' : 'is'} not available yet.
        </p>
      )}
      {allowedDomain && providers.google && (
        <p className="tdms-google-hint">Use your @{allowedDomain} account</p>
      )}
    </div>
  );
}
