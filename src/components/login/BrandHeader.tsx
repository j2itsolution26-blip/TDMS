import TvetCrest from './TvetCrest';

/**
 * The system's crest and name, top-left of the sign-in screens.
 *
 * The name is a paragraph, not a heading: the page's one <h1> is the sign-in
 * card's title, which is what a screen-reader user lands on.
 */
export default function BrandHeader() {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <TvetCrest className="h-16 w-16 shrink-0 sm:h-[88px] sm:w-[88px]" />
      <div className="min-w-0">
        <p className="leading-none text-tvet-navy">
          <span className="block text-[34px] font-extrabold tracking-[0.01em] sm:text-[42px] lg:text-[clamp(34px,2.75vw,42px)]">TVET</span>
          <span className="mt-1 block whitespace-nowrap text-[15px] font-bold uppercase tracking-[0.02em] sm:text-[21px] lg:text-[clamp(15px,1.37vw,21px)]">
            Diploma Management System
          </span>
        </p>
        <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-tvet-slate sm:text-xs sm:tracking-[0.22em] lg:text-[clamp(10px,0.78vw,12px)] lg:tracking-[0.2em]">
          Skills <span aria-hidden="true">•</span> Opportunities <span aria-hidden="true">•</span> Brighter Futures
        </p>
      </div>
    </div>
  );
}
