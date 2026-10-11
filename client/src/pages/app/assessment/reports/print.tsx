import { useEffect } from 'react';
import { Printer } from 'lucide-react';
import { Page } from '@/lib/page-data';
import { useDocumentTitle } from '@/lib/document-title';
import { RESULT_LABELS } from '@shared/lib/assessment-center';
import { rate } from '@/components/assessment/parts';
import type { loadAssessmentReportPrint } from '@/server/controllers/pages/app/assessment';

type Data = Awaited<ReturnType<typeof loadAssessmentReportPrint>>;

const cell = 'border border-slate-400 px-2 py-1 text-left align-top';

function Signature({ role }: { role: string }) {
  return (
    <div className="pt-10 text-center text-[12px]">
      <div className="mx-auto h-6 w-56 border-b border-slate-700" />
      <p className="mt-1 font-semibold">Signature over printed name</p>
      <p>{role}</p>
      <p className="mt-2">Date: ____________________</p>
    </div>
  );
}

/**
 * The batch result report, laid out for paper (A4/Letter, portrait). Opened
 * from Batch Result Reports in its own tab, outside the app shell; the
 * server records each opening in the audit log.
 */
function Report({ report }: Data) {
  useDocumentTitle('Assessment Batch Result Report');
  useEffect(() => {
    document.documentElement.style.background = 'white';
  }, []);
  const generated = new Date(report.generatedAt).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' });
  const range = [report.filters.from && `from ${report.filters.from}`, report.filters.to && `to ${report.filters.to}`].filter(Boolean).join(' ');

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] text-black print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-tdms-text px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0B6A45]">
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </button>
      </div>

      <header className="border-b-2 border-black pb-3 text-center">
        <p className="text-[16px] font-bold uppercase">{report.center.name}</p>
        {report.center.address && <p>{report.center.address}</p>}
        {report.center.accreditationNo && <p>Accreditation No. {report.center.accreditationNo}</p>}
        <h1 className="mt-3 text-[18px] font-bold uppercase tracking-wide">Assessment Batch Result Report</h1>
        <p className="text-[12px]">Generated {generated} by {report.generatedBy}{range ? ` · Assessment dates ${range}` : ''}</p>
      </header>

      {report.truncated && <p className="mt-3 font-semibold">Note: limited to the first 200 batches matching the filters.</p>}
      {report.batches.length === 0 && <p className="mt-6 text-center">No batches match the selected filters.</p>}

      {report.batches.map((b) => (
        <section key={b.batchId} className="mt-6 break-inside-avoid-page">
          <table className="mb-2 w-full text-[12px]">
            <tbody>
              <tr><td className="w-40 font-semibold">Batch number</td><td>{b.batchNumber}</td><td className="w-36 font-semibold">Assessment date</td><td>{b.assessmentDate}</td></tr>
              <tr><td className="font-semibold">Qualification</td><td>{b.qualification.code} — {b.qualification.name}</td><td className="font-semibold">Assessor</td><td>{b.assessorName}</td></tr>
              {b.venue && <tr><td className="font-semibold">Venue</td><td colSpan={3}>{b.venue}</td></tr>}
              {b.status === 'OPEN' && <tr><td colSpan={4} className="italic">Batch not yet finalized — pending results are not counted.</td></tr>}
            </tbody>
          </table>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-slate-100">
                <th className={cell}>#</th><th className={cell}>Candidate ID</th><th className={cell}>Full name</th><th className={cell}>Assessor</th><th className={cell}>Result</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={r.candidateId}>
                  <td className={cell}>{i + 1}</td>
                  <td className={cell}>{r.candidateId}</td>
                  <td className={cell}>{r.name}</td>
                  <td className={cell}>{r.assessorName}</td>
                  <td className={cell}>{r.result === 'PENDING' ? RESULT_LABELS.PENDING : `${RESULT_LABELS[r.result]} (${r.result})`}{r.attempt > 1 ? ` — attempt ${r.attempt}` : ''}</td>
                </tr>
              ))}
              {b.rows.length === 0 && <tr><td className={cell} colSpan={5}>No candidates.</td></tr>}
            </tbody>
          </table>
          <p className="mt-1 text-[12px]">
            Assessed (finalized): <b>{b.totals.assessed}</b> · Competent: <b>{b.totals.competent}</b> · Not Yet Competent: <b>{b.totals.notYetCompetent}</b> · Pending: <b>{b.totals.pending}</b> · Competency rate: <b>{rate(b.totals)}</b>
          </p>
        </section>
      ))}

      {report.batches.length > 1 && (
        <section className="mt-6 break-inside-avoid-page">
          <h2 className="mb-1 font-bold uppercase">Summary — all batches</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="bg-slate-100"><th className={cell}>Batches</th><th className={cell}>Assessed</th><th className={cell}>Competent</th><th className={cell}>Not Yet Competent</th><th className={cell}>Pending</th><th className={cell}>Competency rate</th></tr></thead>
            <tbody><tr><td className={cell}>{report.batches.length}</td><td className={cell}>{report.totals.assessed}</td><td className={cell}>{report.totals.competent}</td><td className={cell}>{report.totals.notYetCompetent}</td><td className={cell}>{report.totals.pending}</td><td className={cell}>{rate(report.totals)}</td></tr></tbody>
          </table>
        </section>
      )}

      <section className="mt-8 grid grid-cols-3 gap-6 break-inside-avoid-page">
        <div><p className="text-[12px] font-semibold">Prepared by:</p><Signature role="Assessor" /></div>
        <div><p className="text-[12px] font-semibold">Verified by:</p><Signature role="TVET Assessment Center Manager" /></div>
        <div><p className="text-[12px] font-semibold">Noted by:</p><Signature role="TVET Director" /></div>
      </section>
      <p className="mt-6 text-[11px] text-slate-600">Results are reported as Competent or Not Yet Competent only once finalized. Competency rate = Competent ÷ finalized results.</p>
    </div>
  );
}

/** /assessment/reports/print */
export default function AssessmentReportPrintPage() {
  return <Page<Data> endpoint="/assessment/reports/print" render={(d) => <Report {...d} />} />;
}
