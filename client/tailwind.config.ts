import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

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

/*
 * 2026-10 refresh — the enterprise palette:
 *   primary emerald #087F5B (primary-600) on white ...... 5.0:1
 *   sidebar #104C3A · mint #E7F7EF · canvas #F4F7F5 · border #E1EAE5
 *   text #152B35 on canvas ............................... 13.6:1
 *   secondary text #5E716A on canvas / white ............. 4.8 / 5.2:1 — the
 *     brief's #647770 measures 4.4:1 on the canvas, just short of AA
 *   accents: blue #2563EB, violet #7C3AED, amber #D97706, coral #E05B67 —
 *     fills and icons; their TEXT uses the darker -700 shade (see `accent`).
 * Tailwind's `emerald-*` is aliased to the same scale, so every green in the
 * application is one green.
 */
const primary = {
  DEFAULT: '#087F5B',
  50: '#E7F7EF',
  100: '#CDEFDF',
  200: '#9EDDC2',
  300: '#62C49E',
  400: '#2BA77C',
  500: '#11916A',
  600: '#087F5B',
  700: '#076A4C',
  800: '#08563F',
  900: '#0B3D2E',
  950: '#062A1F',
};

export default {
  // Anchored to this file, so the build works from any working directory.
  content: [here('./index.html'), here('./src/**/*.{ts,tsx}'), here('../shared/**/*.ts')],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'Inter',
          ...defaultTheme.fontFamily.sans,
        ],
        /** The signed-in workspace (shell, dashboards and every module). */
        jakarta: ['Inter', '"Segoe UI Variable"', '"Segoe UI"', ...defaultTheme.fontFamily.sans],
        /** The sign-in page's "Skills for a Better Tomorrow" tagline only. */
        script: ['"Great Vibes"', '"Segoe Script"', 'cursive'],
      },
      colors: {
        primary,
        /** The navigation surface. */
        forest: {
          DEFAULT: '#104C3A',
          light: '#14594A',
          dark: '#0B3A2C',
          line: 'rgba(255,255,255,0.10)',
        },
        ink: '#152B35',
        muted: '#5E716A',

        // Compatibility aliases — see the note above.
        indigo: primary,
        emerald: primary,
        /** KPI and chart accents, by meaning (see the dashboard parts). */
        accent: {
          emerald: '#087F5B',
          blue: '#2563EB',
          'blue-700': '#1D4ED8',
          'blue-50': '#EFF4FF',
          violet: '#7C3AED',
          'violet-700': '#6D28D9',
          'violet-50': '#F4EFFE',
          amber: '#D97706',
          'amber-700': '#B45309',
          'amber-50': '#FEF6E7',
          coral: '#E05B67',
          'coral-700': '#B4323F',
          'coral-50': '#FDEFF0',
        },
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
          900: '#152B35',
          950: '#0E1F27',
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
          deep: '#104C3A',
          deeper: '#0B3A2C',
          green: '#087F5B',
          mint: '#34C38F',
          ink: '#152B35',
          muted: '#5E716A',
          text: '#087F5B',
          bg: '#F4F7F5',
          wash: '#E7F7EF',
          hairline: '#E1EAE5',
        },
        surface: '#F4F7F5',
        card: '#FFFFFF',
        border: '#E1EAE5',
        success: '#16803C',
        warning: '#D97706',
        danger: '#DC2626',
        info: '#2563EB',
      },
      keyframes: {
        'modal-in': { from: { opacity: '0', transform: 'translateY(8px) scale(0.985)' }, to: { opacity: '1', transform: 'none' } },
        'overlay-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'modal-in': 'modal-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'overlay-in': 'overlay-in 160ms ease-out',
      },
      boxShadow: {
        // Restrained: a hairline lift, not a floating card.
        card: '0 1px 2px rgba(21, 43, 53, 0.04), 0 2px 8px -2px rgba(21, 43, 53, 0.06)',
        'card-hover': '0 2px 4px rgba(21, 43, 53, 0.05), 0 12px 28px -12px rgba(21, 43, 53, 0.18)',
        // The workspace card: a 1px hairline ring and a large diffuse shadow, no border.
        soft: '0 0 0 1px #E1EAE5, 0 1px 2px rgba(15, 42, 46, 0.04), 0 14px 36px -14px rgba(15, 42, 46, 0.14)',
        'soft-lg': '0 0 0 1px #E1E9E5, 0 2px 4px rgba(15, 42, 46, 0.05), 0 22px 48px -16px rgba(15, 42, 46, 0.24)',
      },
    },
  },
  plugins: [forms],
} satisfies Config;
