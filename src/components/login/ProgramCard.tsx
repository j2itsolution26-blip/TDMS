import type { ReactNode } from 'react';

/**
 * One diploma program tile on the sign-in hero.
 *
 * Informational only — not a link and not a choice. A user's program and role
 * come from their account after sign-in, so nothing here is focusable.
 */

const ACCENTS = {
  /** Blue and navy. */
  it: {
    overlay:
      'bg-[linear-gradient(180deg,rgba(10,42,102,0.02)_0%,rgba(10,42,102,0.30)_38%,rgba(8,32,84,0.86)_72%,rgba(7,29,74,0.96)_100%)]',
    icon: 'bg-tvet-sky text-white',
  },
  /** Gold and warm brown. */
  hospitality: {
    overlay:
      'bg-[linear-gradient(180deg,rgba(90,58,18,0.02)_0%,rgba(90,58,18,0.30)_38%,rgba(70,44,12,0.86)_72%,rgba(43,27,8,0.96)_100%)]',
    icon: 'bg-tvet-gold text-[#2B1D05]',
  },
} as const;

export default function ProgramCard({
  accent,
  icon,
  name,
  description,
  image,
  imageAlt,
}: {
  accent: keyof typeof ACCENTS;
  icon: ReactNode;
  /** The part after "Diploma in". */
  name: string;
  description: string;
  image: string;
  imageAlt: string;
}) {
  const style = ACCENTS[accent];
  return (
    <article className="group relative isolate flex min-h-[240px] flex-col justify-end overflow-hidden rounded-2xl p-5 shadow-[0_22px_44px_-20px_rgba(15,23,42,0.6)] ring-1 ring-white/20 sm:p-6 lg:min-h-[340px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={imageAlt}
        className="absolute inset-0 -z-20 h-full w-full object-cover object-[50%_18%] transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
      />
      <div className={`absolute inset-0 -z-10 ${style.overlay}`} />

      <span
        className={`mb-4 grid h-14 w-14 place-items-center rounded-full shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5)] ring-4 ring-white/15 [&>svg]:h-7 [&>svg]:w-7 ${style.icon}`}
      >
        {icon}
      </span>
      <h3 className="text-[22px] font-bold leading-[1.2] text-white xl:text-[24px]">
        <span className="block">Diploma in</span>
        {name}
      </h3>
      <p className="mt-3 text-[15px] leading-[1.35] text-white/90">{description}</p>
    </article>
  );
}
