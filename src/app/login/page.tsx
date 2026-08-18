import Image from "next/image";
import { requireGuest } from "./actions";
import { LoginForm } from "./LoginForm";
import "./auth.css";

export default async function LoginPage() {
  await requireGuest();

  return (
    <div className="tdms-auth">
      <div className="tdms-auth__main">
        <section
          className="tdms-auth__hero"
          style={{ ["--tdms-campus-image" as string]: "url('/images/auth/campus.jpg')" }}
        >
          <div className="hero__copy">
            <p className="hero__eyebrow">Welcome to</p>
            <h1 className="hero__title">TDMS</h1>
            <p className="hero__subtitle">(TVET DIPLOMA MANAGEMENT SYSTEM)</p>
            <div className="hero__divider" aria-hidden="true" />
            <p className="hero__description">
              A comprehensive platform for managing diploma programs, students, faculty, and
              academic processes efficiently.
            </p>

            <div className="hero__badges">
              <div className="hero__badge">
                <span className="hero__badge-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 10 12 5 2 10l10 5 10-5Z" />
                    <path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
                  </svg>
                </span>
                <span className="hero__badge-text">Empowering Skills. Building Futures.</span>
              </div>
              <div className="hero__badge">
                <span className="hero__badge-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.65 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9c.15.6.68 1.02 1.3 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
                  </svg>
                </span>
                <span className="hero__badge-text">Excellence in TVET Education and Training.</span>
              </div>
              <div className="hero__badge">
                <span className="hero__badge-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <span className="hero__badge-text">Innovate. Educate. Elevate.</span>
              </div>
            </div>
          </div>

          <div className="hero__cards">
            <div className="program-card">
              <div className="program-card__media program-card__media--hospitality">
                <Image src="/images/auth/hospitality-student.jpg" alt="Hospitality Technology student at the training bar" fill sizes="(max-width: 1024px) 50vw, 20rem" />
              </div>
              <div className="program-card__badge">
                <span className="program-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 2s1 1 1 3-1 3-1 3v11a3 3 0 0 0 3 3" />
                    <path d="M7 2v9" />
                    <path d="M11 2v9" />
                    <path d="M7 11h4" />
                    <path d="M20 21V8a5 5 0 0 0-5-5v18" />
                  </svg>
                </span>
                <p className="program-card__title">Hospitality Technology</p>
              </div>
            </div>

            <div className="program-card">
              <div className="program-card__media program-card__media--it">
                <Image src="/images/auth/it-student.jpg" alt="Information Technology student in the computer laboratory" fill sizes="(max-width: 1024px) 50vw, 20rem" />
              </div>
              <div className="program-card__badge">
                <span className="program-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="13" rx="2" />
                    <path d="M8 21h8" />
                    <path d="M12 17v4" />
                  </svg>
                </span>
                <p className="program-card__title">Information Technology</p>
              </div>
            </div>
          </div>
        </section>

        <section className="tdms-auth__panel">
          <div className="panel__card">
            <div className="panel__logo-wrap">
              <Image src="/images/auth/logo.png" alt="Asian College Diploma Program Department logo" width={325} height={285} className="panel__logo" />
            </div>

            <p className="panel__eyebrow">Welcome to</p>
            <h2 className="panel__title">TDMS</h2>
            <p className="panel__subtitle">(TVET DIPLOMA MANAGEMENT SYSTEM)</p>
            <div className="panel__divider" aria-hidden="true" />

            <p className="panel__heading">Sign in to your account</p>
            <p className="panel__subheading">Enter your credentials to continue</p>

            <LoginForm />

            <div className="panel__trust">
              <span className="panel__trust-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 12 2 2 4-4" />
                  <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
                </svg>
                Secure
              </span>
              <span className="panel__trust-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 12 2 2 4-4" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                Reliable
              </span>
              <span className="panel__trust-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20V10" />
                  <path d="M12 20V4" />
                  <path d="M20 20v-6" />
                </svg>
                Efficient
              </span>
            </div>
          </div>
        </section>
      </div>

      <footer className="tdms-auth__footer">
        <span className="tdms-auth__footer-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Asian College of Science and Technology
        </span>
        <span>&copy; {new Date().getFullYear()} Asian College. All rights reserved.</span>
        <span className="tdms-auth__footer-right">Empowering Skills. Building Futures.</span>
      </footer>
    </div>
  );
}
