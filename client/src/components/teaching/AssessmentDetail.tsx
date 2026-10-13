import { useMemo, useState } from 'react';
import Link from '@/lib/link';
import { useRouter } from '@/lib/navigation';
import { ScanLine } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import {
  ASSESSMENT_PHASE_LABELS,
  SCORE_STATUS_LABELS,
  type AssessmentKind,
  type AssessmentPhase,
  type ScoreStatus,
} from '@shared/lib/teaching';
import AssessmentForm from './AssessmentForm';
import { useAction } from './client-kit';
import { BTN, BTN_DANGER, BTN_SECONDARY, Card, Chip, Empty, FOCUS, Flash, INPUT, TD, TH, Table } from './kit';

interface Item {
  number: number;
  prompt: string | null;
  choices: string[] | null;
  answer: string;
  points: number;
}

interface Row {
  studentId: string;
  studentNumber: string;
  name: string;
  points: number | null;
  source: string | null;
  submitted: boolean;
  inProgress: boolean;
  percent: number | null;
  passed: boolean | null;
}

export interface AssessmentDetailData {
  assessment: {
    id: string;
    classId: string;
    kind: AssessmentKind;
    examType: string | null;
    title: string;
    description: string | null;
    instructions: string | null;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    schedule: string | null;
    durationMinutes: number | null;
    totalItems: number;
    totalPoints: number;
    passingScore: number | null;
    published: boolean;
    onlineEnabled: boolean;
    scoreStatus: string;
    phase: AssessmentPhase;
  };
  cls: { id: string; subject: string; detail: string; archived: boolean };
  items: Item[];
  rows: Row[];
}

const SOURCE: Record<string, string> = { ONLINE: 'Online', SHEET: 'Sheet', MANUAL: 'Entered' };

export default function AssessmentDetail({ data, classes }: { data: AssessmentDetailData; classes: { id: string; label: string }[] }) {
  const router = useRouter();
  const a = data.assessment;
  const draft = a.scoreStatus === 'DRAFT' && !data.cls.archived;
  const status = useAction();
  const [editing, setEditing] = useState(false);

  async function act(action: 'publish' | 'unpublish' | 'finalize' | 'release' | 'reopen', confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    await status.run(() => api.post(`/api/v1/assessments/${a.id}/status`, { action }), {
      success: { publish: 'Published — students have been notified.', unpublish: 'Unpublished.', finalize: 'Results finalized.', release: 'Results released — students can now see their scores.', reopen: 'Results reopened for changes.' }[action],
    });
  }

  async function remove() {
    if (!window.confirm('Delete this assessment? This cannot be undone.')) return;
    const ok = await status.run(() => api.del(`/api/v1/assessments/${a.id}`), { refresh: false });
    if (ok) router.push(`/teaching/${{ QUIZ: 'quizzes', EXAM: 'exams', ACTIVITY: 'activities', PT: 'performance-tasks' }[a.kind]}`);
  }

  const scored = data.rows.filter((r) => r.points !== null).length;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-start lg:justify-between">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-tdms-muted">Status</dt><dd className="mt-0.5"><Chip status={a.phase} label={ASSESSMENT_PHASE_LABELS[a.phase]} /></dd></div>
            <div><dt className="text-xs text-tdms-muted">Results</dt><dd className="mt-0.5"><Chip status={a.scoreStatus} label={SCORE_STATUS_LABELS[a.scoreStatus as ScoreStatus]} /></dd></div>
            <div><dt className="text-xs text-tdms-muted">Schedule</dt><dd className="font-semibold">{a.schedule ?? 'Not scheduled'}</dd></div>
            <div><dt className="text-xs text-tdms-muted">Duration</dt><dd className="font-semibold">{a.durationMinutes ? `${a.durationMinutes} minutes` : '—'}</dd></div>
            <div><dt className="text-xs text-tdms-muted">Items</dt><dd className="font-semibold tabular-nums">{a.totalItems}</dd></div>
            <div><dt className="text-xs text-tdms-muted">Total points</dt><dd className="font-semibold tabular-nums">{a.totalPoints}</dd></div>
            <div><dt className="text-xs text-tdms-muted">Passing score</dt><dd className="font-semibold tabular-nums">{a.passingScore ?? '—'}</dd></div>
            <div><dt className="text-xs text-tdms-muted">Scored</dt><dd className="font-semibold tabular-nums">{scored} / {data.rows.length}</dd></div>
          </dl>
          {!data.cls.archived && (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {draft && <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(true)}>Edit</button>}
              {draft && data.items.length > 0 && (
                <Link href={`/teaching/assessments/${a.id}/check`} className={BTN_SECONDARY}>
                  <ScanLine className="h-4 w-4" aria-hidden="true" /> Check sheets
                </Link>
              )}
              {a.scoreStatus === 'DRAFT' && !a.published && <button type="button" className={BTN} disabled={status.busy} onClick={() => act('publish')}>Publish to students</button>}
              {a.scoreStatus === 'DRAFT' && a.published && scored === 0 && <button type="button" className={BTN_SECONDARY} disabled={status.busy} onClick={() => act('unpublish')}>Unpublish</button>}
              {a.scoreStatus === 'DRAFT' && <button type="button" className={BTN} disabled={status.busy} onClick={() => act('finalize', 'Finalize the results? Scores are locked until you reopen them. Unfinished online attempts are handed in as they are.')}>Finalize results</button>}
              {a.scoreStatus === 'FINALIZED' && <button type="button" className={BTN_SECONDARY} disabled={status.busy} onClick={() => act('reopen')}>Reopen</button>}
              {a.scoreStatus === 'FINALIZED' && <button type="button" className={BTN} disabled={status.busy} onClick={() => act('release', 'Release the results? Each student will see their own score and be notified.')}>Release to students</button>}
              {a.scoreStatus === 'DRAFT' && !a.published && scored === 0 && <button type="button" className={BTN_DANGER} disabled={status.busy} onClick={remove}>Delete</button>}
            </div>
          )}
        </div>
        {(a.description || a.instructions) && (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-tdms-hairline pt-4 text-sm sm:grid-cols-2">
            {a.description && <div><p className="text-xs font-semibold text-tdms-muted">Description</p><p className="whitespace-pre-line">{a.description}</p></div>}
            {a.instructions && <div><p className="text-xs font-semibold text-tdms-muted">Instructions</p><p className="whitespace-pre-line">{a.instructions}</p></div>}
          </div>
        )}
        <div className="mt-4 space-y-2">
          {status.notice && <Flash kind="success">{status.notice}</Flash>}
          {status.error && <Flash kind="error">{status.error}</Flash>}
        </div>
      </Card>

      <AnswerKey assessmentId={a.id} items={data.items} totalItems={a.totalItems} editable={draft} online={a.onlineEnabled} />
      <ScoreSheet assessmentId={a.id} rows={data.rows} totalPoints={a.totalPoints} editable={draft} />

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit assessment" maxWidth="sm:max-w-3xl">
        <AssessmentForm
          kind={a.kind}
          classes={classes}
          assessmentId={a.id}
          initial={{ ...a, classId: a.classId }}
          onCancel={() => setEditing(false)}
        />
      </Modal>
    </div>
  );
}

// --- Answer key ------------------------------------------------------------------------

function AnswerKey({ assessmentId, items, totalItems, editable, online }: { assessmentId: string; items: Item[]; totalItems: number; editable: boolean; online: boolean }) {
  const { busy, error, notice, run } = useAction();
  const start = items.length > 0 ? items : Array.from({ length: totalItems }, (_, i) => ({ number: i + 1, prompt: null, choices: null, answer: '', points: 1 }));
  const [rows, setRows] = useState(() => start.map((i) => ({ ...i, choicesText: (i.choices ?? []).join('\n'), prompt: i.prompt ?? '' })));
  const [paste, setPaste] = useState('');
  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.points) || 0), 0), [rows]);

  function setCount(n: number) {
    setRows((prev) => {
      const next = prev.slice(0, n);
      for (let i = next.length; i < n; i += 1) next.push({ number: i + 1, prompt: '', choices: null, choicesText: '', answer: '', points: 1 });
      return next;
    });
  }

  function applyPaste() {
    const letters = paste.replace(/[\s,;]+/g, '').split('');
    setRows((prev) => {
      const n = Math.max(prev.length, letters.length);
      const next = [...prev];
      for (let i = 0; i < n; i += 1) {
        const existing = next[i] ?? { number: i + 1, prompt: '', choices: null, choicesText: '', answer: '', points: 1 };
        next[i] = { ...existing, number: i + 1, answer: letters[i] ? letters[i]!.toUpperCase() : existing.answer };
      }
      return next;
    });
    setPaste('');
  }

  async function save() {
    await run(
      () =>
        api.put<{ items: number; totalPoints: number; rescored: number }>(`/api/v1/assessments/${assessmentId}/key`, {
          items: rows.map((r) => ({
            number: r.number,
            prompt: r.prompt || null,
            choices: r.choicesText.trim() ? r.choicesText.split('\n').map((c) => c.trim()).filter(Boolean) : null,
            answer: r.answer,
            points: Number(r.points) || 1,
          })),
        }),
      { success: 'Answer key saved. Total points updated; any checked sheets were re-scored.' },
    );
  }

  return (
    <Card
      title="Answer Key"
      description={editable ? 'Type one answer per item, or paste a key like “ABCDA BCDDA”. Alternatives: “A|C”.' : 'Locked while results are finalized.'}
      actions={<span className="text-sm font-semibold tabular-nums">{rows.length} items · {total} pts</span>}
    >
      {editable && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Paste an answer key</span>
            <input className={INPUT} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste key: ABCDABCDAB…" />
          </label>
          <button type="button" className={BTN_SECONDARY} onClick={applyPaste} disabled={!paste.trim()}>Fill from key</button>
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            Items
            <input type="number" min={0} max={500} className={`${INPUT} w-24`} value={rows.length} onChange={(e) => setCount(Math.max(0, Math.min(500, Number(e.target.value) || 0)))} />
          </label>
        </div>
      )}
      {rows.length === 0 ? (
        <Empty title="No items yet" description="Set the number of items to start the key. Activities scored by hand do not need one." />
      ) : (
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <li key={r.number} className="rounded-xl border border-tdms-hairline p-3">
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-sm font-bold tabular-nums text-tdms-muted">{r.number}.</span>
                <label className="flex-1">
                  <span className="sr-only">Answer for item {r.number}</span>
                  <input className={`${INPUT} py-1.5 font-semibold uppercase`} value={r.answer} disabled={!editable} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} placeholder="Answer" />
                </label>
                <label className="w-20">
                  <span className="sr-only">Points for item {r.number}</span>
                  <input type="number" min={0.5} step="0.5" className={`${INPUT} py-1.5`} value={r.points} disabled={!editable} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))} />
                </label>
              </div>
              {online && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-tdms-text">Question and choices</summary>
                  <textarea rows={2} className={`${INPUT} mt-2 text-xs`} disabled={!editable} placeholder="Question" value={r.prompt} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))} aria-label={`Question ${r.number}`} />
                  <textarea rows={3} className={`${INPUT} mt-2 text-xs`} disabled={!editable} placeholder={'Choices, one per line (A, B, C…)\nLeave empty for a typed answer'} value={r.choicesText} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, choicesText: e.target.value } : x)))} aria-label={`Choices for question ${r.number}`} />
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={BTN} onClick={save} disabled={busy || rows.some((r) => !r.answer.trim())}>{busy ? 'Saving…' : 'Save answer key'}</button>
          {rows.some((r) => !r.answer.trim()) && <span className="text-xs text-tdms-muted">Every item needs an answer.</span>}
        </div>
      )}
      <div className="mt-3 space-y-2">
        {notice && <Flash kind="success">{notice}</Flash>}
        {error && <Flash kind="error">{error}</Flash>}
      </div>
    </Card>
  );
}

// --- Scores ------------------------------------------------------------------------------

function ScoreSheet({ assessmentId, rows, totalPoints, editable }: { assessmentId: string; rows: Row[]; totalPoints: number; editable: boolean }) {
  const { busy, error, notice, run } = useAction();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.studentId, r.points?.toString() ?? ''])));
  const [query, setQuery] = useState('');
  const changed = rows.filter((r) => (values[r.studentId] ?? '') !== (r.points?.toString() ?? ''));
  const invalid = changed.some((r) => {
    const v = values[r.studentId];
    return v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > totalPoints);
  });

  async function save() {
    await run(
      () => api.put(`/api/v1/assessments/${assessmentId}/scores`, { scores: changed.map((r) => ({ studentId: r.studentId, points: values[r.studentId] === '' ? null : Number(values[r.studentId]) })) }),
      { success: `Saved ${changed.length} ${changed.length === 1 ? 'score' : 'scores'}.` },
    );
  }

  const shown = rows.filter((r) => !query || `${r.name} ${r.studentNumber}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Card
      title="Scores"
      description={editable ? `Enter or edit scores out of ${totalPoints}. Students see them only after release.` : 'Scores are locked.'}
      padded={false}
      actions={editable ? <button type="button" className={BTN} onClick={save} disabled={busy || changed.length === 0 || invalid}>{busy ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}</button> : null}
    >
      <div className="space-y-2 px-5 pb-3 sm:px-6">
        <label className="block">
          <span className="sr-only">Find a student</span>
          <input className={INPUT} placeholder="Find a student…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {notice && <Flash kind="success">{notice}</Flash>}
        {error && <Flash kind="error">{error}</Flash>}
        {invalid && <Flash kind="error">A score must be between 0 and {totalPoints}.</Flash>}
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-5 sm:px-6"><Empty title="No students in this class" /></div>
      ) : (
        <Table
          label="Scores"
          head={
            <>
              <th scope="col" className={TH}>Student</th>
              <th scope="col" className={TH}>Score</th>
              <th scope="col" className={TH}>%</th>
              <th scope="col" className={TH}>Result</th>
              <th scope="col" className={TH}>Source</th>
            </>
          }
        >
          {shown.map((r) => (
            <tr key={r.studentId}>
              <td className={TD}>
                <span className="block font-semibold">{r.name}</span>
                <span className="text-xs text-tdms-muted tabular-nums">{r.studentNumber}</span>
              </td>
              <td className={`${TD} whitespace-nowrap`}>
                {editable ? (
                  <label className="inline-flex items-center gap-1.5">
                    <span className="sr-only">Score for {r.name}</span>
                    <input
                      type="number"
                      min={0}
                      max={totalPoints}
                      step="0.5"
                      inputMode="decimal"
                      className={`${INPUT} w-24 py-1.5 tabular-nums`}
                      value={values[r.studentId] ?? ''}
                      onChange={(e) => setValues({ ...values, [r.studentId]: e.target.value })}
                    />
                    <span className="text-tdms-muted">/ {totalPoints}</span>
                  </label>
                ) : (
                  <span className="tabular-nums">{r.points ?? '—'} / {totalPoints}</span>
                )}
              </td>
              <td className={`${TD} tabular-nums`}>{r.percent !== null ? `${r.percent}%` : '—'}</td>
              <td className={TD}>
                {r.passed === null ? (r.inProgress ? <Chip status="OPEN" label="Taking now" /> : <span className="text-xs text-tdms-muted">—</span>) : <Chip status={r.passed ? 'PASSED' : 'FAILED'} label={r.passed ? 'Passed' : 'Failed'} />}
              </td>
              <td className={`${TD} text-xs text-tdms-muted`}>{r.source ? SOURCE[r.source] ?? r.source : '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      <p className="px-5 pb-3 pt-2 text-xs text-tdms-muted sm:px-6">
        <Link href="/teaching/gradebook" className={`rounded font-semibold text-tdms-text hover:underline ${FOCUS}`}>Open the gradebook</Link> to see every assessment together.
      </p>
    </Card>
  );
}
