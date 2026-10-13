import { useEffect, useState, type ReactNode } from 'react';
import { BadgeCheck, BookOpen, CircleAlert, FileText, KeyRound, Loader2, Lock, User } from 'lucide-react';
import Drawer from '@/components/Drawer';
import { Avatar } from '@/components/ui';
import { api } from '@/lib/api-client';
import { yearLevelLabel, SEMESTER_LABELS } from '@shared/lib/teaching';
import { ENROLLMENT_STATUS_LABELS, STUDENT_STATUS_LABELS, type EnrollmentStatus, type StudentStatus } from '@shared/types/domain';
import type { SectionStudentProfile } from '@/server/services/teaching/class-setup';

/**
 * Student Information — opened from a row of the Section Roster.
 *
 * Reads GET /api/v1/sections/:id/students/:studentId, which only answers for
 * a student of that section and leaves out what the viewer may not see
 * (personal details, documents, account) — those parts say so here instead.
 * Nothing on this panel changes data; removal stays on the roster row.
 */

const date = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : null);

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  enrolled: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  verified: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  ACTIVE: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  submitted: 'bg-amber-50 text-amber-800 ring-amber-200',
  under_review: 'bg-amber-50 text-amber-800 ring-amber-200',
  applicant: 'bg-amber-50 text-amber-800 ring-amber-200',
  missing: 'bg-slate-100 text-slate-700 ring-slate-200',
};
const pill = (status: string, label: string) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_TONE[status] ?? 'bg-red-50 text-red-700 ring-red-200'}`}>{label}</span>
);
const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-ink">
        <Icon className="h-4 w-4 text-emerald-700" aria-hidden="true" /> {title}
      </h3>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v ?? <span className="text-muted">Not recorded</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function Restricted({ what }: { what: string }) {
  return (
    <p className="flex gap-2 text-sm text-muted">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {what} are visible to the Admin, Director and Secretary.
    </p>
  );
}

export default function StudentInfoPanel({ sectionId, studentId, onClose }: { sectionId: string; studentId: string | null; onClose: () => void }) {
  const [data, setData] = useState<SectionStudentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let live = true;
    setData(null);
    setError(null);
    void api.get<SectionStudentProfile>(`/api/v1/sections/${sectionId}/students/${studentId}`).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data); else setError(r.message);
    });
    return () => { live = false; };
  }, [sectionId, studentId]);

  return (
    <Drawer open={studentId !== null} onClose={onClose} title="Student Information" width="sm:max-w-xl">
      {error ? (
        <p role="alert" className="flex gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : !data ? (
        <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the student’s information…</p>
      ) : (
        <div className="space-y-4">
          {/* Profile header */}
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
            <div className="flex items-center gap-4">
              <Avatar name={data.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-lg font-semibold leading-tight text-ink">{data.name}</p>
                <p className="text-sm text-muted">Student ID <span className="font-medium tabular-nums text-ink">{data.studentNumber}</span></p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pill(data.status, STUDENT_STATUS_LABELS[data.status as StudentStatus] ?? humanize(data.status))}
                  {data.enrollment && pill(data.enrollment.status, `${ENROLLMENT_STATUS_LABELS[data.enrollment.status as EnrollmentStatus] ?? humanize(data.enrollment.status)} · ${data.enrollment.schoolYear}`)}
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-100 pt-3 text-sm sm:grid-cols-4">
              <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Program</dt><dd className="font-medium text-ink">{data.program.code}</dd></div>
              <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Year level</dt><dd className="font-medium text-ink">{yearLevelLabel(data.yearLevel)}</dd></div>
              <div className="col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Section</dt><dd className="font-medium text-ink">{data.section.label}</dd></div>
            </dl>
          </div>

          <Section icon={User} title="Personal information">
            {data.personal ? (
              <Fields rows={[
                ['First name', data.personal.firstName],
                ['Middle name', data.personal.middleName],
                ['Last name', data.personal.lastName],
                ['Date of birth', date(data.personal.dateOfBirth)],
                ['Email address', data.personal.email],
                ['Phone number', data.personal.phone],
              ]} />
            ) : <Restricted what="Personal details" />}
          </Section>

          <Section icon={BookOpen} title="Academic information">
            <Fields rows={[
              ['Program', `${data.program.code} — ${data.program.name}`],
              ['Curriculum', data.curriculum ? `${data.curriculum.version} (from ${data.curriculum.effective})` : null],
              ['Year level', yearLevelLabel(data.yearLevel)],
              ['Section', data.section.label],
              ['School year', data.section.schoolYear],
              ['Current semester', SEMESTER_LABELS[data.section.currentSemester] ?? `Semester ${data.section.currentSemester}`],
              ['Enrollment', data.enrollment ? `${ENROLLMENT_STATUS_LABELS[data.enrollment.status as EnrollmentStatus] ?? humanize(data.enrollment.status)} · Semester ${data.enrollment.semester}` : 'No enrollment for this school year'],
              ['Approved', data.enrollment?.approvedAt ? `${date(data.enrollment.approvedAt)}${data.enrollment.approvedBy ? ` by ${data.enrollment.approvedBy}` : ''}` : null],
              ['Placed in section', date(data.section.placedAt)],
              ['First enrolled', data.personal ? date(data.personal.enrollmentDate) : null],
            ].filter(([k]) => k !== 'First enrolled' || data.personal) as [string, ReactNode][]} />
          </Section>

          <Section icon={FileText} title="Credentials and documents">
            {data.documents === null ? <Restricted what="Documents" /> : data.documents.length === 0 ? (
              <p className="text-sm text-muted">No document checklist yet. It is created when the student’s record is first opened under Students.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.documents.map((d) => (
                  <li key={d.name} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{d.name}{d.required && <span className="ml-1 text-xs font-normal text-muted">(required)</span>}</p>
                      <p className="text-xs text-muted">
                        Version {d.version}
                        {d.verifiedAt ? ` · Verified ${date(d.verifiedAt)}${d.verifiedBy ? ` by ${d.verifiedBy}` : ''}` : d.submittedAt ? ` · Submitted ${date(d.submittedAt)}` : ''}
                      </p>
                    </div>
                    {pill(d.status, humanize(d.status))}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={KeyRound} title="Account">
            {data.account === null ? <Restricted what="Account details" /> : !data.account.exists ? (
              <p className="text-sm text-muted">No login account yet. The Admin creates one under Student Accounts once the enrollment is approved.</p>
            ) : (
              <Fields rows={[
                ['Account status', <span key="s" className="inline-flex items-center gap-1.5">{pill(data.account.status, humanize(data.account.status.toLowerCase()))}{data.account.passwordChangeRequired && <span className="text-xs text-muted">Password change required</span>}</span>],
                ['Sign-in email', data.account.email],
                ['Created', date(data.account.createdAt)],
                ['Last sign-in', date(data.account.lastSignIn) ?? 'Never'],
              ]} />
            )}
          </Section>

          {data.restricted.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Shown according to your role. Nothing here can be changed from this panel.</p>
          )}
        </div>
      )}
    </Drawer>
  );
}
