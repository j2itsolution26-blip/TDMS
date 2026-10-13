import { useMemo, useState } from 'react';
import { useRouter } from '@/lib/navigation';
import AuthError from '@/components/auth/AuthError';
import PasswordInput from '@/components/auth/PasswordInput';
import { FieldError } from '@/components/ui';
import { MailIcon, ArrowRightIcon } from '@/components/auth/icons';
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS, evaluatePassword } from '@shared/lib/password-policy';

/**
 * First-run setup: a welcome step, then the first Super Admin's details.
 *
 * The browser decides nothing here. Whether setup is still open and whether
 * this request won are both answered by POST /api/setup; the checklist and the disabled button only save a round
 * trip for mistakes that can be seen while typing.
 */

type Errors = Partial<Record<'name' | 'email' | 'password' | 'passwordConfirmation', string[]>>;

const CONNECTION_ERROR = "We couldn't connect to the server. Please try again.";

export default function SetupForm({
  domainRestricted,
  allowedDomain,
}: {
  domainRestricted: boolean;
  allowedDomain: string;
}) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requirements = useMemo(() => evaluatePassword(form.password), [form.password]);
  const passwordComplete = PASSWORD_REQUIREMENTS.every((r) => requirements[r.id]);
  const passwordsMatch = form.password.length > 0 && form.password === form.passwordConfirmation;
  const complete =
    form.name.trim() !== '' &&
    form.email.trim() !== '' &&
    passwordComplete &&
    passwordsMatch;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !complete) return;
    setBusy(true);
    setErrors({});
    setMessage(null);

    try {
      const response = await fetch('/api/v1/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);

      if (!payload) {
        setMessage(CONNECTION_ERROR);
        return;
      }

      if (!response.ok || !payload.success) {
        // Initialized meanwhile (another tab, another person): the page's
        // own server check now shows the "already initialized" screen.
        if (response.status === 409) {
          router.refresh();
          return;
        }
        setErrors(payload.errors ?? {});
        setMessage(payload.errors ? null : (payload.message ?? CONNECTION_ERROR));
        return;
      }

      setForm({ name: '', email: '', password: '', passwordConfirmation: '' });
      router.replace(payload.data?.redirectTo ?? '/login?setup=complete');
      router.refresh();
    } catch {
      setMessage(CONNECTION_ERROR);
    } finally {
      setBusy(false);
    }
  }

  if (!started) {
    return (
      <div>
        <div className="panel__status">
          <AuthError tone="info" title="Welcome to your new TDMS installation.">
            No accounts have been created yet. Let&apos;s create the first System Administrator.
          </AuthError>
        </div>

        <button type="button" className="tdms-submit" onClick={() => setStarted(true)}>
          <span>Start System Setup</span>
          <ArrowRightIcon />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <p className="mb-4 text-sm text-slate-600">
        This account becomes the Super Admin. The password you choose here is its real password — there is
        no temporary one.
      </p>

      {message && (
        <div className="panel__status">
          <AuthError title="Setup could not be completed">{message}</AuthError>
        </div>
      )}

      <div className="tdms-field">
        <label htmlFor="name">Full Name</label>
        <div className="tdms-input-wrap">
          <input
            id="name"
            type="text"
            required
            autoFocus
            autoComplete="name"
            placeholder="Enter the administrator's name"
            value={form.name}
            aria-invalid={errors.name ? true : undefined}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <FieldError messages={errors.name} />
      </div>

      <div className="tdms-field">
        <label htmlFor="email">{domainRestricted ? 'Institutional Email' : 'Email Address'}</label>
        <div className="tdms-input-wrap">
          <MailIcon className="tdms-input-icon" />
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={domainRestricted ? `name@${allowedDomain}` : 'you@example.com'}
            value={form.email}
            aria-invalid={errors.email ? true : undefined}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        {domainRestricted && (
          <p className="mt-1 text-xs text-slate-500">Must be an @{allowedDomain} address.</p>
        )}
        <FieldError messages={errors.email} />
      </div>

      <div className="tdms-field">
        <label htmlFor="password">Password</label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          value={form.password}
          onChange={(password) => setForm({ ...form, password })}
          invalid={Boolean(errors.password)}
          describedBy="password-requirements"
        />
        <p className="tdms-requirements-heading" id="password-requirements">
          Password requirements
        </p>
        <ul className="tdms-password-requirements" aria-live="polite">
          {PASSWORD_REQUIREMENTS.map((requirement) => {
            const met = requirements[requirement.id];
            return (
              <li key={requirement.id} className={met ? 'is-met' : undefined}>
                <span className="tdms-req-icon" aria-hidden="true">
                  {met ? '✓' : ''}
                </span>
                <span>
                  {requirement.label}
                  <span className="sr-only">{met ? ' — met' : ' — not met yet'}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <FieldError messages={errors.password} />
      </div>

      <div className="tdms-field">
        <label htmlFor="password_confirmation">Confirm Password</label>
        <PasswordInput
          id="password_confirmation"
          autoComplete="new-password"
          placeholder="Re-enter the password"
          value={form.passwordConfirmation}
          onChange={(passwordConfirmation) => setForm({ ...form, passwordConfirmation })}
          invalid={Boolean(errors.passwordConfirmation)}
        />
        {form.passwordConfirmation.length > 0 && (
          <p
            className={`tdms-password-match${passwordsMatch ? ' is-met' : ' is-mismatch'}`}
            aria-live="polite"
          >
            <span className="tdms-req-icon" aria-hidden="true">
              {passwordsMatch ? '✓' : '!'}
            </span>
            {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
          </p>
        )}
        <FieldError messages={errors.passwordConfirmation} />
      </div>



      <button type="submit" className="tdms-submit" disabled={busy || !complete}>
        {busy ? (
          <>
            <span className="tdms-spinner" aria-hidden="true" />
            <span>Creating Super Admin…</span>
          </>
        ) : (
          <span>Create Super Admin</span>
        )}
      </button>

      {!complete && !busy && (
        <p className="tdms-submit-hint">
          Fill in every field and meet every password requirement to continue.
        </p>
      )}
    </form>
  );
}
