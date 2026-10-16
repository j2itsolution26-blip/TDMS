import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Page } from '@/lib/page-data';
import { api } from '@/lib/api-client';
import { useAction } from '@/components/teaching/client-kit';
import { useConfirm } from '@/components/ConfirmDialog';
import { BTN, BTN_SMALL, Card, Empty, Field, Flash, INPUT, PageShell, StatusPill } from '@/components/teaching/kit';
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_AUDIENCE_LABELS, type AnnouncementAudience } from '@shared/lib/supplies';
import type { loadAnnouncements } from '@/server/controllers/pages/app/supplies';

type Data = Awaited<ReturnType<typeof loadAnnouncements>>;

function Compose({ programs }: { programs: Data['programs'] }) {
  const { busy, error, errors, notice, run } = useAction();
  const confirm = useConfirm();
  const [f, setF] = useState({ title: '', body: '', audience: 'BOTH' as AnnouncementAudience, programId: '' });
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    const program = f.programId ? programs.find((p) => p.id === f.programId) : null;
    await confirm({
      tone: 'success',
      title: 'Publish Announcement?',
      description: 'Each recipient is notified as soon as it is published.',
      details: [
        { label: 'Title', value: f.title },
        { label: 'Send to', value: ANNOUNCEMENT_AUDIENCE_LABELS[f.audience] },
        { label: 'Course', value: program ? `${program.code} — ${program.name}` : 'All courses' },
      ],
      confirmLabel: 'Publish',
      pendingLabel: 'Publishing…',
      action: async () => {
        const sent = await run(() => api.post<{ recipientCount: number }>('/api/v1/announcements', f), { success: 'Published. Every recipient has been notified.' });
        if (sent === null) return false;
        setF({ ...f, title: '', body: '' });
        return true;
      },
    });
  }
  return (
    <Card title="New announcement">
      <form className="space-y-4 pb-5" onSubmit={publish} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Send to" htmlFor="an-aud" error={errors.audience}>
            <select id="an-aud" className={INPUT} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as AnnouncementAudience })}>
              {ANNOUNCEMENT_AUDIENCES.map((a) => <option key={a} value={a}>{ANNOUNCEMENT_AUDIENCE_LABELS[a]}</option>)}
            </select>
          </Field>
          <Field label="Course" htmlFor="an-course" error={errors.programId} hint="One course, or everyone in the audience.">
            <select id="an-course" className={INPUT} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}>
              <option value="">All courses</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Title" htmlFor="an-title" error={errors.title}><input id="an-title" className={INPUT} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={255} required /></Field>
        <Field label="Message" htmlFor="an-body" error={errors.body}><textarea id="an-body" rows={4} className={INPUT} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={5000} required /></Field>
        {notice && <Flash kind="success">{notice}</Flash>}
        {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
        <div className="flex justify-end"><button type="submit" className={BTN} disabled={busy || !f.title.trim() || !f.body.trim()}><Megaphone className="h-4 w-4" aria-hidden="true" /> Publish</button></div>
      </form>
    </Card>
  );
}

function View({ announcements, canManage, programs }: Data) {
  const { busy, error, run } = useAction();
  const confirm = useConfirm();
  function withdraw(a: Data['announcements'][number]) {
    void confirm({
      tone: 'warning',
      title: 'Withdraw Announcement?',
      description: 'It disappears for readers; the record is kept.',
      details: [{ label: 'Title', value: a.title }, { label: 'Audience', value: a.audienceLabel }, { label: 'Recipients', value: a.recipientCount }],
      confirmLabel: 'Withdraw',
      pendingLabel: 'Withdrawing…',
      success: 'Announcement withdrawn.',
      action: async () => (await run(() => api.post(`/api/v1/announcements/${a.id}/withdraw`))) !== null,
    });
  }
  return (
    <PageShell eyebrow="Calendar" title="Announcements" description={canManage ? 'Announcements to instructors, students, or both — for every course or one. Recipients are notified when you publish.' : 'Announcements from the TVET Director addressed to you.'}>
      {canManage && <Compose programs={programs} />}
      {error && <Flash kind="error">{error}</Flash>}
      <Card title={canManage ? 'Published' : 'For you'}>
        {announcements.length === 0 ? (
          <div className="pb-5"><Empty title="No announcements yet" /></div>
        ) : (
          <ul className="divide-y divide-tdms-hairline">
            {announcements.map((a) => (
              <li key={a.id} className={`py-4 ${a.withdrawn ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-tdms-ink">{a.title}</p>
                    <p className="text-[13px] text-tdms-muted">{new Date(a.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {a.audienceLabel}{canManage ? ` · ${a.recipientCount} recipient${a.recipientCount === 1 ? '' : 's'}` : ''}</p>
                  </div>
                  {canManage && (a.withdrawn
                    ? <StatusPill label="Withdrawn" tone="neutral" />
                    : <button type="button" className={BTN_SMALL} disabled={busy} onClick={() => withdraw(a)}>Withdraw</button>)}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-tdms-ink">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}

/** /announcements */
export default function AnnouncementsPage() {
  return <Page<Data> endpoint="/announcements" render={(d) => <View {...d} />} />;
}
