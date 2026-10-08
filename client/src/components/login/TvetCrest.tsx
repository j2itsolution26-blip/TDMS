/**
 * The TVET crest: a mortarboard over an open book, framed by gold laurels.
 *
 * Drawn inline so it stays sharp at any size and needs no asset. Decorative —
 * the system name beside it is the accessible text.
 */

const GOLD = '#D4A72C';
const GOLD_DEEP = '#A9821C';
const NAVY = '#0F2A5C';
const BLUE = '#1E5BB8';

/** One laurel branch: leaves set along an arc, mirrored for the right side. */
function Laurel({ side }: { side: 'left' | 'right' }) {
  const leaves = Array.from({ length: 7 }, (_, i) => {
    // From the bottom of the crest up its side, 200° → 115° around the centre.
    const angle = ((200 - i * 14) * Math.PI) / 180;
    const r = 46;
    const x = 60 + r * Math.cos(angle);
    const y = 64 - r * Math.sin(angle);
    const tilt = 200 - i * 14 - 90 + 35;
    return (
      <ellipse
        key={i}
        cx={x.toFixed(2)}
        cy={y.toFixed(2)}
        rx="4.2"
        ry="9"
        transform={`rotate(${-tilt} ${x.toFixed(2)} ${y.toFixed(2)})`}
        fill={i % 2 ? GOLD : GOLD_DEEP}
      />
    );
  });
  return (
    <g transform={side === 'right' ? 'translate(120 0) scale(-1 1)' : undefined}>
      <path d="M57 108 C 30 102 14 80 16 52" fill="none" stroke={GOLD_DEEP} strokeWidth="2.2" strokeLinecap="round" />
      {leaves}
    </g>
  );
}

export default function TvetCrest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      <Laurel side="left" />
      <Laurel side="right" />

      {/* Shield */}
      <path d="M60 36 L88 44 V70 C88 88 74 100 60 106 C46 100 32 88 32 70 V44 Z" fill={NAVY} />
      {/* Open book */}
      <path d="M60 58 C52 53 44 52 38 53 V82 C45 81 53 83 60 88 Z" fill="#FFFFFF" />
      <path d="M60 58 C68 53 76 52 82 53 V82 C75 81 67 83 60 88 Z" fill="#E6EEFB" />
      <path d="M60 58 V88" stroke={BLUE} strokeWidth="1.6" />
      <path d="M43 62 C48 61.5 53 62.5 56 64 M43 68 C48 67.5 53 68.5 56 70 M43 74 C48 73.5 53 74.5 56 76" stroke={BLUE} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M77 62 C72 61.5 67 62.5 64 64 M77 68 C72 67.5 67 68.5 64 70 M77 74 C72 73.5 67 74.5 64 76" stroke={BLUE} strokeWidth="1.3" fill="none" strokeLinecap="round" />

      {/* Mortarboard */}
      <path d="M60 10 L92 22 L60 34 L28 22 Z" fill={NAVY} />
      <path d="M44 28 V36 C50 40 70 40 76 36 V28 L60 34 Z" fill={BLUE} />
      <path d="M92 22 V36" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <circle cx="92" cy="38" r="2.6" fill={GOLD} />
    </svg>
  );
}
