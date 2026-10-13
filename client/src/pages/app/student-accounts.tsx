import { useState } from 'react';
import Link from '@/lib/link';
import Modal from '@/components/Modal';
import { Alert, Badge, BUTTON_PRIMARY, BUTTON_SECONDARY, Card, EmptyState, FieldError, INPUT_CLASS, LABEL_CLASS, PageHeader, Pagination } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { Page } from '@/lib/page-data';
import type { loadStudentAccounts } from '@/server/controllers/pages/app/student-accounts';

type Data = Awaited<ReturnType<typeof loadStudentAccounts>>;
type Row = Data['rows'][number];

const STATE_TONE: Record<string, string> = { NONE: 'pending', ACTIVE: 'active', PASSWORD_CHANGE: 'submitted', SUSPENDED: 'suspended', INACTIVE: 'suspended', PENDING: 'pending' };

/** The temporary password, shown once with a copy button. */
function OneTimePassword({ email, password, name }: { email: string; password: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <Alert type="success" title={`Account created for ${name}`}>Give these to the student in person. The password is shown only now; they must change it at their first sign-in.</Alert>
      <dl className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div><dt className="text-xs font-medium uppercase text-slate-500">Sign in with</dt><dd className="font-medium text-navy-900">{email}</dd></div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Temporary password</dt>
          <dd className="flex items-center gap-3">
            <code className="rounded bg-white px-2 py-1 font-mono text-base text-navy-900 ring-1 ring-slate-200">{password}</code>
            <button type="button" className={BUTTON_SECONDARY} onClick={async () => { await navigator.clipboard?.writeText(password); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CreateAccount({ row, onClose }: { row: Row; onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState(row.email ?? '');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setErrors({});
    const result = await api.post<{ email: string; temporaryPassword: string }>(`/api/v1/students/${row.id}/account`, { email: email || null });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setError(result.message);
      setConfirming(false);
      if (result.code === 'ACCOUNT_ALREADY_EXISTS' || result.code === 'STUDENT_NOT_ENROLLED') router.refresh();
      return;
    }
    setCreated(result.data);
    router.refresh();
  }

  if (created) {
    return (
      <div className="space-y-4">
        <OneTimePassword email={created.email} password={created.temporaryPassword} name={row.name} />
        <div className="flex justify-end"><button type="button" className={BUTTON_PRIMARY} onClick={onClose}>Done</button></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <div><dt className="text-xs font-medium uppercase text-slate-500">Student</dt><dd className="text-navy-900">{row.name} · {row.studentNumber}</dd></div>
        <div><dt className="text-xs font-medium uppercase text-slate-500">Program</dt><dd className="text-navy-900">{row.program.code} — {row.program.name}</dd></div>
        <div><dt className="text-xs font-medium uppercase text-slate-500">Enrolled</dt><dd className="text-navy-900">{row.term ?? '—'} · Year {row.yearLevel}</dd></div>
        <div><dt className="text-xs font-medium uppercase text-slate-500">Role</dt><dd className="text-navy-900">Student</dd></div>
      </dl>
      <div>
        <label className={LABEL_CLASS} htmlFor="sa-email">Sign-in email</label>
        <input id="sa-email" type="email" className={INPUT_CLASS} value={email} onChange={(e) => { setEmail(e.target.value); setConfirming(false); }} placeholder="student@example.com" />
        <FieldError messages={errors.email} />
        <p className="mt-1 text-xs text-slate-500">Taken from the student record; change it if they will sign in with another address.</p>
      </div>
      {error && !Object.keys(errors).length && <Alert type="danger">{error}</Alert>}
      {!confirming ? (
        <div className="flex justify-end gap-2">
          <button type="button" className={BUTTON_SECONDARY} onClick={onClose}>Cancel</button>
          <button type="button" className={BUTTON_PRIMARY} disabled={busy || !email.trim()} onClick={() => setConfirming(true)}>Create Student Account…</button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-navy-900">Create a student login for <b>{row.name}</b> with <b>{email}</b>? A temporary password is generated and shown once; the student must change it at first sign-in.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => setConfirming(false)}>Back</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Yes, create account'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResetPassword({ row, onClose }: { row: Row; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  async function reset() {
    setBusy(true);
    setError(null);
    const result = await api.post<{ temporaryPassword: string }>(`/api/v1/staff/${row.account!.id}/reset-password`);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setIssued(result.data.temporaryPassword);
  }
  if (issued) {
    return (
      <div className="space-y-4">
        <OneTimePassword email={row.account!.email} password={issued} name={row.name} />
        <div className="flex justify-end"><button type="button" className={BUTTON_PRIMARY} onClick={onClose}>Done</button></div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Alert type="info" title="Account Already Exists">{row.name} already signs in as {row.account!.email}. Issuing a new temporary password signs them out and makes them choose a new one.</Alert>
      {error && <Alert type="danger">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BUTTON_SECONDARY} onClick={onClose}>Close</button>
        <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={reset}>{busy ? 'Issuing…' : 'Issue temporary password'}</button>
      </div>
    </div>
  );
}

function Filters({ d }: { d: Data }) {
  const router = useRouter();
  const [f, setF] = useState<Record<string, string>>({ ...d.query });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const go = (values: Record<string, string>) => {
    const q = new URLSearchParams(Object.entries(values).filter(([, v]) => v));
    router.push(`/student-accounts${q.toString() ? `?${q}` : ''}`);
  };
  const select = 'block w-full rounded-lg border-slate-300 text-sm shadow-sm';
  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); go(f); }} aria-label="Filter students">
        <div className="lg:col-span-2"><label className={LABEL_CLASS} htmlFor="sa-search">Search</label><input id="sa-search" className={INPUT_CLASS} value={f.search ?? ''} onChange={set('search')} placeholder="Name or student number" /></div>
        <div><label className={LABEL_CLASS} htmlFor="sa-program">Program</label><select id="sa-program" className={select} value={f.programId ?? ''} onChange={set('programId')}><option value="">All</option>{d.programs.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></div>
        <div><label className={LABEL_CLASS} htmlFor="sa-sy">School year</label><select id="sa-sy" className={select} value={f.schoolYear ?? ''} onChange={set('schoolYear')}><option value="">All</option>{d.schoolYears.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
        <div><label className={LABEL_CLASS} htmlFor="sa-sem">Semester</label><select id="sa-sem" className={select} value={f.semester ?? ''} onChange={set('semester')}><option value="">All</option><option value="1">1st</option><option value="2">2nd</option></select></div>
        <div><label className={LABEL_CLASS} htmlFor="sa-year">Year level</label><select id="sa-year" className={select} value={f.yearLevel ?? ''} onChange={set('yearLevel')}><option value="">All</option>{[1, 2, 3].map((y) => <option key={y} value={y}>Year {y}</option>)}</select></div>
        <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
          <button type="submit" className={BUTTON_PRIMARY}>Apply</button>
          <Link href="/student-accounts" className={BUTTON_SECONDARY}>Clear</Link>
        </div>
      </form>
    </Card>
  );
}

type Dialog = { kind: 'create' | 'reset'; row: Row };

function View(d: Data) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const account = d.query.account ?? '';
  const chips: [string, string][] = [['', 'All enrolled'], ['NONE', d.stateLabels.NONE], ['PASSWORD_CHANGE', d.stateLabels.PASSWORD_CHANGE], ['ACTIVE', d.stateLabels.ACTIVE], ['SUSPENDED', d.stateLabels.SUSPENDED]];
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  const href = (value: string) => {
    const q = new URLSearchParams(Object.entries({ ...d.query, account: value }).filter(([, v]) => v));
    return `/student-accounts${q.toString() ? `?${q}` : ''}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Student Accounts" subtitle="Login accounts for students whose enrollment is approved (Enrolled). Approval happens on Enrollments; the account is created here." />
      <Filters key={JSON.stringify(d.query)} d={d} />

      <nav aria-label="Filter by account" className="flex flex-wrap gap-2">
        {chips.map(([value, text]) => {
          const active = value === account;
          const n = value ? d.counts[value as keyof typeof d.counts] ?? 0 : total;
          return (
            <Link key={value || 'all'} href={href(value)} aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {text} <span className={`ml-1 tabular-nums ${active ? 'text-white/80' : 'text-slate-500'}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <Card padding="p-0">
        {d.rows.length === 0 ? (
          <EmptyState title="No enrolled students match" description="Only students with an approved (Enrolled) enrollment are listed here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    {['Student', 'Program', 'Enrolled', 'Login account', ''].map((h) => <th key={h} scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">{h || <span className="sr-only">Actions</span>}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-6 py-3.5 text-sm">
                        <Link href={`/students/${r.id}/enrollment`} className="font-medium text-primary-700 hover:underline">{r.name}</Link>
                        <p className="text-xs text-slate-500">{r.studentNumber}</p>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-600">{r.program.code}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-600">{r.term ?? '—'}<p className="text-xs text-slate-500">Year {r.yearLevel}</p></td>
                      <td className="px-6 py-3.5 text-sm">
                        <Badge status={STATE_TONE[r.state] ?? 'pending'} label={r.stateLabel} />
                        {r.account && <p className="text-xs text-slate-500">{r.account.email}</p>}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {r.state === 'NONE'
                          ? <button type="button" className={BUTTON_PRIMARY} onClick={() => setDialog({ kind: 'create', row: r })}>Create Student Account</button>
                          : <button type="button" className={BUTTON_SECONDARY} onClick={() => setDialog({ kind: 'reset', row: r })}>Manage</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={d.page} lastPage={d.lastPage} total={d.total} basePath="/student-accounts" query={d.query} />
          </>
        )}
      </Card>

      <Modal open={dialog !== null} onClose={() => setDialog(null)} title={dialog?.kind === 'create' ? 'Create Student Account' : 'Student Account'} subtitle={dialog ? `${dialog.row.name} · ${dialog.row.studentNumber}` : undefined}>
        {dialog?.kind === 'create' && <CreateAccount key={dialog.row.id} row={dialog.row} onClose={() => setDialog(null)} />}
        {dialog?.kind === 'reset' && <ResetPassword key={dialog.row.id} row={dialog.row} onClose={() => setDialog(null)} />}
      </Modal>
    </div>
  );
}

/** /student-accounts */
export default function StudentAccountsPage() {
  return <Page<Data> endpoint="/student-accounts" render={(d) => <View {...d} />} />;
}
