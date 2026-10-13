import type { ReactNode } from 'react';
import BrandHeader from './BrandHeader';
import FeatureItem from './FeatureItem';
import LoginBackground from './LoginBackground';
import ProgramCard from './ProgramCard';
import {
  ChartIcon,
  CloudIcon,
  CodeIcon,
  DocumentIcon,
  MonitorIcon,
  ServiceBellIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/auth/icons';

/**
 * The shell shared by every sign-in screen: /login, /login/access-code,
 * /forgot-password, /reset-password, /verify-email, /change-password and
 * /setup.
 *
 * Desktop: the hero on the left; the white card on the right, straddling the
 * deep-blue panel; a gutter beyond it for the watermark. Below lg everything
 * stacks — branding, hero, program cards, then the card.
 *
 * Purely presentational: each page supplies its own form as `children`.
 * `.tdms-auth` scopes the shared form-control styles in globals.css.
 */

/**
 * The two programs shown on the hero. Marketing copy and photographs, so it
 * lives with the page rather than in the Program table — and the sign-in page
 * must render even when the database cannot be reached.
 */
const WATERMARK = ['Learn', 'Practice', 'Excel', 'Graduate', 'Succeed'];

const PROGRAMS = [
  {
    accent: 'it',
    icon: <CodeIcon />,
    name: 'Information Technology',
    description: 'Developing future-ready IT professionals with real-world skills and innovation.',
    image: '/images/auth/it-student.jpg',
    imageAlt: 'Information Technology student in the computer laboratory',
  },
  {
    accent: 'hospitality',
    icon: <ServiceBellIcon />,
    name: 'Hospitality Technology',
    description: 'Building globally competitive professionals in hospitality and tourism.',
    image: '/images/auth/hospitality-student.jpg',
    imageAlt: 'Hospitality Technology student at the training bar',
  },
] as const;

export default function LoginShell({
  children,
  heading = 'Sign in to access your account',
}: {
  children: ReactNode;
  /** The line under the card title. */
  heading?: string;
}) {
  return (
    <div className="tdms-auth relative isolate min-h-screen overflow-x-hidden bg-tvet-bg font-sans text-tvet-navy antialiased">
      <LoginBackground />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col lg:flex-row lg:items-center">
        <section
          aria-label="About the TVET Diploma Management System"
          className="px-4 pb-8 pt-8 sm:px-8 sm:pt-10 lg:flex-1 lg:self-stretch lg:pb-10 lg:pl-[5.6%] lg:pr-8 lg:pt-[clamp(28px,4vh,48px)] xl:pr-10"
        >
          <BrandHeader />

          <div className="mt-7 lg:mt-8">
            <h2 className="text-[clamp(32px,8.6vw,48px)] font-extrabold leading-[1.02] tracking-[-0.02em] text-tvet-navy lg:text-[clamp(40px,3.6vw,56px)]">
              Empowering
              <span className="block text-tvet-blue">Skilled Professionals</span>
            </h2>
            <p className="mt-4 max-w-[34rem] text-[17px] leading-[1.4] text-[#1E293B] sm:text-[19px]">
              Manage, monitor, and achieve excellence in diploma programs through a modern and integrated TVET
              management system.
            </p>
          </div>

          <div className="mt-7 grid max-w-[760px] gap-4 sm:grid-cols-2 sm:gap-[18px]">
            <h2 className="sr-only">Diploma programs</h2>
            {PROGRAMS.map((p) => (
              <ProgramCard key={p.accent} {...p} />
            ))}
          </div>

          <ul
            aria-label="System features"
            className="mt-8 hidden max-w-[760px] grid-cols-3 gap-6 sm:grid lg:hidden xl:grid"
          >
            <FeatureItem icon={<ChartIcon />} title="Academic Management" description="Streamlined and efficient processes" />
            <FeatureItem icon={<UsersIcon />} title="Student Management" description="From enrollment to graduation" />
            <FeatureItem icon={<DocumentIcon />} title="Diploma Records" description="Secure and organized digital records" />
          </ul>
        </section>

        <div className="relative isolate px-4 pb-12 pt-10 sm:px-8 lg:w-[min(524px,44vw)] lg:shrink-0 lg:px-0 lg:py-10 lg:mr-8 xl:mr-0">
          {/* Below lg the deep-blue panel becomes a band behind the card. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(160deg,#0D47A1_0%,#0A2A66_55%,#071D4A_100%)] lg:hidden"
          />

          <main className="mx-auto w-full max-w-[524px] rounded-[20px] border border-white/70 bg-white px-6 py-9 shadow-[0_30px_70px_-24px_rgba(7,29,74,0.55),0_2px_8px_rgba(15,23,42,0.06)] animate-[auth-fade-up_0.5s_cubic-bezier(0.2,0,0,1)_both] sm:px-12 sm:py-12 lg:px-10 xl:px-12 motion-reduce:animate-none">
            <header className="mb-9 text-center">
              <p className="text-[17px] text-tvet-slate">Welcome to</p>
              <h1 className="mt-2 text-[28px] font-bold leading-[1.18] tracking-[-0.015em] text-tvet-navy sm:text-[34px]">
                <span className="block">TVET Diploma</span>
                <span className="block">Management System</span>
              </h1>
              <p className="mt-3 text-base text-tvet-slate">{heading}</p>
            </header>

            {children}

            <ul aria-label="Platform assurances" className="mt-9 grid grid-cols-4 gap-2">
              <FeatureItem variant="panel" icon={<ShieldIcon />} title="Secure Access" />
              <FeatureItem variant="panel" icon={<UsersIcon />} title="Role-based Permissions" />
              <FeatureItem variant="panel" icon={<CloudIcon />} title="Anywhere Access" />
              <FeatureItem variant="panel" icon={<MonitorIcon />} title="Modern & Reliable" />
            </ul>
          </main>
        </div>

        {/* The gutter beyond the card, holding the LEARN … SUCCEED watermark. */}
        <div aria-hidden="true" className="hidden shrink-0 self-stretch xl:flex xl:w-[clamp(120px,11.5vw,190px)] xl:items-center xl:pl-[clamp(12px,1.4vw,22px)]">
          <ul className="space-y-[10px] pt-[6vh]">
            {WATERMARK.map((word) => (
              <li
                key={word}
                className="text-[clamp(16px,1.43vw,22px)] font-bold uppercase leading-none tracking-[0.04em] text-[#6E9BE0]/70"
              >
                {word}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
