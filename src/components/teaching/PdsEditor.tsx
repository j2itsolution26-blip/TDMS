'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import {
  CIVIL_STATUS_OPTIONS,
  EDUCATION_LEVELS,

  PDS_SECTION_LABELS,
  SEX_OPTIONS,
  TRAINING_TYPES,
  pdsCompletion,
  type PdsData,
  type PdsSection,
} from '@/lib/pds';
import { useAction } from './client-kit';
import { BTN, BTN_SMALL, Card, Field, Flash, FOCUS, INPUT } from './kit';

/**
 * The Personal Data Sheet — the Instructor's own editor, and (readOnly) the
 * Director's view. Completion is computed with the same rules the server uses.
 */

type Col = { key: string; label: string; type?: 'date' | 'select' | 'textarea' | 'number'; options?: readonly string[] };

const ROWS: Record<'education' | 'eligibility' | 'work' | 'training', { noun: string; cols: Col[] }> = {
  education: {
    noun: 'school',
    cols: [
      { key: 'level', label: 'Level', type: 'select', options: EDUCATION_LEVELS },
      { key: 'school', label: 'School' },
      { key: 'degree', label: 'Degree / course' },
      { key: 'yearGraduated', label: 'Year graduated' },
    ],
  },
  eligibility: {
    noun: 'eligibility',
    cols: [
      { key: 'eligibility', label: 'Eligibility' },
      { key: 'rating', label: 'Rating' },
      { key: 'examDate', label: 'Date of examination', type: 'date' },
      { key: 'examPlace', label: 'Place of examination' },
      { key: 'licenseNumber', label: 'License / certificate no.' },
      { key: 'licenseValidity', label: 'Valid until', type: 'date' },
    ],
  },
  work: {
    noun: 'position',
    cols: [
      { key: 'position', label: 'Position' },
      { key: 'employer', label: 'Employer' },
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To (blank if present)', type: 'date' },
      { key: 'salary', label: 'Salary / grade' },
      { key: 'status', label: 'Appointment status' },
      { key: 'relevant', label: 'Relevant experience', type: 'textarea' },
    ],
  },
  training: {
    noun: 'training',
    cols: [
      { key: 'title', label: 'Title' },
      { key: 'type', label: 'Type', type: 'select', options: TRAINING_TYPES },
      { key: 'provider', label: 'Provider' },
      { key: 'from', label: 'Date', type: 'date' },
      { key: 'to', label: 'Until', type: 'date' },
      { key: 'hours', label: 'Hours', type: 'number' },
      { key: 'certificate', label: 'Certificate' },
    ],
  },
};

export default function PdsEditor({ initial, readOnly = false, name, email }: { initial: PdsData; readOnly?: boolean; name: string; email: string }) {
  const [data, setData] = useState<PdsData>(initial);
  const [tab, setTab] = useState<PdsSection>('personal');
  const { busy, error, notice, run } = useAction();
  const completion = useMemo(() => pdsCompletion(data), [data]);
  const current = completion.sections.find((s) => s.section === tab)!;

  const personal = (k: keyof PdsData['personal']) => ({
    value: data.personal[k] ?? '',
    disabled: readOnly,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setData({ ...data, personal: { ...data.personal, [k]: e.target.value } }),
  });
  const person = (who: 'father' | 'mother' | 'spouse', k: 'name' | 'occupation') => ({
    value: data.family[who]?.[k] ?? '',
    disabled: readOnly,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setData({ ...data, family: { ...data.family, [who]: { ...data.family[who], [k]: e.target.value } } }),
  });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
      <aside className="space-y-4 xl:col-span-1">
        <Card title="Profile Completion">
          <p className="text-4xl font-bold tabular-nums text-tdms-ink">{completion.overall}%</p>
          <div role="progressbar" aria-label="Profile completion" aria-valuenow={completion.overall} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-tdms-bg">
            <span className="block h-full rounded-full bg-tdms-green" style={{ width: `${completion.overall}%` }} />
          </div>
          <ul className="mt-4 space-y-1" role="tablist" aria-label="PDS sections">
            {completion.sections.map((s) => (
              <li key={s.section}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === s.section}
                  onClick={() => setTab(s.section)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${FOCUS} ${tab === s.section ? 'bg-tdms-wash font-semibold text-tdms-deep' : 'hover:bg-tdms-bg'}`}
                >
                  <span>{s.label}</span>
                  {s.percent === 100 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="complete" /> : <span className="text-xs font-semibold tabular-nums text-amber-800">{s.percent}%</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </aside>

      <div className="space-y-4 xl:col-span-3">
        <Card title={PDS_SECTION_LABELS[tab]} description={current.missing.length ? `Missing: ${current.missing.slice(0, 6).join(', ')}${current.missing.length > 6 ? '…' : ''}` : 'Complete'}>
          {tab === 'personal' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Full name" htmlFor="p-name" hint="From your account — change it in My Profile.">
                <input id="p-name" className={INPUT} value={name} disabled />
              </Field>
              <Field label="Email" htmlFor="p-email">
                <input id="p-email" className={INPUT} value={email} disabled />
              </Field>
              <Field label="Employee ID" htmlFor="p-emp">
                <input id="p-emp" className={INPUT} value={data.employeeId} disabled={readOnly} onChange={(e) => setData({ ...data, employeeId: e.target.value })} />
              </Field>
              <Field label="Date of birth" htmlFor="p-dob"><input id="p-dob" type="date" className={INPUT} {...personal('dateOfBirth')} /></Field>
              <Field label="Place of birth" htmlFor="p-pob"><input id="p-pob" className={INPUT} {...personal('placeOfBirth')} /></Field>
              <Field label="Sex" htmlFor="p-sex">
                <select id="p-sex" className={INPUT} {...personal('sex')}><option value="">—</option>{SEX_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select>
              </Field>
              <Field label="Civil status" htmlFor="p-civil">
                <select id="p-civil" className={INPUT} {...personal('civilStatus')}><option value="">—</option>{CIVIL_STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select>
              </Field>
              <Field label="Citizenship" htmlFor="p-cit"><input id="p-cit" className={INPUT} {...personal('citizenship')} /></Field>
              <Field label="Contact number" htmlFor="p-phone"><input id="p-phone" type="tel" className={INPUT} {...personal('contactNumber')} /></Field>
              <Field label="Address" htmlFor="p-addr" className="sm:col-span-2 lg:col-span-3"><textarea id="p-addr" rows={2} className={INPUT} {...personal('address')} /></Field>
            </div>
          )}

          {tab === 'family' && (
            <div className="space-y-5">
              {(['father', 'mother', 'spouse'] as const).map((who) => (
                <fieldset key={who} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <legend className="mb-2 text-[13px] font-bold text-tdms-ink">{who === 'father' ? "Father's name" : who === 'mother' ? "Mother's maiden name" : 'Spouse (if any)'}</legend>
                  <Field label="Name" htmlFor={`f-${who}-name`}><input id={`f-${who}-name`} className={INPUT} {...person(who, 'name')} /></Field>
                  <Field label="Occupation" htmlFor={`f-${who}-occ`}><input id={`f-${who}-occ`} className={INPUT} {...person(who, 'occupation')} /></Field>
                </fieldset>
              ))}
              <RowEditor
                title="Children"
                noun="child"
                readOnly={readOnly}
                cols={[{ key: 'name', label: 'Name' }, { key: 'dateOfBirth', label: 'Date of birth', type: 'date' }]}
                rows={(data.family.children ?? []) as Record<string, string>[]}
                onChange={(rows) => setData({ ...data, family: { ...data.family, children: rows } })}
              />
              <Field label="Other family information" htmlFor="f-notes">
                <textarea id="f-notes" rows={2} className={INPUT} value={data.family.notes ?? ''} disabled={readOnly} onChange={(e) => setData({ ...data, family: { ...data.family, notes: e.target.value } })} />
              </Field>
            </div>
          )}

          {(tab === 'education' || tab === 'eligibility' || tab === 'work' || tab === 'training') && (
            <RowEditor
              noun={ROWS[tab].noun}
              readOnly={readOnly}
              cols={ROWS[tab].cols}
              rows={data[tab] as Record<string, string>[]}
              onChange={(rows) => setData({ ...data, [tab]: rows })}
            />
          )}
        </Card>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={BTN} disabled={busy} onClick={() => run(() => api.put('/api/instructor-profile', data), { success: 'Your PDS was saved.' })}>
              {busy ? 'Saving…' : 'Save PDS'}
            </button>
            <p className="text-xs text-tdms-muted">Only you and the TVET Director can see this sheet. Every time the Director opens it, that is recorded.</p>
          </div>
        )}
        {notice && <Flash kind="success">{notice}</Flash>}
        {error && <Flash kind="error">{error}</Flash>}
      </div>
    </div>
  );
}

function RowEditor({ title, noun, cols, rows, onChange, readOnly }: { title?: string; noun: string; cols: Col[]; rows: Record<string, string>[]; onChange: (rows: Record<string, string>[]) => void; readOnly: boolean }) {
  return (
    <div>
      {title && <h3 className="mb-2 text-[13px] font-bold text-tdms-ink">{title}</h3>}
      {rows.length === 0 && <p className="mb-3 text-sm text-tdms-muted">None recorded.</p>}
      <ol className="space-y-3">
        {rows.map((row, i) => (
          <li key={i} className="rounded-xl border border-tdms-hairline p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-tdms-muted">Entry {i + 1}</span>
              {!readOnly && (
                <button type="button" className={BTN_SMALL} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove entry ${i + 1}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cols.map((c) => {
                const id = `${noun}-${i}-${c.key}`;
                const common = {
                  id,
                  className: INPUT,
                  disabled: readOnly,
                  value: row[c.key] ?? '',
                  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(rows.map((r, j) => (j === i ? { ...r, [c.key]: e.target.value } : r))),
                };
                return (
                  <Field key={c.key} label={c.label} htmlFor={id} className={c.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                    {c.type === 'select' ? (
                      <select {...common}><option value="">—</option>{c.options!.map((o) => <option key={o}>{o}</option>)}</select>
                    ) : c.type === 'textarea' ? (
                      <textarea rows={2} {...common} />
                    ) : (
                      <input type={c.type ?? 'text'} {...common} />
                    )}
                  </Field>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {!readOnly && (
        <button type="button" className={`${BTN_SMALL} mt-3`} onClick={() => onChange([...rows, {}])}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add {noun}
        </button>
      )}
    </div>
  );
}

