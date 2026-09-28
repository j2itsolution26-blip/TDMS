import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/**
 * The TDMS enterprise palette — one design system for every signed-in screen.
 *
 * Green is the institution's identity and is reserved for what it should
 * signal: the active item, the primary action, success. Surfaces stay white
 * and neutral; the sidebar is the one large green area.
 *
 * TWO ALIASES, DELIBERATELY
 *
 * The screens ported from Laravel spell their accent as `indigo-*` and their
 * headings as `navy-900` — 74 and 73 uses across 17 files. Rather than edit
 * every unrelated screen, those names now resolve to the TDMS palette:
 *
 *   indigo-*  → the primary green scale (buttons, links, focus rings, active)
 *   navy-900  → the primary text colour
 *
 * so the whole application adopts the design system from this one file, and
 * a screen nobody touched in this change still matches the new dashboard.
 * New code should say what it means — `primary-*`, `ink`, `forest` — and the
 * aliases can be retired as screens are revisited.
 *
 * Contrast, computed (WCAG AA needs 4.5:1 for body text):
 *   primary-600 #006B4F on white ............ 6.53:1  (buttons, links)
 *   ink #102A43 on white .................... 14.64:1 (headings, body)
 *   muted #5B697C on white / surface ........ 5.59 / 5.23:1
 *   white on forest #073B2A ................. 12.59:1 (sidebar)
 *   #CFE3DA on forest (inactive nav) ........ 9.38:1
 *
 * `muted` is #5B697C, not the brief's #64748B: that one measures 4.45:1 on
 * the page background, just short of AA, and the page descriptions sit there.
 * `warning` #D97706 is 3.19:1 on white — a fill and icon colour only; warning
 * TEXT uses amber-700 (#B45309, 5.02:1).
 */

const primary = {
  DEFAULT: '#006B4F',
  50: '#EAF7F1',
  100: '#D3EEE2',
  200: '#A8DCC5',
  300: '#6FC2A0',
  400: '#2F9E74',
  500: '#087A59',
  600: '#006B4F',
  700: '#005A42',
  800: '#074B36',
  900: '#073B2A',
};

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'Inter',
          ...defaultTheme.fontFamily.sans,
        ],
      },
      colors: {
        primary,
        /** The navigation surface. */
        forest: {
          DEFAULT: '#073B2A',
          light: '#0B4A36',
          line: 'rgba(255,255,255,0.10)',
        },
        ink: '#102A43',
        muted: '#5B697C',

        // Compatibility aliases — see the note above.
        indigo: primary,
        navy: {
          DEFAULT: '#102A43',
          50: '#F5F8F7',
          100: '#E6EEEA',
          200: '#CBD5E1',
          300: '#94A3B8',
          400: '#64748B',
          500: '#334E68',
          600: '#243B53',
          700: '#1B3246',
          800: '#152C40',
          900: '#102A43',
          950: '#0B1F33',
        },

        brand: { blue: '#2563EB' },
        surface: '#F5F8F7',
        card: '#FFFFFF',
        border: '#DCE7E2',
        success: '#16803C',
        warning: '#D97706',
        danger: '#DC2626',
        info: '#2563EB',
      },
      boxShadow: {
        // Restrained: a hairline lift, not a floating card.
        card: '0 1px 2px rgba(16, 42, 67, 0.04), 0 1px 3px rgba(16, 42, 67, 0.06)',
      },
    },
  },
  plugins: [forms],
} satisfies Config;
