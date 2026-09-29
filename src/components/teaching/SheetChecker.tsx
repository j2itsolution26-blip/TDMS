'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, XCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import QrScanner from './QrScanner';
import { BTN, BTN_SECONDARY, Card, Chip, Field, INPUT } from './kit';

/**
 * ZipGrade-style checking, TDMS-style: identify the student by their QR (or
 * typed ID), key in the sheet's answers, and the server scores it against the
 * answer key. One sheet per student; a re-check must be asked for explicitly.
 */

interface CheckResult {
  student: { name: string; studentNumber: string };
  assessment: string;
  points: number;
  possible: number;
  percent: number;
  passed: boolean | null;
  correct: number;
  items: { number: number; given: string; correct: boolean }[];
  replaced: boolean;
}

export default function SheetChecker({ assessmentId, itemCount }: { assessmentId: string; itemCount: number }) {
  const [code, setCode] = useState('');
  const [answers, setAnswers] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [history, setHistory] = useState<CheckResult[]>([]);
  const answersRef = useRef<HTMLTextAreaElement>(null);
  const letters = answers.replace(/[\s,;]+/g, '');
  const numbered = /\d/.test(answers);

  async function check(replace = false) {
    if (!code.trim() || !answers.trim()) return;
    setBusy(true);
    setError(null);
    const r = await api.post<CheckResult>(`/api/assessments/${assessmentId}/check`, { code: code.trim(), answers, replace });
    setBusy(false);
    if (!r.ok) {
      setError({ message: r.message, code: r.code });
      return;
    }
    setResult(r.data);
    setHistory((h) => [r.data, ...h.filter((x) => x.student.studentNumber !== r.data.student.studentNumber)].slice(0, 30));
    setCode('');
    setAnswers('');
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-2">
        <Card title="1. Identify the student" description="Scan the QR on the answer sheet or ID, or type the student ID.">
          <QrScanner
            paused={busy}
            onCode={(c) => {
              setCode(c);
              setError(null);
              answersRef.current?.focus();
            }}
          />
          <Field label="Student ID / QR" htmlFor="chk-code" className="mt-4">
            <input id="chk-code" className={INPUT} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="e.g. 2026-000123" />
          </Field>
        </Card>
      </div>

      <div className="space-y-4 xl:col-span-3">
        <Card title="2. Key in the answers" description={`${itemCount} items. Type one letter per item in order (“-” for a blank), or numbered: “1A 2B 3C”.`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void check(false);
            }}
          >
            <label htmlFor="chk-answers" className="sr-only">Answers</label>
            <textarea
              id="chk-answers"
              ref={answersRef}
              rows={3}
              className={`${INPUT} font-mono text-base uppercase tracking-[0.2em]`}
              value={answers}
              onChange={(e) => setAnswers(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void check(false);
                }
              }}
              placeholder="ABCDA BCDDA …"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-tdms-muted">
              {numbered ? 'Numbered answers' : `${letters.length} of ${itemCount} answers entered`}. Press Enter to check.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="submit" className={BTN} disabled={busy || !code.trim() || !answers.trim()}>{busy ? 'Checking…' : 'Check sheet'}</button>
              {error?.code === 'ALREADY_CHECKED' && (
                <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => check(true)}>Replace existing score</button>
              )}
            </div>
          </form>
        </Card>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <CircleAlert className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <p className="text-sm font-semibold text-red-800">{error.message}</p>
          </div>
        )}

        {result && (
          <div role="status" aria-live="assertive" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="flex items-center gap-2 font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> {result.replaced ? 'Score replaced' : 'Sheet checked'}</p>
            <p className="mt-2 text-xl font-bold text-tdms-ink">{result.student.name}</p>
            <p className="text-sm text-tdms-muted">Student ID: <span className="tabular-nums">{result.student.studentNumber}</span></p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold text-tdms-muted">Score</p><p className="text-2xl font-bold tabular-nums">{result.points} / {result.possible}</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold text-tdms-muted">Percentage</p><p className="text-2xl font-bold tabular-nums">{result.percent}%</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold text-tdms-muted">Status</p><p className="mt-1">{result.passed === null ? <span className="text-sm">—</span> : <Chip status={result.passed ? 'PASSED' : 'FAILED'} label={result.passed ? 'PASSED' : 'FAILED'} />}</p></div>
            </div>
            <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Item results">
              {result.items.map((i) => (
                <li key={i.number} className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${i.correct ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-800'}`}>
                  {i.correct ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
                  {i.number}{i.given ? `:${i.given}` : ''}
                  <span className="sr-only">{i.correct ? 'correct' : 'wrong'}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {history.length > 0 && (
          <Card title="Checked this session" padded>
            <ul className="divide-y divide-tdms-hairline text-sm">
              {history.map((h) => (
                <li key={h.student.studentNumber} className="flex items-center justify-between py-2">
                  <span><span className="font-semibold">{h.student.name}</span> <span className="text-tdms-muted tabular-nums">· {h.student.studentNumber}</span></span>
                  <span className="tabular-nums font-semibold">{h.points} / {h.possible}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
