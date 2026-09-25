'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import {
  Card, PageHeader, FieldError, Alert,
  BUTTON_PRIMARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';

/**
 * Port of livewire/profile/update-profile-information-form.blade.php and
 * update-password-form.blade.php.
 *
 * The Laravel profile page also offered "Delete Account". That action is
 * implemented server-side (profile-service.deleteOwnAccount) but is not
 * surfaced here — see docs/migration.md, "Deliberate omissions".
 */

interface Props {
  user: { name: string; email: string; username: string | null; emailVerified: boolean };
}

export default function ProfileScreen({ user }: Props) {
  const router = useRouter();

  const [profile, setProfile] = useState({ name: user.name, email: user.email });
  const [profileErrors, setProfileErrors] = useState<Record<string, string[]>>({});
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [password, setPassword] = useState({
    currentPassword: '', password: '', passwordConfirmation: '',
  });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string[]>>({});
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileBusy(true); setProfileErrors({}); setProfileSaved(false); setProfileMessage(null);
    const result = await api.put('/api/profile', profile);
    setProfileBusy(false);
    if (!result.ok) {
      setProfileErrors(result.errors ?? {});
      setProfileMessage(result.errors ? null : result.message);
      return;
    }
    setProfileSaved(true);
    router.refresh();
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordBusy(true); setPasswordErrors({}); setPasswordSaved(false); setPasswordMessage(null);
    const result = await api.put('/api/profile/password', password);
    setPasswordBusy(false);
    if (!result.ok) {
      setPasswordErrors(result.errors ?? {});
      setPasswordMessage(result.errors ? null : result.message);
      // Laravel reset all three fields on failure.
      setPassword({ currentPassword: '', password: '', passwordConfirmation: '' });
      return;
    }
    setPassword({ currentPassword: '', password: '', passwordConfirmation: '' });
    setPasswordSaved(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" subtitle="Your account details and password." />

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Profile Information</h2>
        <p className="mt-1 text-sm text-slate-500">Update your name and email address.</p>

        <form onSubmit={saveProfile} className="mt-5 max-w-xl space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="p-name">Name</label>
            <input id="p-name" className={INPUT_CLASS} maxLength={255} value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
            <FieldError messages={profileErrors.name} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="p-email">Email</label>
            <input id="p-email" type="email" className={INPUT_CLASS} maxLength={255} value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })} required />
            <FieldError messages={profileErrors.email} />
            {!user.emailVerified && (
              <p className="mt-2 text-sm text-amber-700">Your email address is unverified.</p>
            )}
          </div>

          {user.username && (
            <div>
              <label className={LABEL_CLASS} htmlFor="p-username">Username</label>
              <input id="p-username" className={`${INPUT_CLASS} bg-slate-50`} value={user.username} readOnly disabled />
              <p className="mt-1 text-xs text-slate-500">
                You can sign in with either this username or your email. Contact an administrator to change it.
              </p>
            </div>
          )}

          {profileMessage && <Alert type="danger">{profileMessage}</Alert>}
          {profileSaved && <Alert type="success">Saved.</Alert>}

          <button type="submit" className={BUTTON_PRIMARY} disabled={profileBusy}>
            {profileBusy ? 'Saving…' : 'Save'}
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Update Password</h2>
        <p className="mt-1 text-sm text-slate-500">
          Use a long, random password to keep your account secure.
        </p>

        <form onSubmit={savePassword} className="mt-5 max-w-xl space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="p-current">Current Password</label>
            <input id="p-current" type="password" autoComplete="current-password" className={INPUT_CLASS}
              value={password.currentPassword}
              onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} required />
            <FieldError messages={passwordErrors.currentPassword} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="p-new">New Password</label>
            <input id="p-new" type="password" autoComplete="new-password" className={INPUT_CLASS}
              value={password.password}
              onChange={(e) => setPassword({ ...password, password: e.target.value })} required />
            <FieldError messages={passwordErrors.password} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="p-confirm">Confirm Password</label>
            <input id="p-confirm" type="password" autoComplete="new-password" className={INPUT_CLASS}
              value={password.passwordConfirmation}
              onChange={(e) => setPassword({ ...password, passwordConfirmation: e.target.value })} required />
            <FieldError messages={passwordErrors.passwordConfirmation} />
          </div>

          {passwordMessage && <Alert type="danger">{passwordMessage}</Alert>}
          {passwordSaved && <Alert type="success">Password updated.</Alert>}

          <button type="submit" className={BUTTON_PRIMARY} disabled={passwordBusy}>
            {passwordBusy ? 'Saving…' : 'Save'}
          </button>
        </form>
      </Card>
    </div>
  );
}
