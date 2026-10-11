import Link from '@/lib/link';
import { CalendarDays, ClipboardCheck, FileText, Plus } from 'lucide-react';
import type { assessmentDashboard } from '@/server/services/assessment-center/options';
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@shared/lib/assessment-center';
import { BTN, BTN_SECONDARY, Card, Empty, FOCUS, Stat, TD, TH, Table } from '@/components/teaching/kit';
import { BatchStatusChip, TotalsCards, rate } from '@/components/assessment/parts';

type Data = Awaited<ReturnType<typeof assessmentDashboard>>;

/**
 * The TVET Assessment Center Manager's dashboard: work in progress, the
 * finalized record and what is coming up. Every figure is computed on the
 * server from the batches, results and calendar.
 */
export default function AssessmentDashboard({ data, firstName, greeting, date }: { data: Data; firstName: string; greeting: string; date: string }) {
  const { counts } = data;
  const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-tdms-text">{greeting}, {firstName} · {date}</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-tdms-ink sm:text-[28px]">Assessment Center</h1>
          <p className="mt-1 text-[15px] text-tdms-muted">Assessment batches, results, the training calendar and batch reports.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/assessment/results" className={BTN}><ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Results</Link>
          <Link href="/assessment/calendar" className={BTN_SECONDARY}><CalendarDays className="h-4 w-4" aria-hidden="true" /> Calendar</Link>
          <Link href="/assessment/reports" className={BTN_SECONDARY}><FileText className="h-4 w-4" aria-hidden="true" /> Reports</Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open batches" value={counts.openBatches} hint="Results being recorded" tone="info" />
        <Stat label="Finalized batches" value={counts.finalizedBatches} tone="success" hint="Official and locked" />
        <Stat label="Awaiting a result" value={counts.awaitingResults} tone={counts.awaitingResults ? 'attention' : undefined} hint="Enrolled, nothing recorded" />
        <Stat label="Awaiting finalization" value={counts.awaitingFinalization} tone={counts.awaitingFinalization ? 'attention' : undefined} hint="Recorded as drafts" />
      </div>

      <section aria-labelledby="overall-heading" className="space-y-3">
        <h2 id="overall-heading" className="text-[15px] font-bold text-tdms-ink">All batches — finalized results</h2>
        <TotalsCards totals={data.overall} />
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Card title="Recent batches" actions={<Link href="/assessment/results" className={`text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>View all</Link>} padded={false}>
            {data.recent.length === 0 ? (
              <div className="p-6"><Empty title="No batches yet" description="Create the first batch from Assessment Results." action={<Link href="/assessment/results" className={BTN}><Plus className="h-4 w-4" aria-hidden="true" /> Go to results</Link>} /></div>
            ) : (
              <Table label="Recent batches" head={<><th className={TH}>Batch</th><th className={TH}>Qualification</th><th className={TH}>Date</th><th className={TH}>Status</th><th className={`${TH} text-right`}>C / NYC / Pending</th><th className={`${TH} text-right`}>Rate</th></>}>
                {data.recent.map((b) => (
                  <tr key={b.id}>
                    <td className={TD}><Link href={`/assessment/batches/${b.id}`} className={`font-semibold text-tdms-text hover:underline ${FOCUS}`}>{b.batchNumber}</Link></td>
                    <td className={TD}>{b.qualification}</td>
                    <td className={`${TD} tabular-nums`}>{b.assessmentDate}</td>
                    <td className={TD}><BatchStatusChip status={b.status} /></td>
                    <td className={`${TD} text-right tabular-nums`}>{b.totals.competent} / {b.totals.notYetCompetent} / {b.totals.pending}</td>
                    <td className={`${TD} text-right font-semibold tabular-nums`}>{rate(b.totals)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
        <div className="xl:col-span-2">
          <Card title="Next 14 days" actions={<Link href="/assessment/calendar?view=agenda" className={`text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>Agenda</Link>}>
            {data.upcoming.length === 0 ? (
              <p className="pb-2 text-sm text-tdms-muted">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-tdms-hairline">
                {data.upcoming.map((a) => (
                  <li key={a.id} className="py-3">
                    <p className="font-semibold text-tdms-ink">{a.title}</p>
                    <p className="text-[13px] text-tdms-muted">{ACTIVITY_TYPE_LABELS[a.activityType as ActivityType]} · {when(a.startsAt)}{a.venue ? ` · ${a.venue}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
