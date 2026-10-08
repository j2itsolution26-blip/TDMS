import { Card, PageShell } from '@/components/teaching/kit';
import { Page } from '@/lib/page-data';
import type { loadMyQr } from '@/server/controllers/pages/app/my/qr';

type Data = Awaited<ReturnType<typeof loadMyQr>>;

function View({ qr, svg }: Data) {
  return (
    <PageShell eyebrow="My Learning" title="My QR Code" description="Show this to your Diploma Instructor to record attendance, or to identify your answer sheet.">
      <Card className="mx-auto max-w-md">
        <div className="flex flex-col items-center pt-6 text-center">
          <div className="w-full max-w-[280px] rounded-2xl border border-tdms-hairline p-3" role="img" aria-label={`Attendance QR code for ${qr.name}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-4 text-xl font-bold text-tdms-ink">{qr.name}</p>
          <p className="text-sm text-tdms-muted">Student ID: <span className="tabular-nums">{qr.studentNumber}</span></p>
          <p className="text-sm text-tdms-muted">{qr.program}</p>
          <p className="mt-4 text-xs text-tdms-muted">Turn your screen brightness up for faster scanning. Keep this code to yourself — it identifies you.</p>
        </div>
      </Card>
    </PageShell>
  );
}

/** /my/qr */
export default function MyQrPage() {
  return <Page<Data> endpoint={'/my/qr'} render={(d) => <View {...d} />} />;
}
