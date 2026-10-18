import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Check, ChevronRight, Clock, Eye, EyeOff, KeyRound, LogIn, Monitor, Moon, Pencil, ShieldCheck, Sun, UserRound, X,
} from 'lucide-react';
import Link from '@/lib/link';
import { useRouter } from '@/lib/navigation';
import { api } from '@/lib/api-client';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { useConfirm } from '@/components/ConfirmDialog';
import { Card, FieldError, Alert, BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS } from '@/components/ui';
import { formatDate, diffForHumans } from '@shared/lib/dates';
import { PASSWORD_REQUIREMENTS, evaluatePassword } from '@shared/lib/password-policy';

/**
 * My Profile — one page for every role. What differs between a Director, an
 * Instructor or a Student comes from their own account (role, program, sign-in
 * methods), never from a separate implementation.
 *
 * Only real data is shown: there is no phone, office or photo upload in the
 * account, so none is offered. The email address and role are read-only here
 * (an administrator changes them); the name, the password and the theme are
 * the person's own to change. Every save goes through the existing routes,
 * which act only on the signed-in account.
 */

interface ActivityEvent {
  id: string;
  action: string;
  label: string;
  kind: 'signin' | 'profile' | 'security';
  at: string;
  device: string | null;
  ip: string | null;
}

interface Props {
  user: {
    name: string;
    email: string;
    username: string | null;
    emailVerified: boolean;
    status: string;
    roles: string[];
    createdAt: string | null;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
    avatarUrl: string | null;
    googleLinked: boolean;
    student: { studentNumber: string; program: string } | null;
  };
  activity: ActivityEvent[];
}

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'activity', label: 'Activity' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const STATUS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-primary-50 text-primary-700 ring-primary-600/20' },
  PENDING: { label: 'Pending', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  SUSPENDED: { label: 'Suspended', className: 'bg-red-50 text-red-700 ring-red-600/20' },
  INACTIVE: { label: 'Inactive', className: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
};

const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

function tabFromUrl(): TabId {
  const t = new URLSearchParams(window.location.search).get('tab');
  return (TABS.some((x) => x.id === t) ? t : 'profile') as TabId;
}

export default function ProfileScreen({ user, activity }: Props) {
  const [tab, setTab] = useState<TabId>(tabFromUrl);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const base = useId();

  // The open tab is in the address, so a reload or a shared link opens it.
  function select(next: TabId, focus = false) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'profile') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    const to = e.key === 'ArrowRight' ? (i + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    select(TABS[to]!.id, true);
  }

  const status = STATUS[user.status] ?? { label: user.status, className: 'bg-slate-100 text-slate-700 ring-slate-500/20' };

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-sm text-slate-500">
            <li><Link href="/dashboard" className="rounded hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">Home</Link></li>
            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
            <li aria-current="page" className="font-medium text-ink">My Profile</li>
          </ol>
        </nav>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-ink sm:text-[28px]">My Profile</h1>
        <p className="mt-1 text-sm text-muted">Manage your personal information, account security, and preferences.</p>
      </div>

      {/* Overview */}
      <Card padding="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={user.name} url={user.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-ink">{user.name}</h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${status.className}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status.label}
              </span>
            </div>
            <p className="mt-0.5 text-sm font-medium text-slate-600">{user.roles.length ? user.roles.join(' · ') : 'No role assigned yet'}</p>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
              <Fact label="Email"><span className="[overflow-wrap:anywhere]">{user.email}</span></Fact>
              {user.student && <Fact label="Program">{user.student.program}</Fact>}
              {user.createdAt && <Fact label="Member since">{formatDate(user.createdAt)}</Fact>}
              {user.lastLoginAt && <Fact label="Last sign-in"><span title={dateTime(user.lastLoginAt)}>{diffForHumans(user.lastLoginAt)}</span></Fact>}
            </dl>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div>
        <div role="tablist" aria-label="Profile sections" className="flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              id={`${base}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={onTabKey}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold sm:px-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600 ${
                tab === t.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {TABS.map((t) => (
          <div key={t.id} id={`${base}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${t.id}`} hidden={tab !== t.id} tabIndex={0}
            className="pt-5 focus:outline-none">
            {tab === t.id && t.id === 'profile' && <ProfileTab user={user} />}
            {tab === t.id && t.id === 'security' && <SecurityTab user={user} />}
            {tab === t.id && t.id === 'preferences' && <PreferencesTab />}
            {tab === t.id && t.id === 'activity' && <ActivityTab activity={activity} createdAt={user.createdAt} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-2xl font-bold text-primary-700 ring-4 ring-primary-50">
      {url && !failed
        ? <img src={url} alt={`${name}’s profile photo`} className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span aria-hidden="true">{initials(name)}</span>}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="font-medium text-ink">{children}</dd>
    </div>
  );
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

// --- Profile ----------------------------------------------------------------

function ProfileTab({ user }: { user: Props['user'] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  // The saved name shows at once; the page data catches up on its refresh.
  const [shownName, setShownName] = useState(user.name);
  useEffect(() => { setShownName(user.name); }, [user.name]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  function start() { setName(shownName); setErrors({}); setMessage(null); setSaved(false); setEditing(true); }
  function cancel() { setEditing(false); setErrors({}); setMessage(null); }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) { setErrors({ name: ['Please enter your name.'] }); return; }
    setBusy(true); setErrors({}); setMessage(null);
    const result = await api.put('/api/v1/profile', { name: trimmed });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }
    setShownName(trimmed);
    setEditing(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <Card padding="p-0">
      <SectionHeader
        title="Profile information"
        description="Your name as it appears across TDMS. Your email and role are managed by an administrator."
        action={!editing ? (
          <button type="button" className={BUTTON_SECONDARY} onClick={start}>
            <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Edit
          </button>
        ) : undefined}
      />
      <form onSubmit={save} className="px-5 py-5 sm:px-6" noValidate>
        <dl className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <dt><label htmlFor="profile-name" className={LABEL_CLASS}>Full name</label></dt>
            <dd className="mt-1.5">
              {editing ? (
                <>
                  <input ref={input} id="profile-name" className={INPUT_CLASS} maxLength={255} value={name} autoComplete="name"
                    aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? 'profile-name-error' : undefined}
                    onChange={(e) => setName(e.target.value)} required />
                  <div id="profile-name-error"><FieldError messages={errors.name} /></div>
                </>
              ) : <p className="text-sm text-ink">{shownName}</p>}
            </dd>
          </div>
          <ReadOnly label="Email address" note="Contact an administrator to change it.">
            <span className="[overflow-wrap:anywhere]">{user.email}</span>
            <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${user.emailVerified ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-800'}`}>
              {user.emailVerified ? <><Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />Verified</> : 'Unverified'}
            </span>
          </ReadOnly>
          {user.username && <ReadOnly label="Username" note="Sign in with this or your email.">{user.username}</ReadOnly>}
          <ReadOnly label={user.roles.length > 1 ? 'Roles' : 'Role'}>{user.roles.length ? user.roles.join(', ') : 'None yet'}</ReadOnly>
          {user.student && <ReadOnly label="Student number"><span className="font-mono">{user.student.studentNumber}</span></ReadOnly>}
          {user.student && <ReadOnly label="Program">{user.student.program}</ReadOnly>}
        </dl>

        {message && <div className="mt-5"><Alert type="danger">{message}</Alert></div>}
        {saved && !editing && <p role="status" className="mt-5 flex items-center gap-2 text-sm font-medium text-primary-700"><Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />Profile saved.</p>}

        {editing && (
          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" className={BUTTON_SECONDARY} onClick={cancel} disabled={busy}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy || name.trim() === shownName}>{busy ? 'Saving…' : 'Save Changes'}</button>
          </div>
        )}
      </form>
    </Card>
  );
}

function ReadOnly({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className="mt-1.5 text-sm text-ink">{children}</dd>
      {note && <dd className="mt-1 text-xs text-slate-500">{note}</dd>}
    </div>
  );
}

// --- Security ---------------------------------------------------------------

const EMPTY_PASSWORDS = { currentPassword: '', password: '', passwordConfirmation: '' };

function SecurityTab({ user }: { user: Props['user'] }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const checks = useMemo(() => evaluatePassword(form.password), [form.password]);
  const strong = PASSWORD_REQUIREMENTS.every((r) => checks[r.id]);
  const matches = form.passwordConfirmation.length > 0 && form.password === form.passwordConfirmation;
  const ready = form.currentPassword.length > 0 && strong && matches;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setErrors({}); setMessage(null); setDone(null);
    await confirm({
      tone: 'info',
      title: 'Change your password?',
      description: 'You stay signed in on this device. Every other device and browser signed in to your account will be signed out.',
      confirmLabel: 'Change password',
      pendingLabel: 'Changing…',
      action: async () => {
        const result = await api.put<{ otherSessionsEnded: number }>('/api/v1/profile/password', form);
        if (!result.ok) {
          setErrors(result.errors ?? {});
          setMessage(result.errors ? null : result.message);
          // Never keep a refused password on screen; the current one is re-entered.
          setForm({ ...form, currentPassword: '' });
          return false;
        }
        setForm(EMPTY_PASSWORDS);
        const n = result.data.otherSessionsEnded;
        setDone(`Password updated.${n > 0 ? ` ${n} other session${n === 1 ? ' was' : 's were'} signed out.` : ''}`);
        return true;
      },
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card padding="p-0" className="lg:col-span-2">
        <SectionHeader title="Change password" description="Your current password is checked before anything changes." />
        <form onSubmit={submit} className="space-y-4 px-5 py-5 sm:px-6" noValidate>
          <PasswordField id="pw-current" label="Current password" autoComplete="current-password" value={form.currentPassword}
            onChange={(v) => setForm({ ...form, currentPassword: v })} errors={errors.currentPassword} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PasswordField id="pw-new" label="New password" autoComplete="new-password" value={form.password} describedBy="pw-rules"
              onChange={(v) => setForm({ ...form, password: v })} errors={errors.password} />
            <PasswordField id="pw-confirm" label="Confirm new password" autoComplete="new-password" value={form.passwordConfirmation}
              onChange={(v) => setForm({ ...form, passwordConfirmation: v })} errors={errors.passwordConfirmation} />
          </div>
          <ul id="pw-rules" className="grid grid-cols-1 gap-1.5 rounded-lg border border-border bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2" aria-label="Password requirements">
            {PASSWORD_REQUIREMENTS.map((r) => <Rule key={r.id} ok={checks[r.id]} label={r.label} />)}
            <Rule ok={matches} label="Both new passwords match" />
          </ul>
          {message && <Alert type="danger">{message}</Alert>}
          {done && <p role="status" className="flex items-center gap-2 text-sm font-medium text-primary-700"><Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />{done}</p>}
          <div className="flex justify-end border-t border-border pt-4">
            <button type="submit" className={BUTTON_PRIMARY} disabled={!ready}>
              <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Update Password
            </button>
          </div>
        </form>
      </Card>

      <Card padding="p-0">
        <SectionHeader title="Account security" description="How your account is protected." />
        <dl className="divide-y divide-border px-5 sm:px-6">
          <SecurityFact icon={KeyRound} label="Password last changed">
            {user.passwordChangedAt ? formatDate(user.passwordChangedAt) : 'Not changed since the account was set up'}
          </SecurityFact>
          <SecurityFact icon={LogIn} label="Last sign-in">
            {user.lastLoginAt ? dateTime(user.lastLoginAt) : 'Not recorded'}
          </SecurityFact>
          <SecurityFact icon={ShieldCheck} label="Google sign-in">
            {user.googleLinked ? 'Linked to your Google account' : 'Not linked'}
          </SecurityFact>
        </dl>
      </Card>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, errors, autoComplete, describedBy }: {
  id: string; label: string; value: string; onChange: (v: string) => void; errors?: string[]; autoComplete: string; describedBy?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
      <div className="relative mt-1.5">
        <input id={id} type={shown ? 'text' : 'password'} className={`${INPUT_CLASS} pr-11`} value={value} autoComplete={autoComplete}
          aria-invalid={errors?.length ? true : undefined} aria-describedby={[describedBy, errors?.length ? `${id}-error` : null].filter(Boolean).join(' ') || undefined}
          onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShown(!shown)} aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
          {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <div id={`${id}-error`}><FieldError messages={errors} /></div>
    </div>
  );
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? 'text-primary-700' : 'text-slate-600'}`}>
      {ok ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden="true" /> : <X className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.5} aria-hidden="true" />}
      <span>{label}<span className="sr-only">{ok ? ' — met' : ' — not met yet'}</span></span>
    </li>
  );
}

function SecurityFact({ icon: Icon, label, children }: { icon: typeof KeyRound; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="text-sm font-medium text-ink">{children}</dd>
      </div>
    </div>
  );
}

// --- Preferences ------------------------------------------------------------

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', hint: 'Always light', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Always dark', icon: Moon },
  { value: 'system', label: 'Match device', hint: 'Follows your device setting', icon: Monitor },
];

function PreferencesTab() {
  const { preference, choose } = useTheme();
  return (
    <Card padding="p-0" className="max-w-3xl">
      <SectionHeader title="Appearance" description="Applies right away and is remembered on this browser." />
      <fieldset className="px-5 py-5 sm:px-6">
        <legend className="sr-only">Theme</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((o) => {
            const on = preference === o.value;
            return (
              <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-600 ${on ? 'border-primary-600 bg-primary-50' : 'border-border hover:bg-slate-50'}`}>
                <input type="radio" name="theme" value={o.value} checked={on} onChange={() => choose(o.value)} className="sr-only" />
                <o.icon className={`mt-0.5 h-5 w-5 ${on ? 'text-primary-700' : 'text-slate-500'}`} strokeWidth={1.9} aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{o.label}</span>
                  <span className="block text-xs text-slate-500">{o.hint}</span>
                </span>
                {on && <Check className="ml-auto h-4 w-4 text-primary-700" strokeWidth={2.5} aria-hidden="true" />}
              </label>
            );
          })}
        </div>
      </fieldset>
    </Card>
  );
}

// --- Activity ---------------------------------------------------------------

const KIND_ICON = { signin: LogIn, profile: UserRound, security: ShieldCheck } as const;

function ActivityTab({ activity, createdAt }: { activity: ActivityEvent[]; createdAt: string | null }) {
  return (
    <Card padding="p-0" className="max-w-3xl">
      <SectionHeader title="Recent account activity" description="Sign-ins and changes to your account, newest first. If something looks unfamiliar, change your password." />
      {activity.length === 0 && !createdAt ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500 sm:px-6">No account activity has been recorded yet. Sign-ins and changes appear here from now on.</p>
      ) : (
        <ol className="px-5 py-4 sm:px-6">
          {activity.map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700 ring-4 ring-card">
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </span>
                <div className="min-w-0 pt-1">
                  <p className="text-sm font-semibold text-ink">{e.label}</p>
                  <p className="text-xs text-slate-500">
                    <time dateTime={e.at}>{dateTime(e.at)}</time>
                    {e.device && <> · {e.device}</>}
                    {e.ip && <> · {e.ip}</>}
                  </p>
                </div>
              </li>
            );
          })}
          {createdAt && (
            <li className="flex gap-3 pt-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Clock className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></span>
              <div className="pt-1">
                <p className="text-sm font-semibold text-ink">Account created</p>
                <p className="text-xs text-slate-500"><time dateTime={createdAt}>{formatDate(createdAt)}</time></p>
              </div>
            </li>
          )}
        </ol>
      )}
      {activity.length > 0 && <p className="border-t border-border px-5 py-3 text-xs text-slate-500 sm:px-6">Showing your {activity.length} most recent recorded event{activity.length === 1 ? '' : 's'}. Recording began with this version of My Profile.</p>}
    </Card>
  );
}

/** Shown while My Profile loads: the same shapes, no data. */
export function ProfileSkeleton() {
  const bar = 'animate-pulse rounded bg-slate-100';
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your profile">
      <div><div className={`${bar} h-4 w-32`} /><div className={`${bar} mt-3 h-8 w-48`} /><div className={`${bar} mt-2 h-4 w-80 max-w-full`} /></div>
      <Card padding="p-6">
        <div className="flex items-center gap-5"><div className="h-20 w-20 animate-pulse rounded-full bg-slate-100" /><div className="flex-1"><div className={`${bar} h-6 w-56`} /><div className={`${bar} mt-2 h-4 w-32`} /><div className={`${bar} mt-4 h-4 w-full`} /></div></div>
      </Card>
      <div className={`${bar} h-10 w-full`} />
      <Card padding="p-6">{[0, 1, 2].map((i) => <div key={i} className={`${bar} mt-3 h-10 w-full first:mt-0`} />)}</Card>
    </div>
  );
}
