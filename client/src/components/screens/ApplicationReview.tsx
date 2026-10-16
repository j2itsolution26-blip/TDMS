import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2, Paperclip, UserCheck } from 'lucide-react';
import Drawer from '@/components/Drawer';
import Link from '@/lib/link';
import { Badge } from '@/components/ui';
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, FIELD, LABEL, MUTED, Opt, Req, RING } from '@/components/fluent-form';
import { api } from '@/lib/api-client';
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@shared/types/domain';
import { DOCUMENT_STATUS_LABELS, EDUCATION_LABELS, isEditable, isHandedIn, type DocumentStatus, type EducationLevel } from '@shared/lib/applications';
import { formatDate } from '@shared/lib/dates';
import type { ApplicationDetail } from './ApplicationForm';

/**
 * One application: everything recorded, the documents with their review, and
 * the decision. Reviewers verify or reject each document here; approval is
 * offered only once every required document is verified, and asks — when a
 * student record may already exist — whether to link it or create a new one.
 *
 * The decision forms open inside the panel (not as a dialog on top of it),
 * so Escape, focus and scrolling stay simple.
 */

type Decision = null | 'approve' | 'return' | 'reject';

export default function ApplicationReview({ id, canReview, canUpdate, canManageDocuments, onClose, onEdit, onChanged }: {
  id: string | null;
  canReview: boolean;
  canUpdate: boolean;
  canManageDocuments: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  /** After any change: the message to show, and whether the list should reload. */
  onChanged: (message: string) => void;
}) {
  const [d, setD] = useState<ApplicationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>(null);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [link, setLink] = useState<string>('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [docReason, setDocReason] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (appId: string) => {
    const r = await api.get<ApplicationDetail>(`/api/v1/applications/${appId}`);
    if (!r.ok) { setLoadError(r.message); return null; }
    setD(r.data); setLoadError(null);
    return r.data;
  }, []);

  useEffect(() => {
    setD(null); setProblem(null); setDecision(null); setReason(''); setRemarks(''); setLink(''); setRejecting(null); setLoadError(null);
    if (id) void load(id);
  }, [id, load]);

  useEffect(() => {
    if (decision) requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ block: 'nearest' });
      panelRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    });
  }, [decision]);

  async function act(key: string, call: () => Promise<{ ok: boolean; message?: string; errors?: Record<string, string[]> }>, message: string) {
    if (busy || !d) return;
    setBusy(key); setProblem(null);
    const r = await call();
    setBusy(null);
    if (!r.ok) {
      setProblem(r.message ?? 'Something went wrong.');
      // The state may have moved on (someone else decided); show the latest.
      await load(d.id);
      return;
    }
    setDecision(null); setReason(''); setRemarks(''); setRejecting(null); setDocReason('');
    await load(d.id);
    onChanged(message);
  }

  const undecided = d?.status === 'submitted' || d?.status === 'under_review';
  const docsEditable = !!d && isEditable(d.status) && canManageDocuments;
  const number = d?.applicationNumber ?? 'The application';

  const footer = d && (canReview || canUpdate) ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canUpdate && isEditable(d.status) && (
        <button type="button" className={`${BTN_SECONDARY} mr-auto`} onClick={() => onEdit(d.id)}>Edit</button>
      )}
      {canReview && d.status === 'submitted' && (
        <button type="button" className={BTN_SECONDARY} disabled={!!busy} onClick={() => act('review', () => api.post(`/api/v1/applications/${d.id}/review`), `${number} is now under review.`)}>
          {busy === 'review' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Start Review
        </button>
      )}
      {canReview && undecided && (
        <>
          <button type="button" className={BTN_GHOST} disabled={!!busy} aria-expanded={decision === 'return'} onClick={() => setDecision(decision === 'return' ? null : 'return')}>Return</button>
          <button type="button" className={`${BTN_GHOST} text-red-700 hover:bg-red-50`} disabled={!!busy} aria-expanded={decision === 'reject'} onClick={() => setDecision(decision === 'reject' ? null : 'reject')}>Reject</button>
          <button type="button" className={BTN_PRIMARY} disabled={!!busy} aria-expanded={decision === 'approve'} onClick={() => setDecision(decision === 'approve' ? null : 'approve')}>
            <UserCheck className="h-4 w-4" aria-hidden="true" /> Approve
          </button>
        </>
      )}
    </div>
  ) : undefined;

  return (
    <Drawer open={id !== null} onClose={onClose} title={d ? `Application ${d.applicationNumber ?? ''}`.trim() : 'Application'} width="sm:max-w-2xl" footer={footer}>
      {!d && !loadError && <div className="flex items-center gap-2 py-12 text-sm text-[#647A73]" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</div>}
      {loadError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p>}
      {d && (
        <div className="space-y-6">
          {/* Who and where it stands */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-[#172B3A]">{d.fullName}</p>
              <p className={`text-sm ${MUTED}`}>{d.program.name} ({d.program.code}){d.schoolYear ? ` · SY ${d.schoolYear.label}` : ''}</p>
            </div>
            <Badge status={d.status} label={APPLICATION_STATUS_LABELS[d.status as ApplicationStatus] ?? d.status} />
          </div>

          {problem && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{problem}</p>}

          {d.status === 'approved' && d.student && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[#E7F7F0] px-4 py-3 text-sm text-[#08563F]">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Admitted as student <b>{d.student.studentNumber}</b>.
              <Link href={`/students/${d.student.id}/enrollment`} className="font-semibold underline underline-offset-2">Open enrollment</Link>
            </p>
          )}
          {(d.status === 'returned' || d.status === 'rejected' || (d.status === 'approved' && d.notes)) && d.notes && (
            <p className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${d.status === 'rejected' ? 'bg-red-50 text-red-800 ring-red-200' : d.status === 'returned' ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-slate-50 text-slate-700 ring-slate-200'}`}>
              <b>{d.status === 'approved' ? 'Remarks' : d.status === 'returned' ? 'Returned' : 'Rejected'}:</b> {d.notes}
            </p>
          )}

          <Section title="Timeline">
            <Pair label="Recorded" value={`${formatDate(d.createdAt)}${d.createdBy ? ` by ${d.createdBy}` : ''}`} />
            <Pair label="Submitted" value={d.submittedAt ? formatDate(d.submittedAt) : 'Not yet — draft'} />
            <Pair label="Reviewer" value={d.reviewer?.name ?? '—'} />
            <Pair label="Decision date" value={d.reviewedAt && ['approved', 'returned', 'rejected'].includes(d.status) ? formatDate(d.reviewedAt) : '—'} />
          </Section>

          <Section title="Applicant">
            <Pair label="Date of birth" value={d.dateOfBirth ? formatDate(d.dateOfBirth) : '—'} />
            <Pair label="Email" value={d.email ?? '—'} />
            <Pair label="Mobile number" value={d.phone ?? '—'} />
            <Pair label="Emergency contact" value={[d.emergencyContactName, d.emergencyContactPhone].filter(Boolean).join(' · ') || '—'} />
            <Pair label="Address" value={d.address ?? '—'} wide />
          </Section>

          <Section title="Educational background">
            <Pair label="Highest attainment" value={d.highestEducation ? EDUCATION_LABELS[d.highestEducation as EducationLevel] ?? d.highestEducation : '—'} />
            <Pair label="Previous school" value={d.previousSchool ?? '—'} />
            <Pair label="Year graduated" value={d.yearGraduated?.toString() ?? '—'} />
            {d.educationNotes && <Pair label="Notes" value={d.educationNotes} wide />}
          </Section>

          {/* Documents */}
          <section aria-labelledby="ar-docs">
            <div className="flex items-baseline justify-between gap-2">
              <h3 id="ar-docs" className="text-[13px] font-semibold uppercase tracking-wide text-[#647A73]">Requirements</h3>
              <p className={`text-xs ${MUTED}`}>{d.progress.handedIn}/{d.progress.total} handed in · {d.progress.verified} verified</p>
            </div>
            <ul className="mt-2 divide-y divide-[#E8EEEC] rounded-xl border border-[#E2EAE6]">
              {d.requirements.map((r) => {
                const handedIn = isHandedIn(r.status);
                return (
                  <li key={r.requirementId} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#172B3A]">{r.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.isRequired ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{r.isRequired ? 'Required' : 'Optional'}</span>
                      <Badge status={r.status} label={DOCUMENT_STATUS_LABELS[r.status as DocumentStatus] ?? r.status} />
                    </div>
                    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${MUTED}`}>
                      {r.file && r.documentId ? (
                        <a href={`/api/v1/application-documents/${r.documentId}/file?inline=1`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 font-medium text-[#087F5B] hover:underline ${RING}`}>
                          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{r.file.name}<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
                        </a>
                      ) : handedIn ? <span>Paper copy received</span> : r.status === 'pending' ? <span>Nothing handed in yet</span> : null}
                      {r.verifiedAt && <span>{r.status === 'verified' ? 'Verified' : 'Reviewed'} {formatDate(r.verifiedAt)}{r.verifiedBy ? ` by ${r.verifiedBy}` : ''}</span>}
                    </div>
                    {r.remarks && <p className="text-xs text-[#172B3A]"><span className={MUTED}>Remarks:</span> {r.remarks}</p>}
                    {docsEditable && (
                      rejecting === r.requirementId ? (
                        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(ev) => { ev.preventDefault(); void act(`doc-${r.requirementId}`, () => api.post(`/api/v1/applications/${d.id}/documents/${r.requirementId}/status`, { status: 'rejected', remarks: docReason }), `${r.name} was rejected.`); }}>
                          <label htmlFor={`ar-reason-${r.requirementId}`} className="sr-only">Reason for rejecting {r.name}</label>
                          <input id={`ar-reason-${r.requirementId}`} className={`${FIELD} mt-0 h-9`} placeholder="Reason, e.g. blurred copy" maxLength={500} required value={docReason} onChange={(ev) => setDocReason(ev.target.value)} />
                          <div className="flex gap-2">
                            <button type="submit" className={`${BTN_DANGER} h-9 px-3 text-[13px]`} disabled={!docReason.trim() || !!busy}>Reject</button>
                            <button type="button" className={`${BTN_SECONDARY} h-9 px-3 text-[13px]`} onClick={() => { setRejecting(null); setDocReason(''); }}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {handedIn && r.status !== 'verified' && (
                            <button type="button" className={`${BTN_SECONDARY} h-8 px-3 text-[13px]`} disabled={!!busy}
                              onClick={() => act(`doc-${r.requirementId}`, () => api.post(`/api/v1/applications/${d.id}/documents/${r.requirementId}/status`, { status: 'verified' }), `${r.name} was verified.`)}>
                              {busy === `doc-${r.requirementId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5 text-[#087F5B]" aria-hidden="true" />} Verify
                            </button>
                          )}
                          {(handedIn) && (
                            <button type="button" className={`${BTN_GHOST} h-8 px-2.5 text-[13px] text-red-700 hover:bg-red-50`} disabled={!!busy} onClick={() => { setRejecting(r.requirementId); setDocReason(''); }}>Reject</button>
                          )}
                          {(r.status === 'pending' || r.status === 'rejected') && (
                            <button type="button" className={`${BTN_GHOST} h-8 px-2.5 text-[13px]`} disabled={!!busy}
                              onClick={() => act(`doc-${r.requirementId}`, () => api.post(`/api/v1/applications/${d.id}/documents/${r.requirementId}/status`, { status: 'submitted' }), `${r.name}: paper copy received.`)}>
                              Mark received
                            </button>
                          )}
                          {r.status === 'verified' && (
                            <button type="button" className={`${BTN_GHOST} h-8 px-2.5 text-[13px]`} disabled={!!busy}
                              onClick={() => act(`doc-${r.requirementId}`, () => api.post(`/api/v1/applications/${d.id}/documents/${r.requirementId}/status`, { status: 'submitted' }), `${r.name} is back under review.`)}>
                              Undo verification
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </li>
                );
              })}
              {d.requirements.length === 0 && <li className={`px-4 py-3 text-sm ${MUTED}`}>No requirements apply to this program.</li>}
            </ul>
            {undecided && d.approvalProblems.length > 0 && (
              <p className={`mt-2 text-xs ${MUTED}`}>Approval opens once every required document is verified ({d.approvalProblems.length} to go).</p>
            )}
          </section>

          {/* The decision, opened from the footer */}
          {decision && undecided && (
            <section ref={panelRef} aria-labelledby="ar-decision" className="space-y-4 rounded-xl border border-[#C8EEDD] bg-[#F4FBF8] p-4">
              <h3 id="ar-decision" className="flex items-center gap-2 text-[15px] font-semibold text-[#172B3A]">
                <FileText className="h-4 w-4 text-[#087F5B]" aria-hidden="true" />
                {decision === 'approve' ? 'Approve application' : decision === 'return' ? 'Return to applicant' : 'Reject application'}
              </h3>

              {decision === 'approve' ? (
                d.approvalProblems.length > 0 ? (
                  <div className="space-y-2 text-sm text-[#172B3A]">
                    <p>Verify the required documents first:</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-red-800">{d.approvalProblems.map((p) => <li key={p}>{p}</li>)}</ul>
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={(ev) => {
                    ev.preventDefault();
                    const body = d.possibleStudents.length ? (link === 'new' ? { createNew: true } : { studentId: link }) : {};
                    void act('approve', () => api.post(`/api/v1/applications/${d.id}/approve`, { ...body, remarks: remarks.trim() || null }), `${number} was approved.`);
                  }}>
                    {d.possibleStudents.length > 0 ? (
                      <fieldset className="space-y-2">
                        <legend className="text-sm text-[#172B3A]"><b>A student record may already exist.</b> Link it, or create a new one.<Req /></legend>
                        {d.possibleStudents.map((s) => {
                          const sameProgram = s.programId === d.program.id;
                          return (
                            <label key={s.id} className={`flex items-start gap-2.5 rounded-lg border bg-white px-3 py-2.5 text-sm ${sameProgram ? 'cursor-pointer border-[#D6E2DD]' : 'cursor-not-allowed border-dashed border-[#D6E2DD] opacity-70'}`}>
                              <input type="radio" name="ar-link" value={s.id} checked={link === s.id} disabled={!sameProgram} onChange={() => setLink(s.id)} className="mt-0.5 h-4 w-4 text-[#087F5B] focus:ring-[#087F5B]" />
                              <span>
                                Link to <b>{s.studentNumber}</b> · {s.fullName} · {s.programCode} ({s.status}){s.email ? ` · ${s.email}` : ''}
                                {!sameProgram && <span className="block text-xs text-amber-800">In another program — cannot be linked to this application.</span>}
                              </span>
                            </label>
                          );
                        })}
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#D6E2DD] bg-white px-3 py-2.5 text-sm">
                          <input type="radio" name="ar-link" value="new" checked={link === 'new'} onChange={() => setLink('new')} className="mt-0.5 h-4 w-4 text-[#087F5B] focus:ring-[#087F5B]" />
                          <span>Create a new student record — this is a different person</span>
                        </label>
                      </fieldset>
                    ) : (
                      <p className="text-sm text-[#172B3A]">A new student record will be created for {d.fullName}.</p>
                    )}
                    <p className={`text-xs ${MUTED}`}>
                      The documents carry over to the student's checklist, and a <b>pending</b> enrollment is opened for {d.schoolYear ? `SY ${d.schoolYear.label}` : 'the current school year'} (unless one exists). Enrollment still needs its own approval in Enrollments.
                    </p>
                    <div>
                      <label htmlFor="ar-remarks" className={LABEL}>Remarks<Opt /></label>
                      <textarea id="ar-remarks" rows={2} maxLength={500} className={`${FIELD} h-auto py-2`} value={remarks} onChange={(ev) => setRemarks(ev.target.value)} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" className={BTN_SECONDARY} onClick={() => setDecision(null)}>Cancel</button>
                      <button type="submit" className={BTN_PRIMARY} disabled={!!busy || (d.possibleStudents.length > 0 && !link)}>
                        {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
                        {busy === 'approve' ? 'Approving…' : 'Confirm approval'}
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <form className="space-y-3" onSubmit={(ev) => {
                  ev.preventDefault();
                  const action = decision;
                  void act(action, () => api.post(`/api/v1/applications/${d.id}/${action}`, { reason }), action === 'return' ? `${number} was returned to the applicant.` : `${number} was rejected.`);
                }}>
                  <div>
                    <label htmlFor="ar-reason" className={LABEL}>{decision === 'return' ? 'What needs correcting' : 'Reason for rejecting'}<Req /></label>
                    <textarea id="ar-reason" rows={3} maxLength={500} required className={`${FIELD} h-auto py-2`} value={reason} onChange={(ev) => setReason(ev.target.value)}
                      placeholder={decision === 'return' ? 'e.g. Upload a clearer copy of the birth certificate.' : 'e.g. Does not meet the admission requirements.'} />
                    <p className={`mt-1 text-xs ${MUTED}`}>{decision === 'return' ? 'The application can be corrected and resubmitted.' : 'Rejection is final.'}</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className={BTN_SECONDARY} onClick={() => setDecision(null)}>Cancel</button>
                    <button type="submit" className={decision === 'reject' ? BTN_DANGER : BTN_PRIMARY} disabled={!reason.trim() || !!busy}>
                      {busy === decision && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {decision === 'return' ? 'Return application' : 'Reject application'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#647A73]">{title}</h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Pair({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className={`text-xs ${MUTED}`}>{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-[#172B3A]">{value}</dd>
    </div>
  );
}
