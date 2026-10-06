import type { ReactNode } from 'react';

/**
 * A feature or assurance with an icon.
 *
 * `hero`: icon in a white circle beside a title and one line of description —
 * the row under the program cards.
 * `panel`: a small centred icon over a short label — the assurance row at the
 * foot of the sign-in card.
 */
export default function FeatureItem({
  icon,
  title,
  description,
  variant = 'hero',
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  variant?: 'hero' | 'panel';
}) {
  if (variant === 'panel') {
    return (
      <li className="flex flex-col items-center gap-2 text-center">
        <span className="text-tvet-slate [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
        <span className="text-xs leading-snug text-tvet-slate">{title}</span>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-tvet-blue shadow-[0_6px_16px_-6px_rgba(15,23,42,0.25)] ring-1 ring-tvet-border [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[15px] font-semibold leading-tight text-tvet-navy">{title}</span>
        {description && <span className="mt-1 block text-[13px] leading-snug text-tvet-slate">{description}</span>}
      </span>
    </li>
  );
}
