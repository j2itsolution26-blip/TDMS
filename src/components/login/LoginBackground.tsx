/**
 * The full-screen backdrop behind every sign-in screen.
 *
 * Left: the campus photograph under a pale sky-blue wash, so the dark hero
 * text above it always reads. Right (desktop only): a deep-blue diagonal panel
 * that the sign-in card straddles, and the script tagline. (The LEARN …
 * SUCCEED watermark lives in LoginShell's gutter, so it can never slide under
 * the card.)
 *
 * Entirely decorative, hidden from assistive technology, and never
 * interactive. Image paths go through inline styles so the CSS bundler never
 * tries to resolve a public/ file at build time.
 */

const CAMPUS_IMAGE = '/images/auth/campus.jpg';

/**
 * The photograph washed into the dark panel. The campus is used until a
 * graduation photograph is supplied: drop one in public/images/auth/ and point
 * this at it.
 */
const PANEL_IMAGE = '/images/auth/campus.jpg';

export default function LoginBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Campus, anchored to the bottom so the building shows under the hero. */}
      <div
        className="absolute inset-0 bg-cover bg-[position:22%_100%]"
        style={{ backgroundImage: `url('${CAMPUS_IMAGE}')` }}
      />
      {/* Sky wash: near-opaque where the text sits, thinning towards the bottom. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(240,246,255,0.97)_0%,rgba(236,244,255,0.93)_45%,rgba(232,241,254,0.86)_70%,rgba(226,238,253,0.80)_82%,rgba(210,228,250,0.30)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(255,255,255,0.65),transparent_60%)]" />
      <div className="absolute inset-0 bg-tvet-blue/[0.06] mix-blend-multiply" />

      {/* The deep-blue panel the card floats over. */}
      <div className="absolute inset-y-0 right-0 hidden w-[45%] [clip-path:polygon(24%_0,100%_0,100%_100%,0_100%)] lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#0D47A1_0%,#0A2A66_52%,#071D4A_100%)]" />
        <div
          className="absolute inset-0 bg-cover bg-[position:70%_30%] opacity-[0.22] mix-blend-luminosity"
          style={{ backgroundImage: `url('${PANEL_IMAGE}')` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.10)_0%,transparent_30%,transparent_70%,rgba(0,103,197,0.25)_100%)]" />
      </div>

      <p className="absolute bottom-[clamp(14px,2.2vh,28px)] right-[clamp(16px,2.4vw,40px)] hidden -rotate-[12deg] font-script text-[clamp(26px,2.3vw,36px)] leading-[0.95] text-white xl:block">
        Skills for a
        <br />
        <span className="ml-6">Better Tomorrow</span>
      </p>
    </div>
  );
}
