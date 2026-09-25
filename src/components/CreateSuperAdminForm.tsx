'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { FieldError } from '@/components/ui';

/**
 * Port of livewire/pages/auth/create-super-admin.blade.php.
 *
 * Uses the same branded panel classes as the login form so the one-time
 * setup screen looks like the rest of the auth flow.
 */
export default function CreateSuperAdminForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', email: '', password: '', passwordConfirmation: '',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setMessage(null);
    const result = await api.post<{ redirectTo: string }>('/api/auth/super-admin', form);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={submit}>
        <div className="tdms-field">
          <label htmlFor="name">Full Name</label>
          <div className="tdms-input-wrap">
            <input id="name" type="text" required autoFocus placeholder="Enter the administrator's name"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <FieldError messages={errors.name} />
        </div>

        <div className="tdms-field">
          <label htmlFor="email">Email</label>
          <div className="tdms-input-wrap">
            <input id="email" type="email" required autoComplete="username" placeholder="Enter the email address"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <FieldError messages={errors.email} />
        </div>

        <div className="tdms-field">
          <label htmlFor="password">Password</label>
          <div className="tdms-input-wrap">
            <input id="password" type="password" required autoComplete="new-password"
              placeholder="At least 12 characters"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <FieldError messages={errors.password} />
        </div>

        <div className="tdms-field">
          <label htmlFor="password_confirmation">Confirm Password</label>
          <div className="tdms-input-wrap">
            <input id="password_confirmation" type="password" required autoComplete="new-password"
              placeholder="Re-enter the password"
              value={form.passwordConfirmation}
              onChange={(e) => setForm({ ...form, passwordConfirmation: e.target.value })} />
          </div>
          <FieldError messages={errors.passwordConfirmation} />
        </div>

        {message && <p className="mt-2 text-sm text-red-600">{message}</p>}

        <button type="submit" className="tdms-submit" disabled={busy}>
          <span>{busy ? 'Creating…' : 'Create Super Admin'}</span>
        </button>
      </form>

      <div className="tdms-bootstrap-wrap">
        <Link href="/login" className="tdms-bootstrap-link">
          <span>Back to sign in</span>
        </Link>
      </div>
    </div>
  );
}
