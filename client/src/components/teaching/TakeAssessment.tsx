import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { BTN, Card, Chip, Flash, INPUT } from './kit';

interface Item {
  number: number;
  prompt: string | null;
  choices: string[] | null;
  correct?: string;
  given?: string;
  right?: boolean;
}

export interface StudentAssessment {
  id: string;
  kindLabel: string;
  title: string;
  subject: string;
  description: string | null;
  instructions: string | null;
  schedule: string | null;
  durationMinutes: number | null;
  totalItems: number;
  totalPoints: number;
  passingScore: number | null;
  phase: string;
  onlineEnabled: boolean;
  canStart: boolean;
  taking: boolean;
  submitted: boolean;
  deadline: string | null;
  released: boolean;
  points: number | null;
  percent: number | null;
  passed: boolean | null;
  items: Item[];
}

const LETTERS = 'ABCDEFGHIJ';

/**
 * Taking an assessment online. Answers are saved as they are chosen, the
 * countdown runs to the attempt's deadline, and at zero the attempt is handed
 * in automatically. The server enforces the window and the deadline; this
 * screen only reflects them.
 */
export default function TakeAssessment({ initial }: { initial: StudentAssessment }) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(initial.items.filter((i) => i.given).map((i) => [String(i.number), i.given!])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const submitted = useRef(false);

  const submit = useCallback(
    async (final: boolean, current: Record<string, string>) => {
      if (final) {
        if (submitted.current) return;
        submitted.current = true;
        setBusy(true);
      }
      const r = await api.post<{ submitted: boolean }>(`/api/v1/my/assessments/${a.id}/submit`, { answers: current, final });
      if (final) {
        setBusy(false);
        if (!r.ok) {
          submitted.current = false;
          setError(r.message);
          return;
        }
        router.refresh();
        setA((x) => ({ ...x, taking: false, submitted: true }));
      }
    },
    [a.id, router],
  );

  useEffect(() => {
    if (!a.taking || !a.deadline) return;
    const end = new Date(a.deadline).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) void submit(true, answers);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [a.taking, a.deadline, answers, submit]);

  function answer(n: number, value: string) {
    const next = { ...answers, [String(n)]: value };
    setAnswers(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void submit(false, next), 800);
  }

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api.post<StudentAssessment>(`/api/v1/my/assessments/${a.id}/start`);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setA(r.data);
  }

  const answered = Object.values(answers).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <Card>
        <dl className="grid grid-cols-2 gap-4 pt-5 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-tdms-muted">Schedule</dt><dd className="font-semibold">{a.schedule ?? 'Open'}</dd></div>
          <div><dt className="text-xs text-tdms-muted">Duration</dt><dd className="font-semibold">{a.durationMinutes ? `${a.durationMinutes} minutes` : '—'}</dd></div>
          <div><dt className="text-xs text-tdms-muted">Items · Points</dt><dd className="font-semibold tabular-nums">{a.totalItems} · {a.totalPoints}</dd></div>
          <div><dt className="text-xs text-tdms-muted">Passing score</dt><dd className="font-semibold tabular-nums">{a.passingScore ?? '—'}</dd></div>
        </dl>
        {a.instructions && <p className="mt-4 whitespace-pre-line rounded-xl bg-tdms-bg p-3 text-sm">{a.instructions}</p>}
        {a.description && !a.instructions && <p className="mt-4 whitespace-pre-line text-sm">{a.description}</p>}
      </Card>

      {error && <Flash kind="error">{error}</Flash>}

      {a.released && (
        <Card title="Your result">
          {a.points === null ? (
            <p className="text-sm text-tdms-muted">No score was recorded for you.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-tdms-bg p-3"><p className="text-xs font-semibold text-tdms-muted">Score</p><p className="text-2xl font-bold tabular-nums">{a.points} / {a.totalPoints}</p></div>
              <div className="rounded-xl bg-tdms-bg p-3"><p className="text-xs font-semibold text-tdms-muted">Percentage</p><p className="text-2xl font-bold tabular-nums">{a.percent}%</p></div>
              <div className="rounded-xl bg-tdms-bg p-3"><p className="text-xs font-semibold text-tdms-muted">Status</p><p className="mt-1">{a.passed === null ? '—' : <Chip status={a.passed ? 'PASSED' : 'FAILED'} label={a.passed ? 'PASSED' : 'FAILED'} />}</p></div>
            </div>
          )}
          {a.items.length > 0 && a.items.some((i) => i.given) && (
            <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Your answers">
              {a.items.map((i) => (
                <li key={i.number} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${i.right ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-800'}`}>
                  {i.right ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
                  {i.number}. {i.given || '—'}{!i.right && ` (key: ${i.correct})`}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {!a.released && a.submitted && <Flash kind="success">Submitted. Your score will appear here once your instructor releases the results.</Flash>}

      {!a.released && !a.submitted && !a.taking && (
        <Card>
          <div className="py-5">
            {a.canStart ? (
              <>
                <p className="text-sm">This {a.kindLabel.toLowerCase()} is open now.{a.durationMinutes ? ` Once you start, you have ${a.durationMinutes} minutes.` : ''} Your answers save as you go.</p>
                <button type="button" className={`${BTN} mt-4`} disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Start now'}</button>
              </>
            ) : (
              <p className="text-sm text-tdms-muted">
                {a.phase === 'SCHEDULED' ? `Opens ${a.schedule}.` : a.onlineEnabled ? 'This assessment is not open.' : 'This is taken on paper or in class. Your score appears here once released.'}
              </p>
            )}
          </div>
        </Card>
      )}

      {a.taking && (
        <>
          <div className="sticky top-2 z-20 flex items-center justify-between rounded-2xl border border-tdms-hairline bg-white px-4 py-3 shadow-soft" role="status" aria-live="polite">
            <span className="text-sm font-semibold">{answered} of {a.items.length} answered</span>
            {left !== null && <span className={`text-lg font-bold tabular-nums ${left < 60 ? 'text-red-700' : 'text-tdms-ink'}`} aria-label={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</span>}
          </div>
          <ol className="space-y-3">
            {a.items.map((i) => (
              <li key={i.number}>
                <Card>
                  <fieldset className="pt-5">
                    <legend className="text-sm font-semibold"><span className="mr-2 text-tdms-muted">{i.number}.</span>{i.prompt ?? `Item ${i.number}`}</legend>
                    {i.choices && i.choices.length > 0 ? (
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        {i.choices.map((c, idx) => {
                          const letter = LETTERS[idx]!;
                          const on = answers[String(i.number)] === letter;
                          return (
                            <label key={letter} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${on ? 'border-tdms-text bg-tdms-wash' : 'border-tdms-hairline hover:bg-tdms-bg'}`}>
                              <input type="radio" name={`q-${i.number}`} className="text-tdms-text focus:ring-tdms-text" checked={on} onChange={() => answer(i.number, letter)} />
                              <span className="font-bold">{letter}.</span> {c}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <input className={`${INPUT} mt-3`} aria-label={`Answer ${i.number}`} value={answers[String(i.number)] ?? ''} onChange={(e) => answer(i.number, e.target.value)} maxLength={255} />
                    )}
                  </fieldset>
                </Card>
              </li>
            ))}
          </ol>
          <button type="button" className={BTN} disabled={busy} onClick={() => { if (window.confirm(`Submit your answers? (${answered} of ${a.items.length} answered)`)) void submit(true, answers); }}>
            {busy ? 'Submitting…' : 'Submit answers'}
          </button>
        </>
      )}
    </div>
  );
}
