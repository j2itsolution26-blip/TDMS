import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';
import { fillColors, textColors, themeVariables, whiteSurface } from './theme.palette';
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

export default {
  // Anchored to this file, so the build works from any working directory.
  content: [here('./index.html'), here('./src/**/*.{ts,tsx}'), here('../shared/**/*.ts')],
  // dark: applies only to the workspace with the dark theme on (src/lib/theme.ts).
  darkMode: ['variant', '&:is(html[data-theme="dark"][data-shell="app"] *)'],
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
      /*
       * The workspace palette is CSS variables (theme.palette.ts), so the same
       * classes draw the light and the dark theme. Fills and text are separate.
       */
      colors: {
        ...fillColors,
        /** The navigation surface: the same deep emerald in both themes. */
        forest: {
          DEFAULT: '#104C3A',
          light: '#14594A',
          dark: '#0B3A2C',
          line: 'rgba(255,255,255,0.10)',
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
      },
      textColor: textColors,
      placeholderColor: textColors,
      backgroundColor: { white: whiteSurface },
      gradientColorStops: { white: whiteSurface },
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
        soft: '0 0 0 1px rgb(var(--c-tdms-hairline)), 0 1px 2px rgba(15, 42, 46, 0.04), 0 14px 36px -14px rgba(15, 42, 46, 0.14)',
        'soft-lg': '0 0 0 1px rgb(var(--c-tdms-hairline)), 0 2px 4px rgba(15, 42, 46, 0.05), 0 22px 48px -16px rgba(15, 42, 46, 0.24)',
      },
    },
  },
  plugins: [forms, themeVariables],
} satisfies Config;
