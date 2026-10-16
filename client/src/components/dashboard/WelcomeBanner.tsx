import { useEffect, useState, type ReactNode } from 'react';
import { formatLongDate } from '@shared/lib/greeting';
import GreetingHeading from './GreetingHeading';

/**
 * Every dashboard's welcome banner — one design for all roles.
 *
 *   [role badge]  Friday, October 16, 2026
 *   Good morning, Issay 👋                                 ░░ campus ░░
 *   What this role's dashboard is for.                    ░░░ photo ░░░
 *   [primary action] [secondary]   [term · school year chips]
 *
 * The campus photo (an approved project asset) blends in from the right on a
 * white surface with a faint emerald wash; text stays on white, clear of it.
 * There is deliberately nothing floating over the photo. Below md the photo is
 * left out so the text keeps the full width.
 *
 * The greeting and date arrive in the institution's timezone and switch to the
 * viewer's own after the first render (GreetingHeading, and the effect below).
 * Colours are palette classes, so the banner follows the light/dark theme.
 */
export default function WelcomeBanner({
  firstName,
  greeting,
  date,
  roleLabel,
  description,
  actions,
  meta,
}: {
  firstName: string;
  greeting: string;
  date: string;
  roleLabel: string;
  description: string;
  /** The role's own buttons, only those its permissions allow. */
  actions?: ReactNode;
  /** Small facts beside the actions (the term, the school year). */
  meta?: ReactNode;
}) {
  const [today, setToday] = useState(date);
  useEffect(() => setToday(formatLongDate(new Date())), []);

  return (
    <header className="relative isolate overflow-hidden rounded-2xl border border-tdms-hairline bg-gradient-to-r from-white via-white to-primary-50 shadow-card">
      <img
        src="/images/dashboard-campus.jpg"
        alt=""
        aria-hidden="true"
        width={960}
        height={441}
        decoding="async"
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden h-full w-[46%] object-cover md:block dark:brightness-[0.72] dark:saturate-[0.85]"
        style={{ maskImage: 'linear-gradient(to right, transparent, #000 45%)', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 45%)' }}
      />
      <div className="px-5 py-6 sm:px-7 sm:py-8 md:max-w-[56%]">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-tdms-muted">
          <span className="rounded-full bg-tdms-wash px-2.5 py-0.5 font-semibold text-primary-800">{roleLabel}</span>
          <span>{today}</span>
        </p>
        <div className="mt-2">
          <GreetingHeading firstName={firstName} initialGreeting={greeting} />
        </div>
        <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-tdms-muted">{description}</p>
        {(actions || meta) && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {actions}
            {meta}
          </div>
        )}
      </div>
    </header>
  );
}

/** Banner buttons: primary (filled) and secondary (outlined), in the TDMS green. */
export const BANNER_PRIMARY =
  'inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-tdms-text focus-visible:ring-offset-2';
export const BANNER_SECONDARY =
  'inline-flex items-center gap-2 rounded-lg border border-tdms-hairline bg-white px-4 py-2.5 text-sm font-semibold text-tdms-ink transition-colors hover:bg-tdms-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-tdms-text focus-visible:ring-offset-2';

/** A small fact chip: "School year 2026–2027". */
export function BannerFact({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-tdms-hairline bg-white px-3 py-1 text-[13px]">
      <span className="text-tdms-muted">{label}</span>
      <span className="font-semibold text-tdms-ink">{value}</span>
    </span>
  );
}
