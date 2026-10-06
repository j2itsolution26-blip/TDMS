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
        /** The signed-in workspace (shell and dashboard). */
        jakarta: ['"Plus Jakarta Sans"', '"Segoe UI"', ...defaultTheme.fontFamily.sans],
        /** The sign-in page's "Skills for a Better Tomorrow" tagline only. */
        script: ['"Great Vibes"', '"Segoe Script"', 'cursive'],
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

        /**
         * The sign-in screens (src/components/login). Blue is the enterprise
         * colour; gold belongs to the Hospitality Technology accent only.
         *   blue #0067C5 on white ............ 5.6:1
         *   navy #0F172A on white ............ 17.9:1
         *   slate #475569 on white / bg ...... 7.6 / 7.1:1
         */
        tvet: {
          blue: '#0067C5',
          'blue-hover': '#0058A8',
          'blue-active': '#004C91',
          sky: '#1A73E8',
          navy: '#0F172A',
          deep: '#0A2A66',
          deeper: '#071D4A',
          slate: '#475569',
          bg: '#F5F7FA',
          border: '#E2E8F0',
          gold: '#D4A72C',
          brown: '#5A3A12',
        },

        /**
         * The workspace palette (shell and Admin dashboard). Contrast, measured:
         *   ink   #0F2A2E on bg #F3F6F5 ....... 13.9:1
         *   muted #5C6E71 on bg / white ........ 4.9 / 5.3:1 — the brief's
         *         #6A7C7F measured 4.0:1 on the page background, short of AA
         *   text  #0E7A50 on white ............. 5.4:1 — green TEXT; the brand
         *         green #16A06A is 3.4:1, so it is a fill and icon colour only
         *   deep  #0E4D37 on mint #3DDC97 ...... 5.6:1 (the sidebar's mint button)
         */
        tdms: {
          deep: '#0E4D37',
          deeper: '#093626',
          green: '#16A06A',
          mint: '#3DDC97',
          ink: '#0F2A2E',
          muted: '#5C6E71',
          text: '#0E7A50',
          bg: '#F3F6F5',
          wash: '#E9F8F0',
          hairline: '#E8EEEB',
        },
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
        // The workspace card: a 1px hairline ring and a large diffuse shadow, no border.
        soft: '0 0 0 1px #E8EEEB, 0 1px 2px rgba(15, 42, 46, 0.04), 0 14px 36px -14px rgba(15, 42, 46, 0.14)',
        'soft-lg': '0 0 0 1px #E1E9E5, 0 2px 4px rgba(15, 42, 46, 0.05), 0 22px 48px -16px rgba(15, 42, 46, 0.24)',
      },
    },
  },
  plugins: [forms],
} satisfies Config;
