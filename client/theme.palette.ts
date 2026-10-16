import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

/**
 * The workspace palette as CSS variables, so one set of classes draws both themes.
 *
 * Every colour class (bg-white, text-slate-600, bg-amber-50, border-tdms-hairline…)
 * resolves to a variable. :root holds today's light values unchanged; the dark
 * theme (html[data-theme=dark][data-shell=app], set by src/lib/theme.ts) redefines
 * them. Nothing in the 160-odd screens had to change to be themed.
 *
 * Fills and text are separate variables, because dark needs them to move apart:
 *   fill  bg-amber-50 (a pale tint) becomes a deep amber-tinted surface, while
 *         solid fills (bg-primary-600 buttons, status dots, bars) stay as they are,
 *         so text-white on them keeps its contrast;
 *   text  text-amber-800 (dark text for a light page) becomes a light amber, so
 *         a status pill reads light-on-dark with the same meaning.
 * The scrims (bg-navy-900/60, bg-ink/40) are fills and stay dark.
 *
 * Dark neutrals, measured on the card surface #151E1B:
 *   ink   #E6EEEA 14.6:1 · body #C9D6D0 11.0:1 · muted #9AACA5 6.9:1 · faint #6F837C 3.8:1
 */

type Hex = string;
type Scale = Record<string, Hex>;

const CANVAS = '#0E1513';
const CARD = '#151E1B';
const RAISED = '#1C2724';
const LINE = '#2A3833';
const LINE2 = '#3A4A44';
const INK = '#E6EEEA';
const BODY = '#C9D6D0';
const MUTED = '#9AACA5';
const FAINT = '#6F837C';

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

function triplet(hex: Hex): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** `a` over `b`, weight `t` of a. */
function mix(a: Hex, b: Hex, t: number): Hex {
  const [ar, ag, ab] = triplet(a).split(' ').map(Number) as [number, number, number];
  const [br, bg, bb] = triplet(b).split(' ').map(Number) as [number, number, number];
  const c = (x: number, y: number) => Math.round(x * t + y * (1 - t)).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

interface Token {
  light: Hex;
  /** Fill in dark; defaults to light. */
  fill?: Hex;
  /** Text in dark; defaults to the dark fill. */
  text?: Hex;
}

const tokens = new Map<string, Token>();
const add = (name: string, t: Token) => tokens.set(name, t);

/** A hue: pale tints go deep, solids stay, text goes light. */
function chromatic(name: string, p: Scale) {
  const darkFill: Record<string, Hex> = {
    50: mix(p[500]!, CARD, 0.12),
    100: mix(p[500]!, CARD, 0.18),
    200: mix(p[500]!, CARD, 0.3),
    300: mix(p[400]!, CARD, 0.55),
  };
  const darkText: Record<string, Hex> = {
    300: p[300]!, 400: p[300]!, 500: p[300]!, 600: p[300]!, 700: p[200]!, 800: p[200]!, 900: p[100]!, 950: p[50]!,
  };
  for (const s of SHADES) add(`${name}-${s}`, { light: p[s]!, fill: darkFill[s], text: darkText[s] ?? p[s] });
  if (p.DEFAULT) add(name, { light: p.DEFAULT, text: p[300] });
}

/** A neutral: the scale turns over, light surfaces become dark ones. */
function neutral(name: string, p: Scale, fill: Record<string, Hex>, text: Record<string, Hex>) {
  for (const s of SHADES) add(`${name}-${s}`, { light: p[s]!, fill: fill[s], text: text[s] ?? p[s] });
}

const primary: Scale = {
  DEFAULT: '#087F5B', 50: '#E7F7EF', 100: '#CDEFDF', 200: '#9EDDC2', 300: '#62C49E', 400: '#2BA77C',
  500: '#11916A', 600: '#087F5B', 700: '#076A4C', 800: '#08563F', 900: '#0B3D2E', 950: '#062A1F',
};
const navy: Scale = {
  DEFAULT: '#102A43', 50: '#F5F8F7', 100: '#E6EEEA', 200: '#CBD5E1', 300: '#94A3B8', 400: '#64748B',
  500: '#334E68', 600: '#243B53', 700: '#1B3246', 800: '#152C40', 900: '#152B35', 950: '#0E1F27',
};

chromatic('primary', primary);
for (const hue of ['red', 'amber', 'blue', 'sky', 'violet', 'teal', 'green', 'rose', 'orange'] as const) chromatic(hue, colors[hue] as Scale);

neutral('slate', colors.slate as Scale,
  { 50: '#18221F', 100: RAISED, 200: LINE, 300: LINE2, 400: '#55675F', 500: FAINT, 600: '#8FA29A', 700: '#B4C3BD', 800: '#D2DDD8', 900: INK, 950: '#F2F7F5' },
  { 300: '#55675F', 400: '#7E918A', 500: MUTED, 600: '#B4C3BD', 700: BODY, 800: '#DDE6E2', 900: INK, 950: '#F2F7F5' });
neutral('navy', navy,
  { 50: '#18221F', 100: RAISED, 200: LINE, 300: LINE2, 400: '#55675F' },
  { 300: FAINT, 400: MUTED, 500: BODY, 600: BODY, 700: INK, 800: INK, 900: INK, 950: INK });
add('navy', { light: navy.DEFAULT!, text: INK });

add('ink', { light: '#152B35', text: INK });
add('muted', { light: '#5E716A', text: MUTED });
add('surface', { light: '#F4F7F5', fill: CANVAS, text: INK });
add('card', { light: '#FFFFFF', fill: CARD, text: INK });
add('border', { light: '#E1EAE5', fill: LINE });
add('white-surface', { light: '#FFFFFF', fill: CARD });
add('success', { light: '#16803C', text: '#86EFAC' });
add('warning', { light: '#D97706', text: '#FCD34D' });
add('danger', { light: '#DC2626', text: '#FCA5A5' });
add('info', { light: '#2563EB', text: '#93C5FD' });

const tdms: Record<string, Token> = {
  deep: { light: '#104C3A' },
  deeper: { light: '#0B3A2C' },
  green: { light: '#087F5B', text: '#5FD3A4' },
  mint: { light: '#34C38F' },
  ink: { light: '#152B35', text: INK },
  muted: { light: '#5E716A', text: MUTED },
  text: { light: '#087F5B', text: '#5FD3A4' },
  bg: { light: '#F4F7F5', fill: CANVAS },
  wash: { light: '#E7F7EF', fill: '#12261E', text: '#A7E3C6' },
  hairline: { light: '#E1EAE5', fill: LINE },
};
for (const [k, t] of Object.entries(tdms)) add(`tdms-${k}`, t);

const accent: Record<string, Token> = {
  emerald: { light: '#087F5B', text: '#5FD3A4' },
  blue: { light: '#2563EB', text: '#60A5FA' },
  'blue-700': { light: '#1D4ED8', text: '#93C5FD' },
  'blue-50': { light: '#EFF4FF', fill: mix('#2563EB', CARD, 0.14) },
  violet: { light: '#7C3AED', text: '#A78BFA' },
  'violet-700': { light: '#6D28D9', text: '#C4B5FD' },
  'violet-50': { light: '#F4EFFE', fill: mix('#7C3AED', CARD, 0.14) },
  amber: { light: '#D97706', text: '#FBBF24' },
  'amber-700': { light: '#B45309', text: '#FCD34D' },
  'amber-50': { light: '#FEF6E7', fill: mix('#D97706', CARD, 0.14) },
  coral: { light: '#E05B67', text: '#F59AA2' },
  'coral-700': { light: '#B4323F', text: '#F8B4BA' },
  'coral-50': { light: '#FDEFF0', fill: mix('#E05B67', CARD, 0.14) },
};
for (const [k, t] of Object.entries(accent)) add(`accent-${k}`, t);

// --- Tailwind theme values ----------------------------------------------------------------

const fillVar = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const textVar = (name: string) => `rgb(var(--t-${name}) / <alpha-value>)`;

function scale(name: string, v: (n: string) => string, withDefault = false) {
  const out: Record<string, string> = Object.fromEntries(SHADES.map((s) => [s, v(`${name}-${s}`)]));
  if (withDefault) out.DEFAULT = v(name);
  return out;
}

function group(prefix: string, keys: string[], v: (n: string) => string) {
  return Object.fromEntries(keys.map((k) => [k, v(`${prefix}-${k}`)]));
}

function palette(v: (n: string) => string) {
  const primaryScale = scale('primary', v, true);
  return {
    primary: primaryScale,
    // The screens ported from Laravel say indigo-*/emerald-* for the primary green.
    indigo: primaryScale,
    emerald: primaryScale,
    slate: scale('slate', v),
    navy: scale('navy', v, true),
    red: scale('red', v),
    amber: scale('amber', v),
    blue: scale('blue', v),
    sky: scale('sky', v),
    violet: scale('violet', v),
    teal: scale('teal', v),
    green: scale('green', v),
    rose: scale('rose', v),
    orange: scale('orange', v),
    ink: v('ink'),
    muted: v('muted'),
    surface: v('surface'),
    card: v('card'),
    border: v('border'),
    success: v('success'),
    warning: v('warning'),
    danger: v('danger'),
    info: v('info'),
    tdms: group('tdms', Object.keys(tdms), v),
    accent: group('accent', Object.keys(accent), v),
  };
}

/** For theme.extend.colors: fills (backgrounds, borders, rings, gradients, SVG). */
export const fillColors = palette(fillVar);
/** For theme.extend.textColor and placeholderColor. */
export const textColors = palette(textVar);
/** bg-white and from/via/to-white are surfaces: the card colour in dark. text-white stays white. */
export const whiteSurface = fillVar('white-surface');

/** The variables: light on :root, dark for the workspace when the dark theme is on. */
export const themeVariables = plugin(({ addBase }) => {
  const light: Record<string, string> = { 'color-scheme': 'light' };
  const dark: Record<string, string> = { 'color-scheme': 'dark' };
  for (const [name, t] of tokens) {
    const fill = t.fill ?? t.light;
    const text = t.text ?? fill;
    light[`--c-${name}`] = triplet(t.light);
    light[`--t-${name}`] = triplet(t.light);
    if (fill !== t.light) dark[`--c-${name}`] = triplet(fill);
    if (text !== t.light) dark[`--t-${name}`] = triplet(text);
  }
  // Screens only: a printed page is always the light one.
  addBase({ ':root': light, '@media screen': { 'html[data-theme="dark"][data-shell="app"]': dark } });
});
